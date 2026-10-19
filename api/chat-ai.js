const crypto = require("crypto");

const PROJECT_ID = "bluefix-2255";
const DB = `projects/${PROJECT_ID}/databases/(default)/documents`;
const FS = "https://firestore.googleapis.com/v1";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Aktuelles Modell zuerst; weitere Modelle dienen als Fallback.
// GEMINI_MODEL in Vercel darf gesetzt sein, ist aber nicht zwingend.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
].filter((v, i, a) => v && a.indexOf(v) === i);

const ONESIGNAL_APP_ID =
  process.env.ONESIGNAL_APP_ID ||
  "640d8e83-51d5-45df-9225-07fb6ff37912";

const MAX_AI_REPLIES = 40;
const HUMAN_PAUSE_MS = 30 * 60 * 1000;

const FALLBACK =
  "Danke für deine Nachricht! Unser Team meldet sich innerhalb von 24 Stunden, spätestens innerhalb eines Werktags. Dringend? Ruf uns an: 076 229 91 82.";

// =====================================================================
// PREISLISTE (identisch mit der Preisliste auf blue-fix.ch)
// Alle Preise in CHF, inkl. Ersatzteil und Einbau.
// Zum Ändern: Zahlen hier anpassen und neu deployen.
// =====================================================================
const PRICE_LIST = `
## APPLE iPHONE
- iPhone SE (2020): Display Budget 105 / Premium 120; Akku 75; Ladebuchse 64; Backcover 90; Kamera vorne 70 / hinten 80
- iPhone SE (2022): Display Budget 105 / Premium 120; Akku 75; Ladebuchse 70; Backcover 95; Kamera vorne 70 / hinten 80
- iPhone 8: Display Budget 105 / Premium 110; Akku 75; Ladebuchse 60; Backcover nicht angeboten; Kamera vorne 70 / hinten 125
- iPhone 8 Plus: Display Budget 105 / Premium 115; Akku 75; Ladebuchse 60; Backcover nicht angeboten; Kamera vorne 80 / hinten 160
- iPhone X: Display Budget 110 / Premium 125; Akku 80; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 70 / hinten 150
- iPhone XS: Display Budget 110 / Premium 125; Akku 80; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 80 / hinten 180
- iPhone XS Max: Display Budget 110 / Premium 135; Akku 80; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 100 / hinten 180
- iPhone XR: Display Budget 115 / Premium 125; Akku 78; Ladebuchse 57; Backcover nicht angeboten; Kamera vorne 65 / hinten 90
- iPhone 11: Display Budget 120 / Premium 125; Akku 80; Ladebuchse 65; Backcover nicht angeboten; Kamera vorne 65 / hinten 75
- iPhone 11 Pro: Display Budget 110 / Premium 125; Akku 82; Ladebuchse 80; Backcover nicht angeboten; Kamera vorne 75 / hinten 150
- iPhone 11 Pro Max: Display Budget 115 / Premium 145; Akku 82; Ladebuchse 80; Backcover nicht angeboten; Kamera vorne 75 / hinten 150
- iPhone 12: Display Budget 115 / Premium 135; Akku 80; Ladebuchse 62; Backcover nicht angeboten; Kamera vorne 70 / hinten 90
- iPhone 12 mini: Display Budget 130 / Premium 155; Akku 80; Ladebuchse 62; Backcover nicht angeboten; Kamera vorne 90 / hinten 105
- iPhone 12 Pro: Display Budget 115 / Premium 135; Akku 82; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 70 / hinten 180
- iPhone 12 Pro Max: Display Budget 145 / Premium 165; Akku 82; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 70 / hinten 170
- iPhone 13: Display Budget 125 / Premium 165; Akku 82; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 70 / hinten 75
- iPhone 13 mini: Display Budget 100 / Premium 150; Akku 82; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 80 / hinten 75
- iPhone 13 Pro: Display Budget 125 / Premium 161; Akku 84; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 70 / hinten 75
- iPhone 13 Pro Max: Display Budget 125 / Premium 149; Akku 84; Ladebuchse 64; Backcover nicht angeboten; Kamera vorne 78 / hinten 130
- iPhone 14: Display Budget 120 / Premium 175; Akku 84; Ladebuchse 64; Backcover 95; Kamera vorne 90 / hinten 110
- iPhone 14 Plus: Display Budget 125 / Premium 165; Akku 84; Ladebuchse 64; Backcover 95; Kamera vorne 110 / hinten 130
- iPhone 14 Pro: Display Budget 145 / Premium 185; Akku 86; Ladebuchse 68; Backcover nicht angeboten; Kamera vorne 100 / hinten 150
- iPhone 14 Pro Max: Display Budget 155 / Premium 195; Akku 86; Ladebuchse 68; Backcover nicht angeboten; Kamera vorne 110 / hinten 140
- iPhone 15: Display Budget 135 / Premium 205; Akku 74; Ladebuchse 78; Backcover 115; Kamera vorne 90 / hinten 100
- iPhone 15 Plus: Display Budget 175 / Premium 225; Akku 84; Ladebuchse 68; Backcover 115; Kamera vorne 100 / hinten 120
- iPhone 15 Pro: Display Budget 135 / Premium 240; Akku 88; Ladebuchse 71; Backcover 115; Kamera vorne 80 / hinten 130
- iPhone 15 Pro Max: Display Budget 145 / Premium 225; Akku 88; Ladebuchse 71; Backcover 115; Kamera vorne 100 / hinten 140
- iPhone 16: Display Budget 150 / Premium 220; Akku 78; Ladebuchse 81; Backcover 135; Kamera vorne 100 / hinten 140
- iPhone 16 Plus: Display Budget 155 / Premium 225; Akku 88; Ladebuchse 71; Backcover 135; Kamera vorne 100 / hinten 150
- iPhone 16e: Display Budget 115 / Premium 165; Akku 88; Ladebuchse 71; Backcover 135; Kamera vorne auf Anfrage / hinten 140
- iPhone 16 Pro: Display Budget 155 / Premium 250; Akku 90; Ladebuchse 68; Backcover 115; Kamera vorne 80 / hinten 180
- iPhone 16 Pro Max: Display Budget 165 / Premium 265; Akku 90; Ladebuchse 68; Backcover 115; Kamera vorne 150 / hinten 150
- iPhone 17: Display Budget 175 / Premium 275; Akku 90; Ladebuchse 75; Backcover 115; Kamera vorne 110 / hinten 130
- iPhone 17 Air: Display Budget 145 / Premium 195; Akku 90; Ladebuchse 75; Backcover 115; Kamera vorne auf Anfrage / hinten auf Anfrage
- iPhone 17 Pro: Display Budget 170 / Premium 275; Akku 92; Ladebuchse 140; Backcover 100; Kamera vorne 130 / hinten 150
- iPhone 17 Pro Max: Display Budget 170 / Premium 275; Akku 92; Ladebuchse 140; Backcover 100; Kamera vorne 130 / hinten 150
## SAMSUNG GALAXY
- Galaxy Note 20: Display Budget 180 / Premium 205; Akku 72; Ladebuchse 64; Backcover 70; Kamera vorne 75 / hinten 70
- Galaxy Note 20 Ultra: Display Budget 180 / Premium 205; Akku 72; Ladebuchse 64; Backcover 75; Kamera vorne 75 / hinten 75
- Galaxy A05: Display Budget auf Anfrage / Premium auf Anfrage; Akku 60; Ladebuchse 56; Backcover 70; Kamera vorne 70 / hinten 60
- Galaxy A05s: Display Budget auf Anfrage / Premium auf Anfrage; Akku 60; Ladebuchse 56; Backcover 70; Kamera vorne 65 / hinten 60
- Galaxy A06: Display Budget auf Anfrage / Premium auf Anfrage; Akku 64; Ladebuchse 60; Backcover 75; Kamera vorne 60 / hinten 65
- Galaxy A13: Display Budget auf Anfrage / Premium auf Anfrage; Akku 66; Ladebuchse 62; Backcover 75; Kamera vorne 65 / hinten 70
- Galaxy A14: Display Budget auf Anfrage / Premium auf Anfrage; Akku 66; Ladebuchse 62; Backcover 75; Kamera vorne 65 / hinten 70
- Galaxy A15: Display Budget auf Anfrage / Premium auf Anfrage; Akku 66; Ladebuchse 62; Backcover 75; Kamera vorne 65 / hinten 70
- Galaxy A16: Display Budget auf Anfrage / Premium auf Anfrage; Akku 66; Ladebuchse 62; Backcover 75; Kamera vorne 65 / hinten 70
- Galaxy A17: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 77; Kamera vorne 65 / hinten 70
- Galaxy A22: Display Budget auf Anfrage / Premium auf Anfrage; Akku 66; Ladebuchse 62; Backcover 75; Kamera vorne 65 / hinten 70
- Galaxy A23: Display Budget auf Anfrage / Premium auf Anfrage; Akku 66; Ladebuchse 62; Backcover 75; Kamera vorne 65 / hinten 70
- Galaxy A24: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 70
- Galaxy A25: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 70
- Galaxy A26: Display Budget auf Anfrage / Premium auf Anfrage; Akku 69; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A32: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A33: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A34: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A35: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A36: Display Budget auf Anfrage / Premium auf Anfrage; Akku 68; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A37: Display Budget auf Anfrage / Premium auf Anfrage; Akku 69; Ladebuchse 64; Backcover 80; Kamera vorne 65 / hinten 75
- Galaxy A42 5G: Display Budget auf Anfrage / Premium auf Anfrage; Akku 69; Ladebuchse 65; Backcover 80; Kamera vorne 70 / hinten 75
- Galaxy A52: Display Budget auf Anfrage / Premium auf Anfrage; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 70 / hinten 80
- Galaxy A52s: Display Budget auf Anfrage / Premium auf Anfrage; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 70 / hinten 80
- Galaxy A53: Display Budget auf Anfrage / Premium auf Anfrage; Akku 70; Ladebuchse 65; Backcover 80; Kamera vorne 70 / hinten 80
- Galaxy A54: Display Budget auf Anfrage / Premium auf Anfrage; Akku 70; Ladebuchse 65; Backcover 80; Kamera vorne 70 / hinten 80
- Galaxy A55: Display Budget auf Anfrage / Premium auf Anfrage; Akku 70; Ladebuchse 65; Backcover 80; Kamera vorne 70 / hinten 80
- Galaxy A56: Display Budget auf Anfrage / Premium auf Anfrage; Akku 70; Ladebuchse 65; Backcover 80; Kamera vorne 70 / hinten 80
- Galaxy A57: Display Budget auf Anfrage / Premium auf Anfrage; Akku 72; Ladebuchse 66; Backcover 85; Kamera vorne 70 / hinten 80
- Galaxy A72: Display Budget auf Anfrage / Premium auf Anfrage; Akku 74; Ladebuchse 68; Backcover 85; Kamera vorne 70 / hinten 80
- Galaxy A73: Display Budget auf Anfrage / Premium auf Anfrage; Akku 74; Ladebuchse 68; Backcover 85; Kamera vorne 70 / hinten 80
- Galaxy S21: Display Budget 110 / Premium 175; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 85
- Galaxy S21+: Display Budget 115 / Premium 135; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 85
- Galaxy S21 Ultra: Display Budget 125 / Premium 175; Akku 72; Ladebuchse 67; Backcover 85; Kamera vorne 75 / hinten 85
- Galaxy S21 FE: Display Budget 110 / Premium 125; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 80 / hinten 85
- Galaxy S22: Display Budget 115 / Premium 145; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 85
- Galaxy S22+: Display Budget 170 / Premium 190; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 85
- Galaxy S22 Ultra: Display Budget 155 / Premium 180; Akku 72; Ladebuchse 68; Backcover 85; Kamera vorne 75 / hinten 85
- Galaxy S23: Display Budget 135 / Premium 195; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 80
- Galaxy S23+: Display Budget 105 / Premium 170; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 80
- Galaxy S23 FE: Display Budget 135 / Premium 150; Akku 70; Ladebuchse 65; Backcover 85; Kamera vorne 75 / hinten 80
- Galaxy S23 Ultra: Display Budget 140 / Premium 205; Akku 72; Ladebuchse 68; Backcover 90; Kamera vorne 75 / hinten 85
- Galaxy S24: Display Budget 145 / Premium 175; Akku 72; Ladebuchse 66; Backcover 90; Kamera vorne 70 / hinten 80
- Galaxy S24+: Display Budget 145 / Premium 175; Akku 72; Ladebuchse 66; Backcover 90; Kamera vorne 70 / hinten 80
- Galaxy S24 FE: Display Budget 150 / Premium 180; Akku 72; Ladebuchse 66; Backcover 90; Kamera vorne 70 / hinten 80
- Galaxy S24 Ultra: Display Budget 175 / Premium 235; Akku 74; Ladebuchse 69; Backcover 95; Kamera vorne 75 / hinten 85
- Galaxy S25: Display Budget 175 / Premium 195; Akku 74; Ladebuchse 67; Backcover 95; Kamera vorne 75 / hinten 85
- Galaxy S25+: Display Budget 195 / Premium 215; Akku 74; Ladebuchse 67; Backcover 95; Kamera vorne 75 / hinten 85
- Galaxy S25 Edge: Display Budget 175 / Premium 195; Akku 76; Ladebuchse 69; Backcover 95; Kamera vorne 75 / hinten 85
- Galaxy S25 Ultra: Display Budget 185 / Premium 205; Akku 78; Ladebuchse 70; Backcover 100; Kamera vorne 75 / hinten 85
`;

