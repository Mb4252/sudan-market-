(function() {
    'use strict';

    const WS_URL = 'wss://sudan-market-2.onrender.com';
    let socket;

    function connect() {
        socket = new WebSocket(WS_URL);

        socket.onopen = function() {
            console.log('متصل بالبث المباشر');
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'newPost') {
                window.dispatchEvent(new CustomEvent('newPost', { detail: data.post }));
            }
        };

        socket.onclose = function() {
            console.log('تم قطع الاتصال. إعادة الاتصال...');
            setTimeout(connect, 5000);
        };
    }

    function broadcast(post) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'newPost', post }));
        }
    }

    connect();
    window.broadcast = broadcast;
})();