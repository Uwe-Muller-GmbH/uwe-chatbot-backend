import axios from "axios";
import fs from "fs";

const LLMS_URLS = (process.env.LLMS_SOURCES || "").split(",").filter(Boolean);

function isMeta(text) {
  if (!text) return true;
  const t = text.toLowerCase();

  // rausfiltern: Metadaten & unnötiges Zeug
  if (t.includes("nutzungsbedingungen")) return true;
  if (t.includes("gesamtanzahl links")) return true;
  if (t.includes("dateiname:")) return true;
  if (t.includes("version:")) return true;
  if (t.includes("erstellt am:")) return true;
  if (t.includes("pdf-download")) return true;
  if (t.includes("click") || t.includes("klicken")) return true;

  return false;
}

function extractFaqs(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  let faqs = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    // echte Frage?
    if (line.endsWith("?") && !isMeta(line)) {
      const frage = line;

      // Antwort zusammensammeln = alle folgenden Zeilen bis zur nächsten Frage
      let antwortParts = [];
      i++;
      while (i < lines.length && !lines[i].endsWith("?")) {
        if (!isMeta(lines[i])) {
          antwortParts.push(lines[i]);
        }
        i++;
      }

      const antwort = antwortParts.join(" ").trim();
      if (antwort.length > 5) {
        faqs.push({ frage, antwort });
      }
    } else {
      i++;
    }
  }

  return faqs;
}

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    const res = await axios.get(url);
    const text = res.data;

    const qas = extractFaqs(text);
    console.log(`✅ ${qas.length} FAQs extrahiert von ${url}`);
    allFaqs.push(...qas);
  }

  console.log(`📄 Gesamt: ${allFaqs.length} FAQs`);

  if (allFaqs.length === 0) {
    console.error("❌ Keine FAQs erkannt – Parser anpassen?");
    process.exit(1);
  }

  fs.writeFileSync("faq.json", JSON.stringify(allFaqs, null, 2), "utf-8");
  console.log("✅ faq.json erfolgreich gespeichert.");
}

run();
