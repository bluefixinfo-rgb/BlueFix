
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
].filter((model, index, all) => model && all.indexOf(model) === index);

const BLUEFIX = {
  name: "BlueFix",
  email: "BlueFix.info@gmail.com",
  phone: "+41 762299182",
  address: "Weierbuckstrasse 1, 8213 Neunkirch, Schweiz",
  currency: "CHF",
};

const REPAIR_PRICES = {
  // Trage hier deine bestätigten Preise ein.
  // Beispiel: "iPhone 13 Display": 129,
};

function systemPrompt() {
  return `
Du bist der digitale Kundenberater von BlueFix, einem Handy-Reparaturservice
in der Schweiz. Antworte freundlich, verständlich und professionell auf Deutsch.
Passe die Sprache an den Kunden an.

BLUEFIX-KONTAKT:
Name: ${BLUEFIX.name}
E-Mail: ${BLUEFIX.email}
Telefon: ${BLUEFIX.phone}
Adresse: ${BLUEFIX.address}
Währung: Schweizer Franken (CHF)

DEIN WISSEN:
- Apple iPhone und iOS
- Samsung Galaxy und Android
- Google Pixel und andere Android-Smartphones
- Smartphone-Modelle, technische Daten und Funktionen
- Displays, Touchscreens und Rückglas
- Akkus, Ladebuchsen und Ladeprobleme
- Kameras, Mikrofone, Lautsprecher und Vibrationsmotoren
- WLAN, Bluetooth, Mobilfunk, SIM und eSIM
- Softwarefehler, Updates und Neustartprobleme
- Datensicherung, Datenübertragung und Wiederherstellung
- Zubehör, Kabel, Ladegeräte und Kompatibilität
- Wasserschäden und mögliche Folgeschäden
- Diagnose, Reparaturabläufe und typische Fehlerursachen

REGELN:
1. Beantworte allgemeine Fragen zu Smartphones so gut wie möglich.
2. Erfinde keine technischen Daten, Teile-Kompatibilitäten oder Preise.
3. Wenn Informationen vom aktuellen Modell oder Softwarestand abhängen,
   frage nach dem genauen Modell oder kennzeichne Unsicherheiten.
4. Behaupte nicht, dass BlueFix ein Ersatzteil auf Lager hat, wenn dies
   nicht in den bereitgestellten Daten steht.
5. Erfinde keine Öffnungszeiten, Lieferzeiten, Garantien oder Leistungen.
6. Preise müssen aus der bestätigten Preisliste stammen.
7. Wenn kein passender Preis bekannt ist, sage:
   "Den genauen Preis muss BlueFix anhand des Modells und Schadens bestätigen."
8. Herstellerpreise sind nicht automatisch BlueFix-Preise.
9. Gib keine Garantie, dass Daten nach einer Reparatur erhalten bleiben.
10. Bei Wasserschäden keine Ladeversuche empfehlen. Empfiehl, das Gerät
    auszuschalten, nicht zu laden und professionell prüfen zu lassen.
11. Bitte Kunden niemals, Passwörter oder andere vertrauliche Zugangsdaten
    im Chat zu teilen.
12. Bei komplexen Schäden, Datenverlust oder unklarer Diagnose an das
    BlueFix-Team weiterleiten.
13. Behaupte niemals, du hättest ein Gerät untersucht, eine Reparatur
    durchgeführt oder einen Termin gebucht, wenn das nicht geschehen ist.
14. Stelle bei Reparaturfragen zuerst gezielte Rückfragen nach Modell und
    Fehlerbild, wenn diese Informationen fehlen.
15. Erkläre technische Sachverhalte in einfachen Worten und gib kurze,
    sichere Schritte zur Fehlerbehebung.
16. Nutze die nachfolgende Preisliste nur für tatsächlich hinterlegte Preise.

BESTÄTIGTE PREISDATEN:
${JSON.stringify(REPAIR_PRICES, null, 2)}

ANTWORTFORMAT:
Gib ausschließlich gültiges JSON in dieser Form zurück:
{
  "reply": "Deine Antwort an den Kunden",
  "escalate": false,
  "reason": ""
}

Setze "escalate" auf true, wenn ein Mitarbeiter übernehmen sollte.
Schreibe dann den Grund in "reason".
Keine Markdown-Codeblöcke um das JSON.
`;
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();
}

function safeJson(text) {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.reply === "string") {
      return {
        reply: parsed.reply,
        escalate: Boolean(parsed.escalate),
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    }
  } catch {
    // Falls das Modell kein JSON liefert, Text als Antwort behandeln.
  }

  return {
    reply: cleaned || "Bitte kontaktiere unser BlueFix-Team für weitere Hilfe.",
    escalate: false,
    reason: "",
  };
}

async function askGemini(message, history = []) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY fehlt in den Server-Umgebungsvariablen.");
  }

  const contents = [
    ...history
      .filter((item) =>
        item &&
        ["user", "model"].includes(item.role) &&
        typeof item.text === "string"
      )
      .slice(-12)
      .map((item) => ({
        role: item.role,
        parts: [{ text: item.text.slice(0, 6000) }],
      })),
    {
      role: "user",
      parts: [{ text: message.slice(0, 12000) }],
    },
  ];

  let lastError;

  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt() }],
            },
            contents,
            generationConfig: {
              temperature: 0.3,
              responseMimeType: "application/json",
              maxOutputTokens: 1200,
            },
          }),
        }
      );

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const details = body?.error?.message || `HTTP ${response.status}`;
        lastError = new Error(`${model}: ${details}`);

        console.error("Gemini-Modell fehlgeschlagen:", model, response.status);

        if ([400, 401, 403, 404, 429].includes(response.status)) {
          continue;
        }

        throw lastError;
      }

      const text = extractText(body);

      if (!text) {
        lastError = new Error(`${model}: leere Antwort`);
        continue;
      }

      return safeJson(text);
    } catch (error) {
      lastError = error;
      console.error("Gemini-Anfrage fehlgeschlagen:", error.message);
    }
  }

  throw lastError || new Error("Kein Gemini-Modell verfügbar.");
}

module.exports = async function handler(req, res) {
  if (req.method === "GET" && req.query?.test === "1") {
    return res.status(200).json({
      ok: true,
      function: "chat-ai",
      provider: "Google Gemini",
      models: MODELS,
      hasGoogleApiKey: Boolean(process.env.GOOGLE_API_KEY),
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      error: "Methode nicht erlaubt",
    });
  }

  try {
    const body = req.body || {};
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      return res.status(400).json({
        error: "Bitte gib eine Nachricht ein.",
      });
    }

    const history = Array.isArray(body.history) ? body.history : [];
    const result = await askGemini(message, history);

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("BlueFix Chat API:", error.message);

    return res.status(500).json({
      ok: false,
      error: "Die KI ist momentan nicht erreichbar.",
      reply:
        "Entschuldigung, unser KI-Chat ist momentan nicht erreichbar. " +
        "Bitte kontaktiere BlueFix unter +41 762299182 oder " +
        "BlueFix.info@gmail.com.",
    });
  }
};
