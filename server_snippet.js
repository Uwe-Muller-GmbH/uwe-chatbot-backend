// server_snippet.js  (ESM)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export default function registerFaqRoute(app) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);

  // Persistenter Pfad (Render-Disk)
  const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, './data');
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const FAQ_FILE = path.join(DATA_DIR, 'faq.json');
  const REPO_FAQ = path.resolve(__dirname, './faq.json'); // alte Repo-Datei

  // Einmalige Migration (nur wenn /data noch leer ist)
  try {
    if (!fs.existsSync(FAQ_FILE) && fs.existsSync(REPO_FAQ)) {
      fs.copyFileSync(REPO_FAQ, FAQ_FILE);
      console.log('⬇️ FAQ migriert →', FAQ_FILE);
    }
  } catch (e) {
    console.warn('⚠️ FAQ-Migration übersprungen:', e.message);
  }

  // Kleiner Cache + ETag
  let cache = { data: [], etag: null, mtime: 0 };
  function loadFaq() {
    if (!fs.existsSync(FAQ_FILE)) return [];
    const stat = fs.statSync(FAQ_FILE);
    if (stat.mtimeMs !== cache.mtime) {
      const json = JSON.parse(fs.readFileSync(FAQ_FILE, 'utf8'));
      cache = {
        data: json,
        etag: `"${stat.size}-${stat.mtimeMs}"`,
        mtime: stat.mtimeMs,
      };
    }
    return cache.data;
  }

  // Route
  app.get('/api/faq', (req, res) => {
    try {
      const data = loadFaq();

      // 304 wenn ETag passt
      if (cache.etag && req.headers['if-none-match'] === cache.etag) {
        return res.status(304).end();
      }

      res.set('Cache-Control', 'no-store');
      if (cache.etag) res.set('ETag', cache.etag);
      res.json(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('❌ Fehler beim Lesen von faq.json:', err.message);
      res.status(500).json({ error: 'FAQ konnte nicht geladen werden' });
    }
  });
}
