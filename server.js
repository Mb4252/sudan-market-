const WebSocket = require('ws');
const http = require('http');

// Render يحدد المنفذ عبر process.env.PORT
const PORT = process.env.PORT || 10000;

// إنشاء خادم HTTP بسيط (مطلوب لـ Render health checks)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Relay is running');
});

// ربط WebSocket بالخادم
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('متصفح جديد اتصل. العدد الحالي:', wss.clients.size);

  // عند استلام رسالة من هذا المتصفح
  ws.on('message', (rawData) => {
    let message;
    try {
      message = JSON.parse(rawData.toString());
    } catch (e) {
      // إذا لم تكن JSON صالحة، تجاهلها
      return;
    }

    // إعادة بث الرسالة لكل المتصلين الآخرين (وليس المرسل)
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  });

  // عند قطع الاتصال
  ws.on('close', () => {
    console.log('متصفح قطع الاتصال. العدد المتبقي:', wss.clients.size);
  });

  // التعامل مع الأخطاء لمنع انهيار الخادم
  ws.on('error', (err) => {
    console.error('خطأ في WebSocket:', err.message);
  });
});

// نبضات القلب: كل 30 ثانية، أرسل ping لمن لا يرد، اقطعه
// هذا يمنع الاتصالات الميتة من التراكم [citation:3][citation:6]
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

wss.on('close', () => {
  clearInterval(interval);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WebSocket Relay listening on port ${PORT}`);
});
