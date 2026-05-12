import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!mongoUri) {
    return res.status(500).json({ error: 'Missing MONGODB_URI' });
  }

  try {
    await client.connect();
    const db = client.db('food_notes');
    const notes = db.collection('daily_notes');

    if (req.method === 'GET') {
      const date = String(req.query.date ?? '').trim();
      if (!date) {
        return res.status(400).json({ error: 'Date is required.' });
      }
      const note = await notes.findOne({ date });
      res.json({ date, entries: note?.entries ?? [], health: note?.health ?? null });
    } else if (req.method === 'POST') {
      const { date, entries } = req.body as {
        date?: string;
        entries?: Array<{ time?: string; note?: string; gas?: unknown; pressure?: unknown }>;
      };
      if (!date || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'Both date and entries array are required.' });
      }
      // 1–5 celé číslo, jinak symptom vynechán
      const level = (v: unknown): number | undefined => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : undefined;
      };
      const cleanEntries = entries.map((e) => {
        const entry: { time: string; note: string; gas?: number; pressure?: number } = {
          time: String(e?.time ?? ''),
          note: String(e?.note ?? ''),
        };
        const gas = level(e?.gas);
        const pressure = level(e?.pressure);
        if (gas !== undefined) entry.gas = gas;
        if (pressure !== undefined) entry.pressure = pressure;
        return entry;
      });
      await notes.updateOne(
        { date },
        { $set: { entries: cleanEntries, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ success: true, date, entries: cleanEntries });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}