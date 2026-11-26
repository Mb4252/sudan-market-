const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;
const OWNER_ID = process.env.OWNER_ID || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_DEFAULT_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest";

async function askMistral({ system, messages, model }) {
  if (!MISTRAL_API_KEY) {
    return {
      ok: false,
      error: "لم يتم ضبط متغير البيئة MISTRAL_API_KEY على Render"
    };
  }

  const formattedMessages = [];
  if (system && typeof system === 'string') {
    formattedMessages.push({ role: 'system', content: system.slice(0, 3500) });
  }

  if (Array.isArray(messages)) {
    for (const m of messages.slice(-6)) {
      if (!m || typeof m.content !== 'string') continue;
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const content = m.content.trim().slice(0, 800);
      if (content) {
        formattedMessages.push({ role, content });
      }
    }
  }

  if (formattedMessages.length === 0) {
    return { ok: false, error: "لا توجد رسالة صالحة للإرسال" };
  }

  const payload = JSON.stringify({
    model: model || MISTRAL_DEFAULT_MODEL,
    messages: formattedMessages,
    temperature: 0.3,
    max_tokens: 300
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: payload
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }

    if (!response.ok) {
      const msg = data?.message || `خطأ من Mistral (${response.status})`;
      return { ok: false, error: msg };
    }

    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    const tokens = Number(data?.usage?.total_tokens) || 0;
    return { ok: true, reply, tokens };
  }

  return { ok: false, error: "تم تجاوز حد الطلبات مؤقتاً، انتظر بضع ثوانٍ ثم أعد المحاولة." };
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
        return res.end(JSON.stringify({ error: result.error }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        reply: result.reply,
        tokens: result.tokens
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message || 'خطأ في الخادم' }));
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
      console.error('JSON غير صالح:', e.message);
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
            tokens: result.ok ? result.tokens : 0
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
    console.error('خطأ WebSocket:', err.message);
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
