import { NextApiRequest, NextApiResponse } from 'next';
import { Binary } from 'mongodb';
import { getDb, LABS } from '../../lib/db';
import { isValidDate, normalizeLabMeta, normalizeLabValues } from '../../lib/schema';

// PDF laboratorních zpráv posíláme jako base64 v JSON. Vercel má strop ~4.5 MB na request,
// což po base64 overheadu znamená ~3 MB PDF – pro běžné lab reporty stačí.
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
  },
};

function toPublic(d: any) {
  return {
    date: d.date,
    meta: d.meta ?? {},
    values: d.values ?? [],
    filename: d.filename ?? null,
    size: d.size ?? null,
    uploadedAt: d.uploadedAt ?? null,
    hasPdf: Boolean(d.filename),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const col = (await getDb()).collection(LABS);

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      const download = String(req.query.download ?? '') === '1';

      if (date && download) {
        const doc = await col.findOne({ date });
        if (!doc?.data) return res.status(404).json({ error: 'Not found.' });
        const buf = Buffer.from((doc.data as Binary).buffer);
        res.setHeader('Content-Type', doc.contentType || 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(doc.filename || `lab-${date}.pdf`)}"`
        );
        res.setHeader('Content-Length', String(buf.length));
        return res.send(buf);
      }

      if (date) {
        const doc = await col.findOne({ date }, { projection: { data: 0 } });
        return res.json(doc ? toPublic(doc) : null);
      }

      const all = await col.find({}, { projection: { data: 0 } }).sort({ date: -1 }).toArray();
      return res.json(all.map(toPublic));
    }

    if (req.method === 'POST') {
      const { date, meta, values, filename, contentBase64, contentType } = (req.body ?? {}) as Record<string, any>;
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });

      const cleanValues = normalizeLabValues(values);
      const cleanMeta = normalizeLabMeta(meta);
      const set: Record<string, unknown> = { meta: cleanMeta, values: cleanValues, updatedAt: new Date() };

      // PDF je volitelné – když nepřijde, zůstane to, co už je uložené.
      if (typeof contentBase64 === 'string' && contentBase64.length > 0) {
        const buf = Buffer.from(contentBase64, 'base64');
        if (!buf.length) return res.status(400).json({ error: 'Empty file.' });
        set.data = new Binary(buf);
        set.size = buf.length;
        set.filename = String(filename || `lab-${date}.pdf`).slice(0, 200);
        set.contentType = contentType || 'application/pdf';
        set.uploadedAt = new Date();
      }

      if (!cleanValues.length && !set.data) {
        const existing = await col.findOne({ date }, { projection: { data: 0 } });
        if (!existing) {
          return res.status(400).json({ error: 'Vyplň aspoň jednu hodnotu nebo nahraj PDF.' });
        }
      }

      await col.updateOne({ date }, { $set: set }, { upsert: true });
      return res.json({ success: true, date, values: cleanValues.length, hasPdf: Boolean(set.data) });
    }

    if (req.method === 'DELETE') {
      const date = String(req.query.date ?? '').trim();
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      if (String(req.query.pdfOnly ?? '') === '1') {
        await col.updateOne({ date }, { $unset: { data: '', filename: '', size: '', contentType: '', uploadedAt: '' } });
        return res.json({ success: true, date, removed: 'pdf' });
      }
      await col.deleteOne({ date });
      return res.json({ success: true, date, removed: 'all' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
