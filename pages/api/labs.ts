import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireWrite } from '../../lib/apiAuth';
import { audit, deleteLab, getLab, getLabPdf, listLabs, saveLab } from '../../lib/store';
import { isValidDate, normalizeLabMeta, normalizeLabValues } from '../../lib/schema';

// PDF laboratorních zpráv chodí jako base64 v JSON. Vercel má strop ~4.5 MB na request.
export const config = {
  api: {
    bodyParser: { sizeLimit: '8mb' },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireTenant(req, res);
    if (!ctx) return;
    const tenantId = ctx.config.id;
    const dek = ctx.dek;

    if (ctx.config.modules?.labs === false) {
      return res.status(404).json({ error: 'Modul laboratoří není pro tuto aplikaci zapnutý.' });
    }

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      const download = String(req.query.download ?? '') === '1';

      if (date && download) {
        if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
        const pdf = await getLabPdf(tenantId, dek, date);
        if (!pdf) return res.status(404).json({ error: 'Not found.' });
        res.setHeader('Content-Type', pdf.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(pdf.filename)}"`);
        res.setHeader('Content-Length', String(pdf.bytes.length));
        return res.send(pdf.bytes);
      }

      if (date) {
        if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });
        return res.json(await getLab(tenantId, dek, date));
      }

      return res.json(await listLabs(tenantId, dek));
    }

    if (req.method === 'POST') {
      if (!requireWrite(ctx, res)) return;
      const { date, meta, values, filename, contentBase64, contentType } = (req.body ?? {}) as Record<string, any>;
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD.' });

      const cleanValues = normalizeLabValues(values);
      const cleanMeta = normalizeLabMeta(meta);

      let pdf: { filename: string; contentType: string; bytes: Buffer } | undefined;
      if (typeof contentBase64 === 'string' && contentBase64.length > 0) {
        const bytes = Buffer.from(contentBase64, 'base64');
        if (!bytes.length) return res.status(400).json({ error: 'Empty file.' });
        pdf = {
          bytes,
          filename: String(filename || `lab-${date}.pdf`).slice(0, 200),
          contentType: contentType || 'application/pdf',
        };
      }

      if (!cleanValues.length && !pdf) {
        const existing = await getLab(tenantId, dek, date);
        if (!existing) return res.status(400).json({ error: 'Vyplň aspoň jednu hodnotu nebo nahraj PDF.' });
      }

      await saveLab(tenantId, dek, date, { meta: cleanMeta, values: cleanValues, pdf });
      return res.json({ success: true, date, values: cleanValues.length, hasPdf: Boolean(pdf) });
    }

    if (req.method === 'DELETE') {
      if (!requireWrite(ctx, res)) return;
      const date = String(req.query.date ?? '').trim();
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      await deleteLab(tenantId, date);
      await audit(tenantId, 'lab.delete', { date });
      return res.json({ success: true, date });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
