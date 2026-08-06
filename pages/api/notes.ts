import { NextApiRequest, NextApiResponse } from 'next';
import { getDb, DAYS } from '../../lib/db';
import { isValidDate, normalizeEntries, normalizeScales } from '../../lib/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = await getDb();
    const days = db.collection(DAYS);

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      const doc = await days.findOne({ date });
      // Staré záznamy stravovacího deníku se normalizují na aktuální model až při čtení.
      return res.json({
        date,
        entries: normalizeEntries(doc?.entries),
        scales: normalizeScales(doc?.scales),
        health: doc?.health ?? null,
        healthUnits: doc?.healthUnits ?? null,
        workouts: doc?.workouts ?? null,
      });
    }

    if (req.method === 'POST') {
      const { date, entries, scales } = req.body ?? {};
      if (!isValidDate(date)) return res.status(400).json({ error: 'Date (YYYY-MM-DD) is required.' });
      if (entries === undefined && scales === undefined) {
        return res.status(400).json({ error: 'Nothing to save – send entries and/or scales.' });
      }

      // Částečný zápis: pošle se jen to, co se mění (události nebo škály).
      const update: Record<string, unknown> = { updatedAt: new Date() };
      let cleanEntries;
      let cleanScales;
      if (entries !== undefined) {
        cleanEntries = normalizeEntries(entries);
        update.entries = cleanEntries;
      }
      if (scales !== undefined) {
        cleanScales = normalizeScales(scales);
        update.scales = cleanScales;
      }

      await days.updateOne({ date }, { $set: update }, { upsert: true });
      return res.json({ success: true, date, entries: cleanEntries, scales: cleanScales });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
