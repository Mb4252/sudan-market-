const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;
const OWNER_ID = process.env.OWNER_ID || "";

const server = http.createServer((req, res) => {
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

  ws.on('message', (rawData) => {
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
