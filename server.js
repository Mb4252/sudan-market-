// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Stats endpoint – returns number of currently connected WebSocket clients
app.get('/stats', (req, res) => {
  res.json({ connectedClients: wss.clients.size });
});

// WebSocket handling – pure relay, no persistence
wss.on('connection', ws => {
  // Notify client that connection is alive (optional heartbeat)
  ws.send(JSON.stringify({ type: 'system', timestamp: new Date().toISOString() }));

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'post') {
        // Broadcast to all connected clients, including the sender
        wss.clients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(msg));
          }
        });
      }
    } catch (e) {
      console.warn('Invalid WebSocket message received:', e);
    }
  });

  ws.on('close', () => {
    // No cleanup needed beyond automatic client set removal
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});