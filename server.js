const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('WebSocket Relay (Radar) is running');
});

const wss = new WebSocket.Server({ server, path: '/ws' });

// تعريف واحد فقط لـ connection
wss.on('connection', (ws) => {
  ws.isAlive = true;
  console.log('متصفح جديد اتصل. العدد الحالي:', wss.clients.size);

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    let message;
    try { message = JSON.parse(rawData.toString()); } catch (e) { return; }

    // إعادة بث لكل المتصلين الآخرين
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        try { client.send(JSON.stringify(message)); } catch (e) {}
      }
    });
  });

  ws.on('close', () => {
    console.log('متصفح قطع الاتصال. العدد المتبقي:', wss.clients.size);
  });

  ws.on('error', (err) => {
    console.error('خطأ:', err.message);
  });
});

// نبضات القلب
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('إنهاء اتصال ميت');
      return ws.terminate();
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, 30000);

wss.on('close', () => clearInterval(interval));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket Relay listening on port ${PORT}`);
});
