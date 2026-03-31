#!/bin/bash

echo "🚀 Starting Crystal Mining Bot on Render..."
echo "📱 WebApp URL: ${WEBAPP_URL}"

# تنظيف أي عمليات سابقة
pkill -f "node index.js" 2>/dev/null
pkill -f "node server.js" 2>/dev/null

# تشغيل خادم الويب أولاً
echo "🌐 Starting web server..."
node server.js &
SERVER_PID=$!

# انتظر قليلاً
sleep 2

# تشغيل البوت
echo "🤖 Starting Telegram bot..."
node index.js &
BOT_PID=$!

# مراقبة العمليات
wait $SERVER_PID $BOT_PID
