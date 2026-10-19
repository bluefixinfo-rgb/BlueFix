
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

Fakten:
- Inhaber: Jerome Ramspacher.
- Adresse: Weierbuckstrasse 1, 8213 Neunkirch.
- Telefon: 076 229 91 82.
- E-Mail: bluefix.info@gmail.com.
- 6 Monate Garantie auf Reparaturen.
- Wasserschaden-Diagnose: CHF 50.
- Wasserschaden-Reparatur ab CHF 90; keine Garantie auf die Rettung des Geräts.
- Der Preis wird vor Arbeitsbeginn mitgeteilt.
- Erfinde keine Preise, Öffnungszeiten, Termine oder Reparaturdauern.
- Preise müssen bestätigt werden, wenn keine verlässliche Preisliste vorliegt.

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
            temperature: 0.4,
            maxOutputTokens: 500,
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
        if ([400, 401, 403, 404, 429].includes(response.status)) {
          continue;
        }

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
