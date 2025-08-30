import axios from "axios";
import fs from "fs";

// Quellen aus GitHub Actions ENV
const LLMS_URLS = (process.env.LLMS_SOURCES || "")
  .split(",")
  .filter(Boolean);

const CATALOG_FILE = "./catalog.json";

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let catalogList = [];

  for (const url of LLMS_URLS) {
    const res = await axios.get(url);
    const lines = res.data.split("\n");

    let currentTitle = null;
    let currentContent = [];

    for (const line of lines) {
      if (line.startsWith("### ")) {
        // alten Block speichern
        if (currentTitle && currentContent.length) {
          catalogList.push({
            titel: currentTitle,
            details: currentContent.join(" ")
          });
        }

        currentTitle = line.replace("### ", "").trim();
        currentContent = [];
      } else if (!line.startsWith("URL:") && line.trim()) {
        currentContent.push(line.trim());
      }
    }

    // letzten Block sichern
    if (currentTitle && currentContent.length) {
      catalogList.push({
        titel: currentTitle,
        details: currentContent.join(" ")
      });
    }
  }

  console.log(`📄 Gesamt: ${catalogList.length} Katalogeinträge`);

  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalogList, null, 2), "utf-8");
  console.log("💾 catalog.json aktualisiert.");
}

run();