let tokenCache = { token: "", expires: 0 };

function json(res, status, data) {
  return res.status(status).json(data);
}

function encodePath(value) {
  return encodeURIComponent(value);
}

function fieldValue(f) {
  if (!f) return undefined;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.integerValue !== undefined) return Number(f.integerValue);
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.timestampValue !== undefined) return Date.parse(f.timestampValue);
  if (f.nullValue !== undefined) return null;
  return undefined;
}

function objectFields(fields = {}) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    result[key] = fieldValue(value);
  }
  return result;
}

function humanActive(fields) {
  const t = fieldValue(fields.humanAt) || 0;
  return t > 0 && Date.now() - t < HUMAN_PAUSE_MS;
}

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expires) {
    return tokenCache.token;
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT fehlt in Vercel");
  }

  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT ist kein gültiges JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned =
    b64({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    });

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const assertion =
    unsigned + "." +
    signer.sign(account.private_key).toString("base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    }),
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      "Firebase-Anmeldung fehlgeschlagen: " +
      response.status + " " +
      JSON.stringify(data).slice(0, 500)
    );
  }

  tokenCache = {
    token: data.access_token,
    expires:
      Date.now() +
      Math.max(60, (data.expires_in || 3600) - 120) * 1000
  };

  return tokenCache.token;
}

