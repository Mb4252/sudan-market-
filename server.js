const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 10000;

// 👑 OWNER_ID من متغيرات بيئة Render (لا يظهر في الكود)
const OWNER_ID = process.env.OWNER_ID || "";
if (!OWNER_ID) {
  console.warn("⚠️ تحذير: OWNER_ID غير مضبوط في متغيرات البيئة. لن يعمل نظام الموافقة.");
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('WebSocket Relay (Radar) is running');
});

const wss = new WebSocket.Server({ server, path: '/ws' });

// خريطة: ws => { userId, isOwner }
const clients = new Map();

wss.on('connection', (ws) => {
  ws.isAlive = true;
  clients.set(ws, { userId: null, isOwner: false });
  console.log('متصفح جديد اتصل. العدد الحالي:', wss.clients.size);

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (rawData) => {
    let message;
    try { message = JSON.parse(rawData.toString()); } catch (e) { return; }

    // عند HELLO: تحقق من هوية المستخدم
    if (message.type === "HELLO") {
      const info = clients.get(ws);
      info.userId = String(message.userId || "");
      info.isOwner = (info.userId === OWNER_ID && OWNER_ID !== "");
      // أبلغ المتصفح إذا كان مالكاً (بدون كشف OWNER_ID نفسه)
      try {
        ws.send(JSON.stringify({ type: "IDENTITY", isOwner: info.isOwner }));
      } catch (e) {}
      console.log(`HELLO من ${info.userId} | مالك: ${info.isOwner}`);
      return;
    }

    // عمليات المالك فقط: التحقق من الهوية قبل البث
    const ownerOnlyTypes = [
      "APPROVE_VILLAGE", "APPROVE_SHOP",
      "REJECT_VILLAGE", "REJECT_SHOP",
      "DELETE_ITEM"
    ];
    if (ownerOnlyTypes.includes(message.type)) {
      const info = clients.get(ws);
      if (!info || !info.isOwner) {
        try { ws.send(JSON.stringify({ type: "ERROR", message: "غير مصرح: هذه العملية للمالك فقط" })); } catch (e) {}
        console.log(`❌ محاولة غير مصرح بها من ${info ? info.userId : "?"}: ${message.type}`);
        return;
      }
      // المالك موثّق — اسمح بالبث
      console.log(`✅ عملية مالك موثقة: ${message.type}`);
    }

    // إعادة بث لكل المتصلين الآخرين
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        try { client.send(JSON.stringify(message)); } catch (e) {}
      }
    });
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('متصفح قطع الاتصال. العدد المتبقي:', wss.clients.size);
  });

  ws.on('error', (err) => {
    console.error('خطأ:', err.message);
  });
});

// نبضات القلب
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
