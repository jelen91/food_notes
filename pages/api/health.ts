import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri!);

// Volné pole - cokoli, co pošle Apple Shortcut (kalorie, cvičení, spánek, kroky, tep, ...)
type Health = Record<string, number | string>;

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
      res.json({ date, health: note?.health ?? null });
    } else if (req.method === 'POST') {
      const { date, health } = req.body as { date?: string; health?: Health };
      if (!date || !health || typeof health !== 'object' || Array.isArray(health)) {
        return res.status(400).json({ error: 'Both date and health object are required.' });
      }
      await notes.updateOne(
        { date },
        { $set: { health, healthUpdatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ success: true, date, health });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