async function fsFetch(path, options = {}) {
  const token = await getAccessToken();

  return fetch(`${FS}/${DB}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    signal: options.signal || AbortSignal.timeout(10000)
  });
}

async function readSession(sid) {
  const response = await fsFetch(
    `livechat_sessions/${encodePath(sid)}`
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(
      `Firestore Session ${response.status}: ${detail.slice(0, 500)}`
    );
    error.status = response.status;
    throw error;
  }

  const document = await response.json();
  return document.fields || {};
}

async function readMessages(sid) {
  const response = await fsFetch(
    `livechat_sessions/${encodePath(sid)}/messages?pageSize=100`
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Firestore Nachrichten ${response.status}: ${detail.slice(0, 500)}`
    );
  }

  const data = await response.json();

  return (data.documents || [])
    .map((document) => ({
      id: document.name.split("/").pop(),
      ...objectFields(document.fields)
    }))
    .sort((a, b) => (a.ts || 0) - (b.ts || 0))
    .slice(-14);
}

function systemPrompt() {
  return `Du bist der KI-Assistent von BlueFix Handy Reparatur in Neunkirch, Schweiz.
Antworte freundlich, natürlich, kurz und auf Deutsch. Verwende du und Schweizer Schreibweise mit ss. Begrüsse den Kunden nicht erneut.

ALLGEMEINE FAKTEN (von der Webseite blue-fix.ch):
- Inhaber: Jerome Ramspacher, BlueFix Handy Reparatur.
- Adresse: Weierbuckstrasse 1, 8213 Neunkirch. Reparaturen werden vor Ort in Neunkirch durchgeführt.
- Telefon: 076 229 91 82. E-Mail: bluefix.info@gmail.com.
- Termin: Der Kunde ruft kurz an oder schreibt eine E-Mail mit Modell und Problem, das Team meldet sich schnellstmöglich.
- Repariert werden iPhone und Samsung Galaxy. Reparaturarten: Display, Akku, Ladebuchse, Backcover, Kamera, Wasserschaden.
- Alle Preise in CHF, inklusive Ersatzteil und Einbau. Keine versteckten Kosten: Der Preis aus der Preisliste ist der Preis, den der Kunde zahlt.
- Der Preis wird vor Arbeitsbeginn mitgeteilt. Weicht der Aufwand ab, wird der Kunde vor Fortsetzung der Arbeiten informiert.
- Dauer: Die meisten Reparaturen wie Display oder Akku sind meist am selben Tag erledigt (keine festen Zusagen machen).
- Garantie: 6 Monate auf jede Reparatur, auf das verbaute Teil und die Arbeitsleistung, unabhängig von Budget- oder Premium-Teil. Ausgeschlossen sind Sturz, Druck oder Fremdeinwirkung nach der Reparatur, neue Wasserschäden, Schäden an nicht reparierten Bauteilen, Eingriffe Dritter und normale Abnutzung.
- Zahlung vor Beginn der Reparatur per Twint, Barzahlung oder Banküberweisung (bei Überweisung wird das Gerät nach Zahlungseingang übergeben).
- Display-Qualität: Budget = geprüftes, kompatibles Ersatzteil (günstig). Premium = bessere Qualität in Original- bzw. Service-Pack-Qualität. Bei den übrigen Reparaturen werden Original- oder hochwertige Ersatzteile verwendet. Der Kunde darf beim Display wählen.
- Altteile bleiben bei BlueFix, ausser der Kunde möchte sie zurück.
- Datenverlust: Keine Haftung für Daten auf dem Gerät. Empfiehl ein Backup vor der Abgabe, wenn möglich.
- Wasserschaden: Diagnose CHF 50. Danach klarer Fixpreis, Reparatur ab CHF 90. Keine Garantie auf die Rettung des Geräts, weil der Schaden anfangs oft nicht vollständig einsehbar ist. Je schneller, desto besser die Chancen.
- Öffnungszeiten sind nicht bekannt: erfinde keine, verweise auf Telefon oder E-Mail.

PREISLISTE (alle Modelle, CHF, inkl. Ersatzteil und Einbau):
${PRICE_LIST}

REGELN ZU PREISEN:
- Nenne Preise ausschliesslich aus der PREISLISTE, exakt so, wie sie dort stehen.
- Beim Display nennst du Budget und Premium und erklärst kurz den Unterschied. Bei Kamera nennst du vorne oder hinten passend zur Frage (oder beide).
- Steht "auf Anfrage" in der Liste, ist das Modell nicht in der Liste oder die Reparatur wird nicht angeboten, sag, dass das Team den genauen Preis bestätigt, und gib an das Team weiter (escalate: true).
- "Backcover nicht angeboten" bedeutet: Diese Reparatur bieten wir für dieses Modell nicht an. Sag das ehrlich.
- Ist die Modellbezeichnung unklar (z. B. nur "iPhone 15"), frag kurz, welches Modell genau (Standard, Plus, Pro, Pro Max).
- Erfinde keine Preise, Rabatte, Termine, Öffnungszeiten oder Reparaturdauern, die hier nicht stehen. Die Preise sind ohne Gewähr; Änderungen bleiben vorbehalten.

Beantworte jede Nachricht inhaltlich. Frage höchstens eine Rückfrage.
Gib an das Team weiter, wenn der Kunde eine Reparatur oder einen Termin möchte, einen Mitarbeiter verlangt, ein Problem mit einer bestehenden Reparatur hat oder du etwas nicht sicher beantworten kannst.
Bei Weitergabe erwähne die Rückmeldung innerhalb von 24 Stunden, spätestens innerhalb eines Werktags.

Antworte ausschliesslich mit JSON:
{"reply":"Antwort","escalate":false,"reason":""}`;
}

