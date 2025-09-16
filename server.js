// server.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import axios from 'axios';
import { fileURLToPath } from 'url';

// Optional: express-rate-limit (nur wenn installiert)
const rateLimit = (await import('express-rate-limit').catch(() => ({ default: null }))).default;

const app = express();
app.use(express.json());
app.set('trust proxy', 1); // richtige IP hinter Proxy

// --- CORS: nur erlaubte Origins
const allowedOrigins = [
  'https://www.baumaschinen-mueller.de',
  'https://baumaschinen-mueller.de',
  // 'https://www.profiausbau.com', // optional
];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // z. B. curl/Postman
      cb(null, allowedOrigins.includes(origin));
    },
  })
);

// __dirname für ES-Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Persistente Daten (Render Disk)
const DATA_DIR = process.env.DATA_DIR || path.resolve('./data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const FAQ_FILE = path.join(DATA_DIR, 'faq.json');
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json');

// Alte Repo-Dateien (für Migration)
const REPO_FAQ = path.resolve('./faq.json');
const REPO_CATALOG = path.resolve('./catalog.json');

// Atomic Write
function writeJsonAtomic(filePath, dataObj) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dataObj, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// Erststart-Migration (nur wenn /data noch leer ist)
try {
  if (!fs.existsSync(FAQ_FILE) && fs.existsSync(REPO_FAQ)) {
    fs.copyFileSync(REPO_FAQ, FAQ_FILE);
    console.log('⬇️ FAQ migriert →', FAQ_FILE);
  }
  if (!fs.existsSync(CATALOG_FILE) && fs.existsSync(REPO_CATALOG)) {
    fs.copyFileSync(REPO_CATALOG, CATALOG_FILE);
    console.log('⬇️ Catalog migriert →', CATALOG_FILE);
  }
} catch (e) {
  console.warn('⚠️ Migration übersprungen:', e.message);
}

// --- Kleine File-Caches + Loader
let faqCache = { data: [], etag: null, mtimeMs: 0 };
function loadFaqData() {
  try {
    if (!fs.existsSync(FAQ_FILE)) return [];
    const stat = fs.statSync(FAQ_FILE);
    if (stat.mtimeMs !== faqCache.mtimeMs) {
      const json = JSON.parse(fs.readFileSync(FAQ_FILE, 'utf8'));
      faqCache = {
        data: json,
        etag: `"${stat.size}-${stat.mtimeMs}"`,
        mtimeMs: stat.mtimeMs,
      };
    }
    return faqCache.data;
  } catch (err) {
    console.error('❌ Fehler beim Lesen von FAQ:', err.message);
    return [];
  }
}

let catalogCache = { data: [], etag: null, mtimeMs: 0 };
function loadCatalogData() {
  try {
    if (!fs.existsSync(CATALOG_FILE)) return [];
    const stat = fs.statSync(CATALOG_FILE);
    if (stat.mtimeMs !== catalogCache.mtimeMs) {
      const json = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      catalogCache = {
        data: json,
        etag: `"${stat.size}-${stat.mtimeMs}"`,
        mtimeMs: stat.mtimeMs,
      };
    }
    return catalogCache.data;
  } catch (err) {
    console.error('❌ Fehler beim Lesen von Catalog:', err.message);
    return [];
  }
}

// --- Admin-Schutz für schreibende Endpunkte
const requireAdmin = (req, res, next) => {
  const t = req.headers['x-admin-token'];
  if (t && t === process.env.ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
};

// === Health ===
function healthPayload() {
  const faqData = loadFaqData();
  const catalogData = loadCatalogData();
  return {
    status: faqData.length || catalogData.length ? 'ok' : 'warning',
    faqCount: faqData.length,
    catalogCount: catalogData.length,
    timestamp: new Date().toISOString(),
  };
}
app.get(['/api/health', '/health'], (req, res) => res.json(healthPayload()));
app.head(['/api/health', '/health'], (req, res) => res.status(200).end());

// === Chat (optional: Rate-Limit, falls installiert)
if (rateLimit) {
  app.use('/api/chat', rateLimit({ windowMs: 60_000, max: 60 }));
}

let fuse = null;
const greetings = ['hi', 'hallo', 'hey', 'guten tag', 'moin', 'servus', 'danke', 'vielen dank'];
const machineKeywords = [
  'bagger',
  'minibagger',
  'radlader',
  'maschine',
  'maschinen',
  'lader',
  'komatsu',
  'caterpillar',
  'volvo',
  'jcb',
  'kubota',
  'motor',
];

app.post('/api/chat', async (req, res) => {
  const { message } = req.body || {};
  const normalized = (message || '').toLowerCase().trim();

  if (normalized === 'ping') return res.json({ reply: 'pong' });

  if (greetings.some((g) => normalized === g)) {
    return res.json({ reply: '👋 Hallo! Wie kann ich Ihnen helfen?' });
  }

  const faqData = loadFaqData();
  if (faqData.length) {
    if (!fuse || fuse._docs.length !== faqData.length) {
      fuse = new Fuse(faqData, {
        keys: ['frage'],
        threshold: 0.3,
        distance: 80,
        minMatchCharLength: 2,
        ignoreLocation: true,
        includeScore: true,
      });
    }
    const result = fuse.search(message || '');
    if (result.length) {
      return res.json({ reply: result[0].item.antwort });
    }
  }

  if (machineKeywords.some((k) => normalized.includes(k))) {
    return res.json({
      reply:
        '🚜 Wir haben viele Maschinen im Angebot. Bitte melden Sie sich direkt:\n📧 info@baumaschinen-mueller.de\n📞 +49 2403 997312',
    });
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Du bist der digitale Assistent der Uwe Müller GmbH (Baumaschinen Müller).
Antworten: professionell, freundlich, kurz und informativ.
Wenn es um Maschinen geht, verweise IMMER auf den direkten Kontakt:
📧 info@baumaschinen-mueller.de
📞 +49 2403 997312
Wenn du keine Infos hast, ebenfalls Kontakt angeben.`,
          },
          { role: 'user', content: message || '' },
        ],
        temperature: 0.6,
        max_tokens: 500,
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
    );

    const reply = response.data.choices?.[0]?.message?.content;
    res.json({
      reply: reply || 'Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de 📞 +49 2403 997312',
    });
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message);
    res.json({
      reply: 'Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de 📞 +49 2403 997312',
    });
  }
});

// === FAQ API ===
app.get('/api/faq', (req, res) => {
  try {
    const data = loadFaqData();
    // 304/ETag
    if (faqCache.etag && req.headers['if-none-match'] === faqCache.etag) {
      return res.status(304).end();
    }
    res.set('Cache-Control', 'no-store');
    if (faqCache.etag) res.set('ETag', faqCache.etag);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('❌ Fehler beim Lesen von faq.json:', err.message);
    res.status(500).json({ error: 'FAQ konnte nicht geladen werden' });
  }
});

app.post('/api/faq', requireAdmin, (req, res) => {
  try {
    const next = req.body || [];
    writeJsonAtomic(FAQ_FILE, next);
    fuse = null; // Reindex erzwingen
    faqCache.mtimeMs = 0; // Cache invalidieren
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Fehler beim Speichern von FAQ:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/faq-add-single', requireAdmin, (req, res) => {
  try {
    const { frage, antwort } = req.body || {};
    if (!frage || !antwort) return res.status(400).json({ success: false, error: 'Frage oder Antwort fehlt' });
    const data = loadFaqData();
    data.push({ frage, antwort });
    writeJsonAtomic(FAQ_FILE, data);
    fuse = null;
    faqCache.mtimeMs = 0;
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Fehler beim Hinzufügen:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cache manuell leeren (Admin)
app.delete('/api/cache', requireAdmin, (req, res) => {
  fuse = null;
  faqCache.mtimeMs = 0;
  catalogCache.mtimeMs = 0;
  res.json({ success: true });
});

// === Catalog API ===
app.get('/api/catalog', (req, res) => {
  try {
    const data = loadCatalogData();
    // 304/ETag
    if (catalogCache.etag && req.headers['if-none-match'] === catalogCache.etag) {
      return res.status(304).end();
    }
    res.set('Cache-Control', 'no-store');
    if (catalogCache.etag) res.set('ETag', catalogCache.etag);
    res.json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error('❌ Fehler beim Lesen von catalog.json:', err.message);
    res.status(500).json({ error: 'Katalog konnte nicht geladen werden' });
  }
});

app.get('/catalog.json', (req, res) => res.sendFile(CATALOG_FILE));

app.get('/download/catalog', (req, res) => {
  const date = new Date().toISOString().split('T')[0];
  res.download(CATALOG_FILE, `catalog-${date}.json`);
});

// === Admin-Frontend (bleibt erreichbar)
app.use(express.static(path.join(__dirname, 'public')));
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 404 für alles andere (API-only)
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ API läuft auf Port', process.env.PORT || 3000);
});
