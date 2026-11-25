(function() {
    'use strict';

    let socket;
    const RECONNECT_INTERVAL = 5000;

    function connect() {
        socket = new WebSocket('wss://sudan-market-2.onrender.com');

        socket.onopen = function() {
            console.log('متصل بـ Render');
            window.store.updateStatus('متصل');
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            window.store.addPost(data);
        };

        socket.onclose = function() {
            console.log('تم قطع الاتصال، محاولة إعادة الاتصال...');
            window.store.updateStatus('غير متصل');
            setTimeout(connect, RECONNECT_INTERVAL);
        };

        socket.onerror = function(error) {
            console.error('خطأ في الاتصال:', error);
        };
    }

    connect();

    window.broadcast = function(post) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(post));
        }
    };
})();