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

    while (node.length && !/^(h1|h2|h3)$/i.test(node
