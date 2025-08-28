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

// Erlaubte Domains (nur von hier Inhalte ziehen)
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || "profiausbau.com,www.profiausbau.com")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isAllowedUrl(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return ALLOWED_DOMAINS.some(d => h === d || h.endsWith("." + d));
  } catch {
    return false;
  }
}

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
  throw new Error("fetchWithRetry: unerwartetes Ende");
}

function cleanText(s) {
  return String(s).replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim();
}

function isHeaderNode(node) {
  try {
    const tag = (node?.prop?.("tagName") || "").toLowerCase();
    return tag === "h1" || tag === "h2" || tag === "h3";
  } catch {
    return false;
  }
}

function extractQA(html, url) {
  // Sicherheitsnetz: falls URL nicht erlaubt, nichts extrahieren
  if (!isAllowedUrl(url)) return [];

  const $ = cheerioLoad(html);
  ["script", "style", "noscript", "iframe"].forEach(sel => $(sel).remove());

  const qas = [];

  $("h1,h2,h3").each((_, el) => {
    const frage = cleanText($(el).text());
    if (!frage || frage.length < 3) return;

    let node = $(el).next();
    const chunks = [];
    let consumed = 0;

    // sammle Textblöcke bis zur nächsten Überschrift
    while (node.length && !isHeaderNode(node)) {
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
    const lines = String(data).split(/\r?\n/);

    for (let line of lines) {
      line = line.trim();
      if (!/^https?:\/\//i.test(line)) continue;           // nur Zeilen, die mit http(s) beginnen
      line = line.replace(/[),.]+$/, "");                  // störende Abschlusszeichen entfernen
      if (!isAllowedUrl(line)) continue;                   // nur erlaubte Domains
      if (!INCLUDE_PDFS && line.toLowerCase().endsWith(".pdf")) continue;
      all.add(line);
    }
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
    const base = BACKEND_URL.replace(/\/api\/faq\/?$/, "");
    console.log(`☁️  Pushe ${faqs.length} FAQs an Backend (Bulk mit 413-Fallback): ${BACKEND_URL}`);

    try {
      // Versuch: alles auf einmal (wenn Server großes JSON akzeptiert)
      await axios.post(BACKEND_URL, faqs, { headers: { "Content-Type": "application/json" } });
      console.log("🚀 Done (Bulk Push)");
    } catch (e) {
      if (e.response?.status === 413) {
        // Fallback: einzeln über /api/faq-add-single posten
        const singleUrl = `${base}/api/faq-add-single`;
        console.warn(`⚠️  413 erhalten — wechsle auf Single-Push: ${singleUrl}`);

        const CONC = 4; // kleine Parallelität
        let idx = 0, ok = 0, fail = 0;

        const postOne = async (item) => {
          try {
            await axios.post(singleUrl, item, { headers: { "Content-Type": "application/json" } });
            ok++;
          } catch (err) {
            fail++;
            console.warn("❌ Single push failed:",
              item.frage?.slice(0, 80) || "?",
              err.response?.status || err.message);
          }
        };

        const workers = Array.from({ length: CONC }, async () => {
          while (idx < faqs.length) {
            const i = idx++;
            await postOne(faqs[i]);
            await sleep(80); // rate limit
          }
        });

        await Promise.all(workers);
        console.log(`✅ Single-Push fertig: ok=${ok}, fail=${fail}`);
      } else {
        throw e;
      }
    }
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
