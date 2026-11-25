(function() {
    'use strict';

    const socket = new WebSocket('wss://sudan-market-2.onrender.com');

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        window.store.update(data);
    };

    function broadcastUpdate(data) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(data));
        }
    }

    window.broadcast = broadcastUpdate;
})();