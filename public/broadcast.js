(function() {
    'use strict';

    const WS_URL = 'wss://sudan-market-2.onrender.com';
    let socket;

    function connect() {
        socket = new WebSocket(WS_URL);

        socket.onopen = function() {
            console.log('تم الاتصال بالبث المباشر');
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'post') {
                window.store.updateStore({ posts: [...window.store.posts, data.post] });
            }
        };

        socket.onclose = function() {
            console.log('تم إغلاق الاتصال');
            setTimeout(connect, 5000); // إعادة الاتصال بعد 5 ثوان
        };
    }

    function broadcast(post) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'post', post }));
        }
    }

    connect();

    window.broadcast = broadcast;
})();