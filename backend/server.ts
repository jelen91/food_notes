import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("Missing MONGODB_URI in environment.");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const client = new MongoClient(mongoUri);

async function main() {
  await client.connect();
  const db = client.db("food_notes");
  const notes = db.collection("daily_notes");

  app.get("/api/notes", async (req, res) => {
    const date = String(req.query.date ?? "").trim();
    if (!date) {
      return res.status(400).json({ error: "Date is required." });
    }
    const note = await notes.findOne({ date });
    res.json({ date, text: note?.text ?? "" });
  });

  app.post("/api/notes", async (req, res) => {
    const { date, text } = req.body as { date?: string; text?: string };
    if (!date || typeof text !== "string") {
      return res.status(400).json({ error: "Both date and text are required." });
    }
    await notes.updateOne(
      { date },
      { $set: { text, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ success: true, date, text });
  });

  app.get("/api/report", async (_req, res) => {
    const allNotes = await notes
      .find()
      .sort({ date: 1 })
      .toArray();
    res.json(allNotes);
  });

  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
