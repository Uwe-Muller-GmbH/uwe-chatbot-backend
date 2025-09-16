// importCatalog.mjs  (ESM)
import axios from "axios";
import fs from "fs";
import path from "path";

// --- Persistenz: Render-Disk (/data) nutzen
const DATA_DIR = process.env.DATA_DIR || path.resolve("./data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const CATALOG_FILE = path.join(DATA_DIR, "catalog.json");

// --- Quellen (Komma-getrennt in ENV: LLMS_SOURCES="https://...md,https://...md")
const LLMS_URLS = (process.env.LLMS_SOURCES || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// --- kleiner Helper: atomar schreiben (tmp -> rename)
function writeJsonAtomic(filePath, dataObj) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(dataObj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

// --- Retry bei 429/5xx, Timeout etc.
const client = axios.create({
  timeout: 20000,
  headers: { "User-Agent": "UweMueller-Importer/1.0" },
});

async function getWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.get(url);
    } catch (e) {
      const code = e.response?.status;
      if (![429, 500, 502, 503, 504].includes(code) || i === retries - 1) {
        throw e;
      }
      await new Promise(r => setTimeout(r, 500 * (i + 1))); // 0.5s, 1s, 1.5s
    }
  }
}

// --- Markdown-Parser für "### Titel" Blöcke; ignoriert Zeilen mit "URL:"
function parseLlmsMarkdown(md) {
  const lines = md.split("\n");
  let currentTitle = null;
  let currentContent = [];
  const items = [];

  const pushBlock = () => {
    if (currentTitle && currentContent.length) {
      items.push({
        titel: currentTitle.trim(),
        details: currentContent.join(" ").replace(/\s+/g, " ").trim(),
      });
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("### ")) {
      pushBlock();
      currentTitle = line.slice(4);
      currentContent = [];
    } else if (line && !/^URL\s*:/.test(line)) {
      currentContent.push(line);
    }
  }
  pushBlock();
  return items;
}

// --- Duplikate anhand Titel entfernen (case/space-insensitive)
function dedupeByTitle(list) {
  const seen = new Set();
  const out = [];
  for (const it of list) {
    const key = it.titel.toLowerCase().replace(/\s+/g, " ").trim();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

async function run() {
  if (!LLMS_URLS.length) {
    console.error("❌ Keine LLMS_SOURCES gesetzt.");
    process.exit(1);
  }

  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let catalogList = [];

  for (const url of LLMS_URLS) {
    const res = await getWithRetry(url);
    const items = parseLlmsMarkdown(res.data || "");
    console.log(`➡️  ${url} → ${items.length} Einträge`);
    catalogList.push(...items);
  }

  // Duplikate entfernen
  catalogList = dedupeByTitle(catalogList);

  console.log(`📄 Gesamt nach Dedupe: ${catalogList.length} Katalogeinträge`);

  // Atomar & persistent speichern
  writeJsonAtomic(CATALOG_FILE, catalogList);
  console.log(`💾 catalog.json aktualisiert → ${CATALOG_FILE}`);
}

run().catch(err => {
  console.error("❌ Import fehlgeschlagen:", err.response?.status, err.message);
  process.exit(1);
});


