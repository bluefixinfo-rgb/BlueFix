
const MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
].filter((v, i, a) => a.indexOf(v) === i);

const BUSINESS = {
  name: "BlueFix",
  phone: "+41 762299182",
  email: "BlueFix.info@gmail.com",
  address: "Weierbuckstrasse 1, 8213 Neunkirch, Schweiz",
};

// Nur bestätigte BlueFix-Preise eintragen.
// Beispiel: { "iPhone 13 Displayreparatur": "CHF 149" }
const BLUEFIX_PRICES = {};

const SYSTEM_PROMPT = `
Du bist die Kundenservice-KI von BlueFix in der Schweiz.

Du hilfst bei Fragen zu:
- Apple iPhone, Samsung Galaxy, Google Pixel und Android
- Handy-Modellen, Funktionen und technischen Daten
- Display, Glas, Akku, Ladebuchse, Kamera und Lautsprecher
- Wasserschäden, Softwareproblemen und Fehlerdiagnose
- Ersatzteilen, Zubehör und Gerätekompatibilität
- Reparaturmöglichkeiten, Datensicherung und Geräteeinstellungen
- aktuellen technischen Informationen und öffentlich verfügbaren Preisen

BlueFix:
Telefon: ${BUSINESS.phone}
E-Mail: ${BUSINESS.email}
Adresse: ${BUSINESS.address}

BESTÄTIGTE BLUEFIX-PREISE:
${JSON.stringify(BLUEFIX_PRICES)}

REGELN:
1. Antworte hilfreich, direkt und auf Deutsch.
2. Bei aktuellen Modellinformationen darfst du Google Search nutzen.
3. Unterscheide klar zwischen Herstellerpreisen, Marktpreisen und BlueFix-Preisen.
4. Erfinde keine Preise, Verfügbarkeiten, Öffnungszeiten oder Garantien.
5. Wenn ein BlueFix-Preis fehlt, sage, dass das Team ihn bestätigen muss.
6. Frage nach dem genauen Modell, wenn es für die Antwort notwendig ist.
7. Bei Reparaturen erkläre mögliche Ursachen, aber behaupte keine sichere Diagnose ohne Prüfung.
8. Bei Wasserschäden: Gerät ausschalten, nicht laden und professionell prüfen lassen.
9. Versprich niemals eine erfolgreiche Datenrettung.
10. Behaupte nicht, dass ein Termin gebucht oder eine Reparatur durchgeführt wurde.
11. Wenn ein Mitarbeiter übernehmen muss, kennzeichne dies.
12. Gib eine normale, hilfreiche Antwort. Antworte nicht mit einem starren Standardtext,
    wenn du die Kundenfrage beantworten kannst.

Antworte ausschließlich als gültiges JSON:
{
  "reply": "Antwort für den Kunden",
  "escalate": false,
  "reason": ""
}
`;

async function askGemini(message, history = []) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY fehlt");

  let lastError;

  for (const model of MODELS) {
    try {
      const contents = [
        ...history.slice(-10).filter(
          x => x && ["user", "model"].includes(x.role) &&
          typeof x.text === "string"
        ).map(x => ({
          role: x.role,
          parts: [{ text: x.text.slice(0, 4000) }]
        })),
        { role: "user", parts: [{ text: message.slice(0, 10000) }] }
      ];

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_PROMPT }]
            },
            contents,
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
              maxOutputTokens: 1200
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = new Error(
          `${model}: ${data?.error?.message || response.status}`
        );
        console.error("Gemini-Fehler:", lastError.message);
        if ([400, 401, 403, 404, 429].includes(response.status)) continue;
        throw lastError;
      }

      const raw = (data?.candidates?.[0]?.content?.parts || [])
        .map(p => p.text || "")
        .join("")
        .trim();

      if (!raw) throw new Error(`${model}: keine Antwort`);

      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed.reply === "string") {
          return {
            reply: parsed.reply,
            escalate: Boolean(parsed.escalate),
            reason: parsed.reason || ""
          };
        }
      } catch {}

      return {
        reply: cleaned,
        escalate: false,
        reason: ""
      };
    } catch (error) {
      lastError = error;
      console.error("KI-Anfrage fehlgeschlagen:", error.message);
    }
  }

  throw lastError || new Error("Kein Gemini-Modell verfügbar");
}

module.exports = async function handler(req, res) {
  if (req.method === "GET" && req.query?.test === "1") {
    return res.status(200).json({
      ok: true,
      function: "chat-ai",
      provider: "Google Gemini",
      models: MODELS,
      hasGoogleApiKey: Boolean(process.env.GOOGLE_API_KEY)
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Methode nicht erlaubt" });
  }

  try {
    const body = req.body || {};
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return res.status(400).json({ error: "Nachricht fehlt" });
    }

    const result = await askGemini(
      message,
      Array.isArray(body.history) ? body.history : []
    );

    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("BlueFix API-Fehler:", error.message);

    return res.status(500).json({
      ok: false,
      error: "KI vorübergehend nicht erreichbar",
      reply: "Die KI ist gerade nicht erreichbar. Bitte versuche es später erneut oder kontaktiere BlueFix unter +41 762299182."
    });
  }
};
