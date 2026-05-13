import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient, Binary } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri!);

// PDF lab reports posíláme jako base64 v JSON. Vercel sám má strop ~4.5 MB na request,
// což po base64 overheadu znamená ~3 MB PDF – pro běžné lab reporty bohatě stačí.
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!mongoUri) return res.status(500).json({ error: 'Missing MONGODB_URI' });

  try {
    await client.connect();
    const col = client.db('food_notes').collection('blood_tests');

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      const download = String(req.query.download ?? '') === '1';

      if (date && download) {
        const doc = await col.findOne({ date });
        if (!doc?.data) return res.status(404).json({ error: 'Not found.' });
        const buf = (doc.data as Binary).buffer;
        res.setHeader('Content-Type', doc.contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename || `blood-${date}.pdf`)}"`);
        res.setHeader('Content-Length', String(buf.length));
        return res.send(Buffer.from(buf));
      }

      // bez query: seznam metadat (bez binárky)
      const all = await col
        .find({}, { projection: { data: 0 } })
        .sort({ date: -1 })
        .toArray();
      return res.json(
        all.map((d) => ({
          date: d.date,
          filename: d.filename ?? null,
          size: d.size ?? null,
          uploadedAt: d.uploadedAt ?? null,
        }))
      );
    }

    if (req.method === 'POST') {
      const { date, filename, contentBase64, contentType } = (req.body ?? {}) as {
        date?: string;
        filename?: string;
        contentBase64?: string;
        contentType?: string;
      };
      if (!date || !filename || !contentBase64) {
        return res.status(400).json({ error: 'date, filename and contentBase64 are required.' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
      }
      const buf = Buffer.from(contentBase64, 'base64');
      if (!buf.length) return res.status(400).json({ error: 'Empty file.' });

      await col.updateOne(
        { date },
        {
          $set: {
            filename,
            contentType: contentType || 'application/pdf',
            size: buf.length,
            data: new Binary(buf),
            uploadedAt: new Date(),
          },
        },
        { upsert: true }
      );
      return res.json({ success: true, date, filename, size: buf.length });
    }

    if (req.method === 'DELETE') {
      const date = String(req.query.date ?? '').trim();
      if (!date) return res.status(400).json({ error: 'Date is required.' });
      await col.deleteOne({ date });
      return res.json({ success: true, date });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
