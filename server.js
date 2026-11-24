// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const AI_API_KEY = process.env.AI_API_KEY || '';

app.use(express.json({ limit: '64kb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    aiKeyConfigured: Boolean(AI_API_KEY),
    connectedClients: wss.clients.size
  });
});

app.get('/stats', (req, res) => {
  res.json({ connectedClients: wss.clients.size });
});

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

      const id = typeof parsed.id === 'string' && parsed.id.trim()
        ? parsed.id.trim().slice(0, 80)
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const payload = JSON.stringify({
        type: 'post',
        id,
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

const HEARTBEAT_INTERVAL = 30000;
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, HEARTBEAT_INTERVAL);

const SYSTEM_BROADCAST_INTERVAL = 60000;
const systemBroadcastInterval = setInterval(() => {
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

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

function shutdown(){
  clearInterval(heartbeatInterval);
  clearInterval(systemBroadcastInterval);
  wss.close(() => {
    console.log('WebSocket server closed');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
