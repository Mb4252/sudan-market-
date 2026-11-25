// public/sdm/sdm-render-sync.js
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
        }
    }

    // إعادة الاتصال
    function reconnect() {
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }

        reconnectTimeout = setTimeout(() => {
            connect();
        }, RECONNECT_DELAY);
    }

    // الاتصال بالويب سوكيت
    function connect() {
        updateConnectionStatus('Connecting...');

        socket = new WebSocket(WEBSOCKET_URL);

        socket.onopen = function() {
            updateConnectionStatus('Connected');
            startPing();
        };

        socket.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'update') {
                    // معالجة التحديثات هنا
                    console.log('Update received:', data);
                }
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        socket.onclose = function() {
            updateConnectionStatus('Disconnected');
            stopPing();
            reconnect();
        };

        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
            updateConnectionStatus('Error');
        };
    }

    // بدء الاتصال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        connect();
    });

    // تحديث حالة الاتصال عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        updateConnectionStatus('Initializing...');
    });

    // إظهار حالة الاتصال في الواجهة
    document.addEventListener('DOMContentLoaded', function() {
        const statusElement = document.createElement('div');
        statusElement.id = 'connection-status';
        statusElement.style.position = 'fixed';
        statusElement.style.bottom = '10px';
        statusElement.style.right = '10px';
        statusElement.style.padding = '5px 10px';
        statusElement.style.backgroundColor = '#f0f0f0';
        statusElement.style.borderRadius = '5px';
        document.body.appendChild(statusElement);
    });

    // تصدير الدوال العامة
    window.sdmRenderSync = {
        connect: connect,
        updateConnectionStatus: updateConnectionStatus
    };
})();