import { NextApiRequest, NextApiResponse } from 'next';
import { MongoClient } from 'mongodb';

const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!mongoUri) {
    return res.status(500).json({ error: 'Missing MONGODB_URI' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await client.connect();
    const db = client.db('food_notes');
    const notes = db.collection('daily_notes');

    const allNotes = await notes
      .find()
      .sort({ date: 1 })
      .toArray();
    res.json(allNotes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}