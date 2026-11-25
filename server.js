const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://mb4252.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, clients: wss.clients.size });
});

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const payload = typeof msg === 'string' ? msg : msg.toString('utf8');
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Relay server listening on ${PORT}`);
});
