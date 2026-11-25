(function() {
    'use strict';

    const BROADCAST_URL = 'wss://sudan-market-2.onrender.com';
    let socket;

    function connect() {
        socket = new WebSocket(BROADCAST_URL);

        socket.onopen = function() {
            console.log('متصل بالبث المباشر');
            document.getElementById('broadcastStatus').textContent = 'متصل بالبث';
            document.getElementById('broadcastStatus').style.color = 'var(--success-color)';
        };

        socket.onmessage = function(event) {
            const newPost = JSON.parse(event.data);
            window.store.posts = [newPost, ...window.store.posts];
        };

        socket.onclose = function() {
            console.log('تم قطع الاتصال بالبث المباشر');
            document.getElementById('broadcastStatus').textContent = 'غير متصل بالبث';
            document.getElementById('broadcastStatus').style.color = 'var(--error-color)';
            // إعادة الاتصال بعد 5 ثوان
            setTimeout(connect, 5000);
        };

        socket.onerror = function(error) {
            console.error('خطأ في البث المباشر:', error);
        };
    }

    function broadcast(post) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(post));
        } else {
            console.error('غير متصل بالبث المباشر');
        }
    }

    // بدء الاتصال عند تحميل الصفحة
    connect();

    window.broadcast = broadcast;
})();