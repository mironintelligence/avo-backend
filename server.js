// =======================
// ENV ÖNCE YÜKLENİR
// =======================
import dotenv from "dotenv";
dotenv.config();

// =======================
import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import pkg from "pg";
const { Pool } = pkg;

// =======================
// POSTGRES BAĞLANTISI
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// DB Test
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.log("❌ DB Bağlantı HATASI:", err);
  } else {
    console.log("✅ DB Bağlandı:", res.rows[0]);
  }
});

// =======================
// EXPRESS
// =======================
const app = express();

// CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// =======================
// PROXY STYLE CORS FIX (Render için şart)
// =======================
app.use("/api", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// =======================
// IP LIMIT SISTEMI
// =======================
const ipLimits = {}; // { ip: { petitions, lastReset } }

// 24 saatlik reset
setInterval(() => {
  const now = Date.now();
  for (const ip in ipLimits) {
    if (now - ipLimits[ip].lastReset > 24 * 60 * 60 * 1000) {
      delete ipLimits[ip];
    }
  }
}, 60 * 60 * 1000);

// Middleware
function checkIpLimit(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!ipLimits[ip]) {
    ipLimits[ip] = {
      petitions: 0,
      lastReset: Date.now(),
    };
  }

  if (ipLimits[ip].petitions >= 5) {
    return res.json({
      error: true,
      message: "⚠ Ücretsiz 5 dilekçe hakkınızı doldurdunuz.",
      allowed: false,
    });
  }

  next();
}

// =======================
// OPENAI CLIENT
// =======================
const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =======================
// DİLEKÇE ENDPOINT
// =======================
app.post("/api/petition", checkIpLimit, async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  try {
    const { prompt } = req.body;

    const completion = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Türk hukuki dilekçe formatında yaz." },
        { role: "user", content: prompt },
      ],
    });

    ipLimits[ip].petitions++;

    res.json({
      error: false,
      reply: completion.choices[0].message.content,
      remaining: 5 - ipLimits[ip].petitions,
    });
  } catch (err) {
    console.error("PETITION ERROR:", err);
    res.status(500).json({ reply: "Dilekçe oluşturulamadı." });
  }
});

// =======================
// SOHBET ENDPOINT
// =======================
app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    const completion = await ai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("CHAT ERROR:", err);
    res.status(500).json({ reply: "Bir hata oluştu." });
  }
});

// =======================
// SERVER START
// =======================
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("🚀 Backend çalışıyor, Port:", PORT);
});