function parseAI(text) {
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start < 0 || end < start) {
      throw new Error("Kein JSON-Objekt in der KI-Antwort");
    }

    const result = JSON.parse(cleaned.slice(start, end + 1));

    if (typeof result.reply === "string" && result.reply.trim()) {
      return {
        reply: result.reply.trim().slice(0, 900),
        escalate: Boolean(result.escalate),
        reason: String(result.reason || "")
      };
    }
  } catch (error) {
    console.error("KI-JSON konnte nicht gelesen werden:", error.message);
  }

  return {
    reply: FALLBACK,
    escalate: true,
    reason: "KI-Antwort konnte nicht gelesen werden"
  };
}

async function askGemini(messages) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY fehlt in Vercel");

  let lastError = "";

  for (const model of MODELS) {
    const url =
      `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent` +
      `?key=${encodeURIComponent(key)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt() }]
          },
          contents: messages.map((message) => ({
            role: message.from === "visitor" ? "user" : "model",
            parts: [{ text: String(message.text || "").slice(0, 2000) }]
          })),
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        lastError =
          `Gemini ${model}: HTTP ${response.status}: ${detail.slice(0, 1000)}`;

        console.error("Gemini-Anfrage fehlgeschlagen:", lastError);

        // Bei nicht verfügbaren Modellen den nächsten Namen testen.
        continue;
      }

      const data = await response.json();
      const text = (data.candidates || [])
        .flatMap((candidate) => candidate.content?.parts || [])
        .map((part) => part.text || "")
        .join("");

      if (text) return parseAI(text);

      lastError =
        `Gemini ${model}: keine Textantwort. ` +
        JSON.stringify(data).slice(0, 500);

      console.error(lastError);
    } catch (error) {
      lastError = `Gemini ${model}: ${String(error.message || error)}`;
      console.error(lastError);
    }
  }

  throw new Error(lastError || "Kein Gemini-Modell verfügbar");
}

async function saveReply(sid, reply, escalate, reason, oldCount) {
  const now = Date.now();
  const sessionPath = `livechat_sessions/${encodePath(sid)}`;
  const collectionPath = `${sessionPath}/messages`;

  const messageResponse = await fsFetch(collectionPath, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        from: { stringValue: "team" },
        agent: { stringValue: "BlueFix KI" },
        ai: { booleanValue: true },
        text: { stringValue: reply },
        ts: { integerValue: String(now) }
      }
    })
  });

  if (!messageResponse.ok) {
    console.error(
      "Nachricht konnte nicht gespeichert werden:",
      messageResponse.status,
      (await messageResponse.text().catch(() => "")).slice(0, 500)
    );
    return false;
  }

  const fields = {
    lastMessageAt: { integerValue: String(now) },
    lastText: { stringValue: reply.slice(0, 140) },
    lastFrom: { stringValue: "team" },
    lastAgent: { stringValue: "BlueFix KI" },
    aiHandledAt: { integerValue: String(now) },
    aiCount: { integerValue: String(oldCount + 1) }
  };

  const mask = Object.keys(fields);

  if (escalate) {
    fields.needsHuman = { booleanValue: true };
    fields.needsHumanAt = { integerValue: String(now) };
    fields.needsHumanReason = {
      stringValue: String(reason || "").slice(0, 200)
    };
    mask.push("needsHuman", "needsHumanAt", "needsHumanReason");
  }

  const query = mask
    .map((key) => "updateMask.fieldPaths=" + encodeURIComponent(key))
    .join("&");

  const updateResponse = await fsFetch(
    `${sessionPath}?${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields })
    }
  );

  if (!updateResponse.ok) {
    console.error(
      "Sitzung konnte nicht aktualisiert werden:",
      updateResponse.status,
      (await updateResponse.text().catch(() => "")).slice(0, 500)
    );
  }

  return updateResponse.ok;
}

