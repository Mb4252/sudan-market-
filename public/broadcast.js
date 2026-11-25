(function() {
    'use strict';

    const WS_URL = 'wss://sudan-market-2.onrender.com';

    let socket;

    function connectWebSocket() {
        socket = new WebSocket(WS_URL);

        socket.onopen = function() {
            console.log('متصل بالبث المباشر');
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'post') {
                window.store.posts = [data.post, ...window.store.posts];
            }
        };

        socket.onclose = function() {
            console.log('تم قطع الاتصال، محاولة إعادة الاتصال...');
            setTimeout(connectWebSocket, 5000);
        };
    }

    function broadcast(post) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'post', post: post }));
        }
    }

    connectWebSocket();
    window.broadcast = broadcast;
})();