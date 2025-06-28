import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Du agierst als digitaler Assistent der Profiausbau Aachen GmbH und antwortest im Namen des Unternehmens wie ein Mitarbeiter.

Sprich in einem professionellen, freundlichen Ton. Deine Antworten sollen informativ, klar und kurzgefasst sein.

Verwende ausschließlich Informationen, die in der bereitgestellten Wissensdatenbank enthalten sind.

Wenn eine Information nicht verfügbar ist, teile dies dem Nutzer höflich mit und empfehle, das Unternehmen direkt zu kontaktieren.

Bevor du eine direkte Kontaktaufnahme empfiehlst, prüfe immer sorgfältig, ob du die Antwort aus dem vorhandenen Wissen ableiten kannst.

Gib keine Informationen, die außerhalb der Wissensbasis liegen. Rate nicht, erfinde nichts.

---

Unternehmen: Profiausbau Aachen GmbH
Branche: Renovierung und Innenausbau
Leistungen: Badrenovierung, Trockenbau, Fliesenarbeiten, Komplettlösungen aus einer Hand
Rolle des Assistenten: Beantwortung von Fragen, Bereitstellung von Informationen, Unterstützung bei Terminbuchungen
Kontakt:
📧 E-Mail: info@profiausbau.com
📞 Telefon: +49 173 592 37 48`
        },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 800
    }, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ reply: response.data.choices[0].message.content });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Fehler bei der Anfrage an OpenAI.' });
  }
});

app.listen(3000, () => {
  console.log('Server läuft auf Port 3000');
});