async function notifyTeam(sid, reason) {
  const key = process.env.ONESIGNAL_REST_API_KEY;
  if (!key) return;

  try {
    await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${key}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        included_segments: ["Total Subscriptions"],
        headings: { en: "Neue BlueFix Chat-Anfrage" },
        contents: {
          en: String(reason || "Ein Kunde benötigt einen Mitarbeiter").slice(0, 200)
        },
        data: { type: "livechat", sid }
      }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (error) {
    console.error("OneSignal fehlgeschlagen:", error.message);
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const output = {
      ok: true,
      function: "chat-ai",
      provider: "Google Gemini",
      hasGoogleApiKey: Boolean(process.env.GOOGLE_API_KEY),
      hasFirebaseServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
      hasOneSignalKey: Boolean(process.env.ONESIGNAL_REST_API_KEY),
      priceListLines: PRICE_LIST.trim().split("\n").length,
      models: MODELS
    };

    if (new URL(req.url, "https://example.com").searchParams.has("test")) {
      try {
        const token = await getAccessToken();
        output.firebaseAuth = Boolean(token);

        // Prüft die Verfügbarkeit der Modelle über die Model-API.
        output.modelChecks = [];

        for (const model of MODELS) {
          const response = await fetch(
            `${GEMINI_BASE}/${encodeURIComponent(model)}`,
            {
              headers: {
                "x-goog-api-key": process.env.GOOGLE_API_KEY || ""
              },
              signal: AbortSignal.timeout(8000)
            }
          );

          output.modelChecks.push({
            model,
            status: response.status,
            available: response.ok
          });
        }
      } catch (error) {
        output.testError = String(error.message || error).slice(0, 300);
      }
    }

    return json(res, 200, output);
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "POST only" });
  }

  try {
    let body = req.body;

    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const sid = String(body?.sid || "");

    if (!/^[a-f0-9]{16,40}$/i.test(sid)) {
      return json(res, 400, { error: "Ungültige Chat-ID" });
    }

    const fields = await readSession(sid);
    const lastAt = fieldValue(fields.lastMessageAt) || 0;
    const aiCount = fieldValue(fields.aiCount) || 0;

    if (
      fieldValue(fields.lastFrom) !== "visitor" ||
      Date.now() - lastAt > 600000
    ) {
      return json(res, 200, { skipped: "not needed" });
    }

    if (humanActive(fields)) {
      return json(res, 200, { skipped: "human took over" });
    }

    if ((fieldValue(fields.aiHandledAt) || 0) >= lastAt) {
      return json(res, 200, { skipped: "already answered" });
    }

    if (aiCount >= MAX_AI_REPLIES) {
      return json(res, 200, { skipped: "limit" });
    }

    let result;

    try {
      const messages = await readMessages(sid);
      const history = messages
        .filter((message) =>
          ["visitor", "team"].includes(message.from) &&
          typeof message.text === "string"
        )
        .slice(-14);

      if (!history.length || history[history.length - 1].from !== "visitor") {
        return json(res, 200, { skipped: "no user message" });
      }

      result = await askGemini(history);
    } catch (error) {
      // Den echten Fehler in Vercel protokollieren.
      console.error("KI-Anfrage fehlgeschlagen:", error.message);

      result = {
        reply: FALLBACK,
        escalate: true,
        reason: "KI-Fehler: " + String(error.message || error).slice(0, 150)
      };
    }

    const current = await readSession(sid);

    if (
      (fieldValue(current.lastMessageAt) || 0) !== lastAt ||
      humanActive(current)
    ) {
      return json(res, 200, { skipped: "changed meanwhile" });
    }

    const saved = await saveReply(
      sid,
      result.reply,
      result.escalate,
      result.reason,
      aiCount
    );

    if (!saved) {
      return json(res, 502, {
        ok: false,
        error: "Firestore write failed"
      });
    }

    if (result.escalate) {
      await notifyTeam(sid, result.reason);
    }

    return json(res, 200, {
      ok: true,
      escalate: result.escalate
    });
  } catch (error) {
    console.error("chat-ai error:", error.message);

    return json(res, error.status === 404 ? 404 : 500, {
      ok: false,
      error: String(error.message || error).slice(0, 500)
    });
  }
};
