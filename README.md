# 🤖 Uwe Müller GmbH (Baumaschinen Müller) Chatbot Backend

Dies ist das Chatbot-Backend für die **Uwe Müller GmbH (Baumaschinen Müller)**.  
Es verarbeitet FAQs aus `faq.json`, bietet eine Admin-Seite zur Pflege und einen Chat-Endpoint mit GPT-Fallback.  
Der Produktkatalog (`catalog.json`) wird automatisch aus LLMS-Quellen generiert.

---

## 🌐 Wichtige URLs

- **Admin-Seite (FAQ bearbeiten):**  
  <a href="https://uwe-chatbot-backend.onrender.com/admin.html" target="_blank">https://uwe-chatbot-backend.onrender.com/admin.html</a>

- **FAQ-API (liefert aktuelle faq.json):**  
  <a href="https://uwe-chatbot-backend.onrender.com/api/faq" target="_blank">https://uwe-chatbot-backend.onrender.com/api/faq</a>

- **Catalog-API (liefert aktuelle catalog.json):**  
  <a href="https://uwe-chatbot-backend.onrender.com/api/catalog" target="_blank">https://uwe-chatbot-backend.onrender.com/api/catalog</a>

- **Chat-API (Chatbot Endpoint, POST mit `{ message }`):**  
  <a href="https://uwe-chatbot-backend.onrender.com/api/chat" target="_blank">https://uwe-chatbot-backend.onrender.com/api/chat</a>

- **Health-Check (für Monitoring):**  
  <a href="https://uwe-chatbot-backend.onrender.com/api/health" target="_blank">https://uwe-chatbot-backend.onrender.com/api/health</a>

---

## ⚙️ Funktionen

- Verwaltung von FAQ-Daten (`faq.json`)  
- Automatischer Import von Produktkatalog (`catalog.json`) über GitHub Actions  
- Chat-Endpoint mit FAQ-Matching (Fuse.js)  
- GPT-Fallback (OpenAI GPT-4o-mini)  
- Admin-Oberfläche mit Login & JSON-Editor  
- Cache-Steuerung (FAQ-Matcher kann neu geladen werden)  

---

## 🚀 Setup (lokale Entwicklung)

```bash
# Repository klonen
git clone <repo-url>
cd chatbot-backend

# Abhängigkeiten installieren
npm install

# Umgebungsvariablen setzen (.env)
cp .env.example .env
# trage OPENAI_API_KEY ein

# Server starten
node server.js
---
📋 FAQ-Beispiele

So sieht die Struktur in faq.json aus:
---

🔄 Systemübersicht (Mermaid Diagramm)
flowchart TD
    A[User Nachricht] --> B[Chat Endpoint /api/chat]
    B --> C{FAQ Match?}
    C -->|Ja| D[Antwort aus faq.json]
    C -->|Nein| E[GPT Fallback (OpenAI)]
    D --> F[Antwort an User]
    E --> F[Antwort an User]
    F --> G[Optional: FAQ-Kandidaten in Admin Panel]
---

📦 Technologien
Node.js + Express → REST API
Fuse.js → FAQ-Suchalgorithmus (Fuzzy Search)
OpenAI GPT-4o-mini → KI-Antworten
GitHub Actions → Automatischer Import von catalog.json aus LLMS
Render → Hosting

👨‍💻 Maintainer
Profiausbau Aachen GmbH
📧 info@profiausbau.com
