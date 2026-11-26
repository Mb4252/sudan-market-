const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const PORT = process.env.PORT || 10000;
const OWNER_ID = process.env.OWNER_ID || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MISTRAL_DEFAULT_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";
const OPENROUTER_DEFAULT_MODEL = process.env.OPENROUTER_MODEL || "openrouter/auto";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

const pushEnabled = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// تخزين اشتراكات Push حسب endpoint مع حفظها في ملف subscriptions.json
const pushSubscriptions = new Map();

function loadSubscriptionsFromDisk() {
  try {
    if (!fs.existsSync(SUBSCRIPTIONS_FILE)) return;
    const raw = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && item.subscription && item.subscription.endpoint) {
          pushSubscriptions.set(item.subscription.endpoint, {
            subscription: item.subscription,
            userId: String(item.userId || "")
          });
        }
      }
      console.log(`[PUSH] تم تحميل ${pushSubscriptions.size} اشتراك من subscriptions.json`);
    }
  } catch (err) {
    console.error("[PUSH_LOAD_ERROR]", err.message);
  }
}

function saveSubscriptionsToDisk() {
  try {
    const list = Array.from(pushSubscriptions.values());
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error("[PUSH_SAVE_ERROR]", err.message);
  }
}

loadSubscriptionsFromDisk();

async function sendPushToAll(payloadObj, senderUserId = "") {
  if (!pushEnabled || pushSubscriptions.size === 0) return;
  const payloadStr = JSON.stringify(payloadObj);
  let changed = false;

  for (const [endpoint, item] of pushSubscriptions.entries()) {
    if (senderUserId && item.userId === senderUserId) continue;
    try {
      await webpush.sendNotification(item.subscription, payloadStr);
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        pushSubscriptions.delete(endpoint);
        changed = true;
      } else {
        console.error("[PUSH_ERROR]", err.message || err);
      }
    }
  }

  if (changed) {
    saveSubscriptionsToDisk();
  }
}

function triggerEventNotification(message) {
  if (!message || typeof message.type !== "string") return;
  const sender = message.userId || message.village?.userId || message.shop?.userId || message.price?.userId || "";

  if ((message.type === "NEW_VILLAGE" || message.type === "APPROVE_VILLAGE") && message.village) {
    sendPushToAll({
      title: "🏘️ منطقة / قرية جديدة",
      body: `تمت إضافة قرية "${message.village.name}"${message.village.state ? " (" + message.village.state + ")" : ""}`,
      url: "./"
    }, sender);
  } else if ((message.type === "NEW_SHOP" || message.type === "APPROVE_SHOP") && message.shop) {
    sendPushToAll({
      title: "🏪 متجر / عرض جديد",
      body: `تمت إضافة متجر "${message.shop.name}"${message.shop.owner ? " للمالك: " + message.shop.owner : ""}`,
      url: "./"
    }, sender);
  } else if (message.type === "NEW_PRICE" && message.price) {
    sendPushToAll({
      title: "💰 سعر جديد في الرادار",
      body: `${message.price.name}: ${message.price.price} ج.س (${message.price.unit || "وحدة"})`,
      url: "./"
    }, sender);
  }
}

const USER_DAILY_TOKEN_LIMIT = Number(process.env.USER_DAILY_TOKEN_LIMIT || 4000);
const REFILL_WINDOW_MS = 24 * 60 * 60 * 1000;
const userTokenQuotas = new Map();

function getUserQuota(userId) {
  const safeId = String(userId || 'anonymous').trim() || 'anonymous';
  const now = Date.now();
  let entry = userTokenQuotas.get(safeId);

  if (!entry) {
    entry = { usedTokens: 0, periodStart: now, refilled: false };
    userTokenQuotas.set(safeId, entry);
    return entry;
  }

  if (now - entry.periodStart >= REFILL_WINDOW_MS) {
    entry.usedTokens = 0;
    entry.periodStart = now;
    entry.refilled = true;
    userTokenQuotas.set(safeId, entry);
  } else {
    entry.refilled = false;
  }

  return entry;
}

