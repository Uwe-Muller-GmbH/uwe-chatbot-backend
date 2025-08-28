// tools/scrape_llms_to_faq.mjs
import fs from "fs";
import path from "path";
import axios from "axios";
import { load as cheerioLoad } from "cheerio";

// ====== Konfiguration (über ENV übersteuerbar) ======
const DEFAULT_LLMS = ["https://www.profiausbau.com/llms.txt"];
const LLMS_SOURCES = (process.env.LLMS_SOURCES
  ? process.env.LLMS_SOURCES.split(",").map(s => s.trim()).filter(Boolean)
  : DEFAULT_LLMS);

const BACKEND_URL = process.env.BACKEND_URL || ""; // z.B. https://.../api/faq
const CONCURRENCY = Number(process.env.SCRAPE_CONCURRENCY || 5);
const MIN_ANSWER_LEN = Number(process.env.MIN_ANSWER_LEN || 160);
const MAX_FAQS = Number(process.env.MAX_FAQS || 1000);
const OUT_FILE = process.env.OUT_FILE || path.join(process.cwd(), "faq.json");
const INCLUDE_PDFS = (process.env.INCLUDE_PDFS || "false").toLowerCase() === "true";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      return await axios.get(url, {
        timeout: 20000,
        headers: { "User-Agent": "profiausbau-scraper/1.1" }
      });
    } catch (e) {
      const code = e.response?.status;
      if (code === 404) throw e; // kein Retry bei 404
      if (i < tries - 1) await sleep(500 * (i + 1));
      else throw e;
    }
  }
  // sollte nie hier landen
  throw new Error("fetchWithRetry: unerwartetes Ende");
}

function cleanText(s) {
  return String(s).replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim();
}

function extractQA(html, url) {
  const $ = cheerioLoad(html);
  ["script", "style", "noscript", "iframe"].forEach(sel => $(sel).remove());

  const qas = [];

  $("h1,h2,h3").each((_, el) => {
    const frage = cleanText($(el).text());
    if (!frage || frage.length < 3) return;

    let node = $(el).next();
    const chunks = [];
    let consumed = 0;

    while (node.length && !/^(h1|h2|h3)$/i.test(node.prop("tagName") || "")) {
      if (node.is("p,ul,ol,table,blockquote,li")) {
        const t = cleanText(node.text());
        if (t) {
          chunks.push(t);
          consumed += t.length;
        }
      }
      node = node.next();
      if (consumed > 4000) break;
    }

    const antwort = cleanText(chunks.join("\n\n"));
    if (antwort && antwort.length >= MIN_ANSWER_LEN) {
      qas.push({ frage, antwort });
    }
  });

  // Fallback: keine Überschriftenstruktur gefunden
  if (!qas.length) {
    const body = cleanText($("body").text());
    if (body) {
      qas.push({
        frage: `Informationen: ${url}`,
        antwort: body.slice(0, 3500)
      });
    }
  }

  // Dedupe innerhalb einer Seite
  const seen = new Set();
  return qas.filter(q => {
    const key = `${q.frage}__${q.antwort.slice(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqByQuestion(arr) {
  const map = new Map();
  for (const x of arr) {
    if (x?.frage && !map.has(x.frage)) map.set(x.frage, x);
  }
  return [...map.values()];
}

async function loadLlmsUrls() {
  const all = new Set();
  for (const src of LLMS_SOURCES) {
    const { data } = await fetchWithRetry(src);
    const urls = (String(data).match(/https?:\/\/[^\s]+/g) || [])
      .filter(u => INCLUDE_PDFS || !u.toLowerCase().endsWith(".pdf"));
    urls.forEach(u => all.add(u));
  }
  return [...all].slice(0, MAX_FAQS);
}

async function run() {
  console.log("🔎 LLMS-Quellen:", LLMS_SOURCES.join(", "));
  const urls = await loadLlmsUrls();
  console.log(`→ ${urls.length} Ziel-URLs (Limit ${MAX_FAQS})`);

  const results = [];
  let processed = 0;

  const queue = [...urls];
  const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const n = ++processed;
      try {
        const { data } = await fetchWithRetry(url);
        const qas = extractQA(data, url);
        results.push(...qas);
        console.log(`✅ [${n}/${urls.length}] ${url} → ${qas.length} QAs`);
        await sleep(80); // freundlich crawlen
      } catch (e) {
        console.warn(`⚠️  [${n}/${urls.length}] ${url} → ${e.message || e}`);
      }
    }
  });

  await Promise.all(workers);

  let faqs = uniqByQuestion(results)
    .filter(x => x?.antwort && x.antwort.length >= MIN_ANSWER_LEN);

  // vorhandene faq.json sanft mergen (falls vorhanden)
  if (fs.existsSync(OUT_FILE)) {
    try {
      const before = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
      faqs = uniqByQuestion([...before, ...faqs]);
    } catch {
      // ignore parse errors
    }
  }

  if (BACKEND_URL) {
    console.log(`☁️  Pushe ${faqs.length} FAQs an Backend: ${BACKEND_URL}`);
    await axios.post(BACKEND_URL, faqs, { headers: { "Content-Type": "application/json" } });
    console.log("🚀 Done (Backend Push)");
  } else {
    fs.writeFileSync(OUT_FILE, JSON.stringify(faqs, null, 2), "utf8");
    console.log(`💾 faq.json gespeichert: ${OUT_FILE}  (Einträge: ${faqs.length})`);
  }

  console.log("✅ Scrape fertig.");
}

run().catch(err => {
  console.error("❌ Fehler:", err.stack || err.message);
  process.exit(1);
});
