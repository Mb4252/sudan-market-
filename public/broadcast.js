(function() {
    'use strict';

    let socket;

    function connectWebSocket() {
        socket = new WebSocket('wss://sudan-market-2.onrender.com');

        socket.onopen = () => {
            console.log('متصل بالبث المباشر');
            window.updateStore({ status: 'متصل' });
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            window.updateStore({ posts: [...store.posts, data] });
        };

        socket.onclose = () => {
            console.log('تم قطع الاتصال');
            window.updateStore({ status: 'غير متصل' });
            setTimeout(connectWebSocket, 5000);
        };
    }

    function broadcast(data) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        }
    }

    connectWebSocket();
    window.broadcast = broadcast;
})();