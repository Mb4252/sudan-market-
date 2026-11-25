// public/core/render-stream.js
(function() {
    'use strict';

    // إعدادات الاتصال
    const WEBSOCKET_URL = 'wss://sudan-market-2.onrender.com';
    const PING_INTERVAL = 30000;
    const RECONNECT_DELAY = 5000;

    let socket;
    let pingInterval;
    let reconnectTimeout;

    // تحديث حالة الاتصال
    function updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    // إرسال ping دوري
    function startPing() {
        pingInterval = setInterval(() => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, PING_INTERVAL);
    }

    // إيقاف ping
    function stopPing() {
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
    }

    // الاتصال بالويب سوكيت
    function connect() {
        socket = new WebSocket(WEBSOCKET_URL);

        socket.onopen = () => {
            console.log('WebSocket connected');
            updateConnectionStatus('Connected');
            startPing();
        };

        socket.onclose = () => {
            console.log('WebSocket disconnected');
            updateConnectionStatus('Disconnected');
            stopPing();
            scheduleReconnect();
        };

        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus('Error');
        };
    }

    // إعادة الاتصال التلقائي
    function scheduleReconnect() {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }
        reconnectTimeout = setTimeout(connect, RECONNECT_DELAY);
    }

    // بدء الاتصال عند تحميل الصفحة
    window.addEventListener('load', () => {
        connect();
    });

    // إغلاق الاتصال عند مغادرة الصفحة
    window.addEventListener('beforeunload', () => {
        if (socket) {
            socket.close();
        }
        stopPing();
    });

    // تحديث حالة الاتصال عند تغيير الشبكة
    window.addEventListener('online', () => {
        updateConnectionStatus('Reconnecting...');
        connect();
    });

    window.addEventListener('offline', () => {
        updateConnectionStatus('Offline');
    });

    // تصدير الواجهة العامة
    window.renderStream = {
        connect: connect,
        disconnect: () => {
            if (socket) {
                socket.close();
            }
        }
    };
})();