function addUserTokenUsage(userId, tokensSpent) {
  const entry = getUserQuota(userId);
  const spent = Math.max(0, Number(tokensSpent) || 0);
  entry.usedTokens += spent;
  const remaining = Math.max(0, USER_DAILY_TOKEN_LIMIT - entry.usedTokens);
  const resetAt = entry.periodStart + REFILL_WINDOW_MS;
  return {
    usedTokens: entry.usedTokens,
    remainingTokens: remaining,
    limit: USER_DAILY_TOKEN_LIMIT,
    resetAt,
    refilled: entry.refilled
  };
}

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

async function askMistral({ system, messages, model, userId }) {
  const quota = getUserQuota(userId);
  if (quota.usedTokens >= USER_DAILY_TOKEN_LIMIT) {
    const remainingMs = Math.max(0, (quota.periodStart + REFILL_WINDOW_MS) - Date.now());
    const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
    return {
      ok: false,
      statusCode: 429,
      error: `انتهى حد التوكن لليوم (${USER_DAILY_TOKEN_LIMIT} توكن). سيتم إعادة التعبئة تلقائياً بعد حوالي ${remainingHours} ساعة.`,
      quota: {
        usedTokens: quota.usedTokens,
        remainingTokens: 0,
        limit: USER_DAILY_TOKEN_LIMIT,
        resetAt: quota.periodStart + REFILL_WINDOW_MS,
        refilled: quota.refilled
      },
      debug: { stage: "QUOTA_EXCEEDED", userId }
    };
  }

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

  let finalResult = mistralResult;

  if (!mistralResult.ok && OPENROUTER_API_KEY) {
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
      finalResult = openRouterResult;
    } else {
      finalResult = {
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
  }

  const spent = finalResult.ok ? (Number(finalResult.tokens) || 25) : 0;
  const updatedQuota = addUserTokenUsage(userId, spent);

  return {
    ...finalResult,
    quota: updatedQuota
  };
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

  if (urlPath === '/api/push-vapid-key' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      enabled: pushEnabled,
      publicKey: pushEnabled ? VAPID_PUBLIC_KEY : ""
    }));
  }

  if (urlPath === '/api/push-subscribe' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const sub = body.subscription;
      if (!sub || !sub.endpoint) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: "اشتراك Push غير صالح" }));
      }
      pushSubscriptions.set(sub.endpoint, {
        subscription: sub,
        userId: String(body.userId || "")
      });
      saveSubscriptionsToDisk();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, subscribers: pushSubscriptions.size }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message || "خطأ في الاشتراك" }));
    }
  }

  if (urlPath === '/api/mistral-debug' && req.method === 'GET') {
    const testResult = await askMistral({
      system: "أجب بكلمة واحدة: جاهز",
      messages: [{ role: "user", content: "اختبار" }],
      model: MISTRAL_DEFAULT_MODEL,
      userId: "debug_user"
    });

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      hasMistralKey: Boolean(MISTRAL_API_KEY),
      hasOpenRouterKey: Boolean(OPENROUTER_API_KEY),
      pushEnabled,
      subscribersCount: pushSubscriptions.size,
      mistralModel: MISTRAL_DEFAULT_MODEL,
      openRouterModel: OPENROUTER_DEFAULT_MODEL,
      dailyTokenLimit: USER_DAILY_TOKEN_LIMIT,
      refillWindowHours: 24,
      testResult
    }, null, 2));
  }

  if (urlPath === '/api/mistral-chat' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await askMistral({
        system: body.system,
        messages: body.messages,
        model: body.model,
        userId: body.userId
      });

      if (!result.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({
          error: result.error,
          statusCode: result.statusCode,
          quota: result.quota || null,
          debug: result.debug
        }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        reply: result.reply,
        tokens: result.tokens,
        quota: result.quota || null,
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
        model: message.model,
        userId: message.userId
      });
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'MISTRAL_CHAT_REPLY',
            userId: message.userId || '',
            reply: result.ok ? result.reply : `⚠️ ${result.error}`,
            tokens: result.ok ? result.tokens : 0,
            quota: result.quota || null,
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

    triggerEventNotification(message);
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
