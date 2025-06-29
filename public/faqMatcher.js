
const Fuse = require('fuse.js')

// TODO: Diese Daten aus eurer echten Datenbank laden
const faqItems = [
  {
    question: "Wie funktioniert die Rückgabe?",
    answer: "Produkte können innerhalb von 14 Tagen zurückgegeben werden.",
  },
  {
    question: "Was kostet der Versand?",
    answer: "Der Versand kostet pauschal 4,90 € innerhalb Deutschlands.",
  },
  {
    question: "Wie lange ist die Lieferzeit?",
    answer: "Die Lieferzeit beträgt 2–4 Werktage nach Zahlungseingang.",
  },
  {
    question: "Wie erreiche ich den Kundenservice?",
    answer: "Sie erreichen uns per E-Mail unter info@profiausbau.de oder telefonisch.",
  },
  {
    question: "Kann ich meine Bestellung stornieren?",
    answer: "Ja, solange sie noch nicht versendet wurde.",
  },
]

const fuse = new Fuse(faqItems, {
  keys: ['question'],
  threshold: 0.3, // niedrig = strengere Übereinstimmung
})

function findBestAnswer(userQuestion) {
  const result = fuse.search(userQuestion)
  return result.length && result[0].score < 0.4 ? result[0].item.answer : null
}

module.exports = { findBestAnswer }
