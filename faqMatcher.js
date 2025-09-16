// faqMatcher.js
import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Persistentes Datenverzeichnis (Render Disk)
const DATA_DIR  = process.env.DATA_DIR || path.resolve('./data');
const FAQ_FILE  = path.join(DATA_DIR, 'faq.json');

let fuse = null;

function loadFaqData() {
  try {
    if (fs.existsSync(FAQ_FILE)) {
      return JSON.parse(fs.readFileSync(FAQ_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('❌ FAQ laden fehlgeschlagen:', e.message);
  }
  return [];
}

function ensureFuse() {
  const data = loadFaqData(); // erwartet [{ frage: '...', antwort: '...' }, ...]
  fuse = new Fuse(data, {
    keys: ['frage'],
    includeScore: true,
    threshold: 0.35,       // kleiner = strenger
    distance: 80,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
  return fuse;
}

/**
 * Findet die beste Antwort aus faq.json oder gibt null zurück.
 * @param {string} userQuestion
 * @returns {string|null}
 */
export function findBestAnswer(userQuestion) {
  const q = (userQuestion || '').trim();
  if (!q) return null;

  const f = fuse || ensureFuse();
  const results = f.search(q);
  if (!results.length) return null;

  const top = results[0];        // { item, score }
  // score: 0.0 (beste Übereinstimmung) → 1.0 (schlecht)
  return (top.score != null && top.score <= 0.4) ? top.item.antwort : null;
}

// Nach FAQ-Änderungen aufrufbar, um den Index neu aufzubauen
export function reloadFaqMatcher() {
  fuse = null;
}
