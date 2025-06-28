import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

dotenv.config();
const app = express();
app.use(express.static('public'));

app.use(cors({
  origin: 'https://www.profiausbau.com',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// API-Endpoint für den Chat
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  // 1️⃣ FAQ-Suche
  let faqData = [];
  try {
    const rawFaq = fs.readFileSync(path.resolve('faq.json'), 'utf-8');
    faqData = JSON.parse(rawFaq);
  } catch (err) {
    console.warn('⚠️ FAQ konnte nicht geladen werden:', err.message);
  }

  const match = faqData.find(f =>
    message.toLowerCase().includes(f.frage.toLowerCase())
  );

  if (match) {
    console.log('✅ FAQ-Antwort gefunden:', match.antwort);
    return res.json({ reply: match.antwort });
  }

  // 2️⃣ OpenAI-Fallback
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Du agierst als digitaler Assistent der Profiausbau Aachen GmbH und antwortest im Namen des Unternehmens wie ein Mitarbeiter.
            
Sprich professionell und freundlich. Sei klar, kurz und informativ. Nutze nur bekannte Inhalte.

Wenn du etwas nicht weißt, bitte höflich um direkte Kontaktaufnahme:
📧 info@profiausbau.com
📞 +49 173 592 37 48`
          },
          {
            role: 'assistant',
            content: 'Willkommen bei Profiausbau Aachen GmbH! 👷‍♂️ Wie kann ich Ihnen helfen? aber nur heute'
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const botReply = response.data.choices?.[0]?.message?.content;
    if (!botReply) {
      return res.status(500).json({ error: 'Antwort war leer.' });
    }

    res.json({ reply: botReply });

  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Fehler bei der Kommunikation mit OpenAI.',
      details: err.response?.data || err.message
    });
  }
});

// FAQ-Daten abrufen
app.get('/api/faq', (req, res) => {
  try {
    const data = fs.readFileSync(path.resolve('faq.json'), 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'FAQ konnte nicht geladen werden' });
  }
});

// FAQ-Daten speichern
app.post('/api/faq', (req, res) => {
  try {
    fs.writeFileSync(path.resolve('faq.json'), JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'FAQ konnte nicht gespeichert werden' });
  }
});

// Server starten
app.listen(3000, () => {
  console.log('✅ Profiausbau-Chatbot läuft auf Port 3000');
});
