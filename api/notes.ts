import { VercelRequest, VercelResponse } from '@vercel/node';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      res.json({ date, text: note?.text ?? '' });
    } else if (req.method === 'POST') {
      const { date, text } = req.body as { date?: string; text?: string };
      if (!date || typeof text !== 'string') {
        return res.status(400).json({ error: 'Both date and text are required.' });
      }
      await notes.updateOne(
        { date },
        { $set: { text, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ success: true, date, text });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}