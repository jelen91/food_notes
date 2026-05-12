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
      res.json({ date, entries: note?.entries ?? [] });
    } else if (req.method === 'POST') {
      const { date, entries } = req.body as { date?: string; entries?: Array<{ time: string; note: string }> };
      if (!date || !Array.isArray(entries)) {
        return res.status(400).json({ error: 'Both date and entries array are required.' });
      }
      await notes.updateOne(
        { date },
        { $set: { entries, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ success: true, date, entries });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}