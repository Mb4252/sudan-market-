// server.js
const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const AI_API_KEY = process.env.AI_API_KEY || '';

app.use(express.json({ limit: '64kb' }));

// مسار فحص جاهزية الخدمة على Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    aiKeyConfigured: Boolean(AI_API_KEY),
    connectedClients: wss.clients.size
  });
});

// إحصائيات إضافية (عدد المتصلين)
app.get('/stats', (req, res) => {
  res.json({ connectedClients: wss.clients.size });
});

// بث لحظي: أي رسالة ينشرها متصفح تصل لبقية المتصفحات المتصلة فقط (لا تخزين على Render)
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.send(JSON.stringify({
    type: 'system',
    message: 'متصل ببث المتصفح المباشر (لا يتم حفظ البيانات على الخادم)'
  }));

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    try {
      const parsed = JSON.parse(rawData.toString());
      if (!parsed || typeof parsed.content !== 'string' || !parsed.content.trim()) {
        return;
      }

      const payload = JSON.stringify({
        type: 'post',
        author: typeof parsed.author === 'string' && parsed.author.trim()
          ? parsed.author.trim().slice(0, 40)
          : 'مستخدم',
        content: parsed.content.trim().slice(0, 2000),
        timestamp: new Date().toISOString()
      });

      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      }
    } catch (err) {
      console.error('WS_PARSE_ERROR:', err.message);
    }
  });

  ws.on('error', (err) => {
    console.error('WS_CLIENT_ERROR:', err.message);
  });
});

// Heartbeat / keep‑alive mechanism
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, HEARTBEAT_INTERVAL);

wss.on('close', () => clearInterval(interval));

// Broadcast server timestamp every minute as a system message (no storage)
const SYSTEM_BROADCAST_INTERVAL = 60000; // 1 minute
setInterval(() => {
  const payload = JSON.stringify({
    type: 'system',
    timestamp: new Date().toISOString()
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}, SYSTEM_BROADCAST_INTERVAL);

// التقاط أخطاء الخادم غير المتوقعة لتظهر بوضوح في سجلات Render
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT_EXCEPTION:', err.stack || err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED_REJECTION:', reason);
});

server.listen(PORT, () => {
  console.log(`Relay server running on port ${PORT}`);
});
