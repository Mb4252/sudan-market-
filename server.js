const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;
const OWNER_ID = process.env.OWNER_ID || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MISTRAL_DEFAULT_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";
const OPENROUTER_DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

function logError(stage, detail) {
  console.error(`[MISTRAL-TRACKER][${new Date().toISOString()}][${stage}]`, detail);
}

function logInfo(stage, detail) {
  console.log(`[MISTRAL-TRACKER][${new Date().toISOString()}][${stage}]`, detail);
}

function buildFormattedMessages(system, messages) {
  const formattedMessages = [];
  if (system && typeof system === 'string') {
    formattedMessages.push({ role: 'system', content: system.slice(0, 3000) });
  }

  if (Array.isArray(messages)) {
    for (const m of messages.slice(-4)) {
      if (!m || typeof m.content !== 'string') continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = m.content.trim().slice(0, 600);
      if (content) {
        formattedMessages.push({ role, content });
      }
    }
  }
  return formattedMessages;
}

async function callProvider({ providerName, url, apiKey, model, formattedMessages, extraHeaders = {} }) {
  if (!apiKey) {
    return {
      ok: false,
      statusCode: 500,
      error: `المفتاح غير مضبوط لـ ${providerName}`,
      debug: { stage: "CONFIG", provider: providerName, hasKey: false, model }
    };
  }

  const payload = JSON.stringify({
    model,
    messages: formattedMessages,
    temperature: 0.3,
    max_tokens: 240
  });

  const maxAttempts = providerName === "MISTRAL" ? 2 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logInfo("REQUEST", `[${providerName}] المحاولة ${attempt} بالموديل ${model}`);

    let response;
    let rawText = "";
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...extraHeaders
        },
        body: payload
      });
      rawText = await response.text();
    } catch (netErr) {
      logError("NETWORK", `[${providerName}] فشل الشبكة: ${netErr.message}`);
      return {
        ok: false,
        statusCode: 502,
        error: `فشل الشبكة مع ${providerName}: ${netErr.message}`,
        debug: { stage: "NETWORK", provider: providerName, attempt, model }
      };
    }

    let parsed = {};
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch (e) {
      logError("PARSE_RESPONSE", `[${providerName}] رد غير JSON (HTTP ${response.status}): ${rawText.slice(0, 250)}`);
    }

    const retryAfterHeader = response.headers.get("retry-after") || null;

    if (!response.ok) {
      const msg = parsed?.message || parsed?.error?.message || rawText.slice(0, 250) || `HTTP ${response.status}`;
      const type = parsed?.type || parsed?.code || null;

      logError(
        "API_ERROR",
        `[${providerName}] المحاولة ${attempt} | HTTP ${response.status} | type=${type} | retry-after=${retryAfterHeader} | msg=${msg}`
      );

      if (response.status === 429 && attempt < maxAttempts) {
        const waitMs = retryAfterHeader && !isNaN(Number(retryAfterHeader))
          ? Math.min(Number(retryAfterHeader) * 1000, 3000)
          : 1500;
        logInfo("RETRY_429", `[${providerName}] انتظار ${waitMs}ms ثم إعادة المحاولة...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      return {
        ok: false,
        statusCode: response.status,
        error: `${msg} [HTTP ${response.status} - ${providerName}]`,
        debug: {
          stage: "API_ERROR",
          provider: providerName,
          attempt,
          httpStatus: response.status,
          type,
          retryAfter: retryAfterHeader,
          model
        }
      };
    }

    const reply = parsed?.choices?.[0]?.message?.content?.trim() || "";
    const tokens = Number(parsed?.usage?.total_tokens) || 0;
    logInfo("SUCCESS", `[${providerName}] نجح الرد في المحاولة ${attempt}، التوكنات: ${tokens}`);

    return {
      ok: true,
      reply,
      tokens,
      debug: { stage: "SUCCESS", provider: providerName, attempt, httpStatus: response.status, model }
    };
  }
}

async function askMistral({ system, messages, model }) {
  const formattedMessages = buildFormattedMessages(system, messages);
  if (formattedMessages.length === 0) {
    return {
      ok: false,
      statusCode: 400,
      error: "لا توجد رسالة صالحة للإرسال",
      debug: { stage: "VALIDATION" }
    };
  }

  const mistralResult = await callProvider({
    providerName: "MISTRAL",
    url: "https://api.mistral.ai/v1/chat/completions",
    apiKey: MISTRAL_API_KEY,
    model: model || MISTRAL_DEFAULT_MODEL,
    formattedMessages
  });

  if (mistralResult.ok) {
    return mistralResult;
  }

  if (OPENROUTER_API_KEY) {
    logInfo("FALLBACK_OPENROUTER", `تعذر Mistral (${mistralResult.error}) -> تجربة OPENROUTER_API_KEY بالموديل ${OPENROUTER_DEFAULT_MODEL}...`);
    const openRouterResult = await callProvider({
      providerName: "OPENROUTER",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: OPENROUTER_API_KEY,
      model: OPENROUTER_DEFAULT_MODEL,
      formattedMessages,
      extraHeaders: {
        "HTTP-Referer": "https://mb4252.github.io/sudan-market-/",
        "X-Title": "Radar Asaar Al-Hay"
      }
    });

    if (openRouterResult.ok) {
      return openRouterResult;
    }

    return {
      ok: false,
      statusCode: openRouterResult.statusCode || mistralResult.statusCode || 429,
      error: `تعذر Mistral (${mistralResult.error}) وتعذر OpenRouter (${openRouterResult.error})`,
      debug: {
        stage: "BOTH_FAILED",
        mistralDebug: mistralResult.debug,
        openRouterDebug: openRouterResult.debug
      }
    };
  }

  return mistralResult;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 250000) {
        reject(new Error('حجم الطلب كبير جداً'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('JSON غير صالح'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '/').split('?')[0];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (urlPath === '/api/mistral-debug' && req.method === 'GET') {
    const testResult = await askMistral({
      system: "أجب بكلمة واحدة: جاهز",
      messages: [{ role: "user", content: "اختبار" }],
      model: MISTRAL_DEFAULT_MODEL
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      hasMistralKey: Boolean(MISTRAL_API_KEY),
      hasOpenRouterKey: Boolean(OPENROUTER_API_KEY),
      mistralModel: MISTRAL_DEFAULT_MODEL,
      openRouterModel: OPENROUTER_DEFAULT_MODEL,
      testResult
    }, null, 2));
  }

  if (urlPath === '/api/mistral-chat' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await askMistral({
        system: body.system,
        messages: body.messages,
        model: body.model
      });

      if (!result.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          error: result.error,
          statusCode: result.statusCode,
          debug: result.debug
        }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        reply: result.reply,
        tokens: result.tokens,
        debug: result.debug
      }));
    } catch (err) {
      logError("HTTP_HANDLER", err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        error: err.message || 'خطأ في الخادم',
        debug: { stage: "HTTP_HANDLER" }
      }));
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('WebSocket Relay (Radar) is running');
});

const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Map();

function broadcastPresence() {
  const payload = JSON.stringify({
    type: 'PRESENCE',
    count: wss.clients.size
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(payload); } catch (e) {}
    }
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  clients.set(ws, { userId: null, isOwner: false });
  console.log('متصفح متصل. العدد:', wss.clients.size);
  broadcastPresence();

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', async (rawData) => {
    let message;
    try {
      const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData);
      message = JSON.parse(text);
    } catch (e) {
      logError("WS_PARSE", `JSON غير صالح: ${e.message}`);
      return;
    }

    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'HELLO') {
      const info = clients.get(ws) || { userId: null, isOwner: false };
      info.userId = String(message.userId || '');
      info.isOwner = Boolean(OWNER_ID && info.userId === OWNER_ID);
      clients.set(ws, info);
      try {
        ws.send(JSON.stringify({ type: 'IDENTITY', isOwner: info.isOwner }));
      } catch (e) {}
      return;
    }

    if (message.type === 'MISTRAL_CHAT') {
      const result = await askMistral({
        system: message.system,
        messages: message.messages,
        model: message.model
      });
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'MISTRAL_CHAT_REPLY',
            userId: message.userId || '',
            reply: result.ok ? result.reply : `⚠️ ${result.error}`,
            tokens: result.ok ? result.tokens : 0,
            debug: result.debug || null
          }));
        } catch (e) {}
      }
      return;
    }

    const ownerOnlyTypes = [
      'APPROVE_VILLAGE',
      'APPROVE_SHOP',
      'REJECT_VILLAGE',
      'REJECT_SHOP',
      'DELETE_ITEM'
    ];

    if (ownerOnlyTypes.includes(message.type)) {
      const info = clients.get(ws);
      if (!info || !info.isOwner) {
        try {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'غير مصرح: هذه العملية للمالك فقط' }));
        } catch (e) {}
        return;
      }
    }

    const outgoing = JSON.stringify(message);
    let sentCount = 0;

    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        try {
          client.send(outgoing);
          sentCount++;
        } catch (e) {}
      }
    });

    console.log(`بث [${message.type}] إلى ${sentCount} متصل`);
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('متصفح خرج. العدد:', wss.clients.size);
    broadcastPresence();
  });

  ws.on('error', (err) => {
    logError("WS_SOCKET", err.message);
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket Relay listening on port ${PORT}`);
});
