(function() {
    'use strict';

    const channel = new BroadcastChannel('posts');
    let ws = null;
    let isConnecting = true;
    let connectionAttempts = 0;
    const maxAttempts = 5;
    const attemptDelay = 3000;

    // Initialize WebSocket connection
    function initWebSocket() {
        ws = new WebSocket(window.APP_CONFIG.wsUrl);
        ws.onopen = onOpen;
        ws.onclose = onClose;
        ws.onerror = onError;
        ws.onmessage = onMessage;
    }

    // WebSocket event handlers
    function onOpen() {
        connectionAttempts = 0;
        isConnecting = false;
        updateUIStatus('متصل بالبث المباشر', true);
        channel.postMessage({ type: 'connect', data: { status: 'online' } });
    }

    function onClose() {
        if (connectionAttempts < maxAttempts) {
            connectionAttempts++;
            setTimeout(initWebSocket, attemptDelay);
        } else {
            isConnecting = true;
            updateUIStatus('فشل الاتصال بالبث المباشر', false);
        }
    }

    function onError(error) {
        console.error('WebSocket error:', error);
        updateUIStatus('خطأ في الاتصال', false);
    }

    function onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }

    // Message handling
    function handleMessage(message) {
        switch (message.type) {
            case 'POST':
                window.postStorage.addPost(message.data);
                break;
            case 'STATS':
                window.ReactiveStore.setState({ stats: message.data });
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    // Broadcast channel handler
    channel.onmessage = function(event) {
        if (event.data.type === 'connect') {
            updateUIStatus('متصل بالبث المباشر', true);
        }
    };

    // Public API
    window.BroadcastManager = {
        init: function() {
            initWebSocket();
        },
        sendPost: function(post) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'POST', data: post }));
            } else {
                console.warn('WebSocket not connected. Saving locally only.');
                window.postStorage.addPost(post);
            }
        },
        isConnected: function() {
            return ws && ws.readyState === WebSocket.OPEN;
        }
    };

    // Helper function to update UI status
    function updateUIStatus(message, isOnline) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
        }

        const syncBadge = document.getElementById('syncBadge');
        if (syncBadge) {
            syncBadge.className = `badge ${isOnline ? 'online' : 'offline'}`;
            syncBadge.title = isOnline ? 'مزامنة' : 'غير مزامن';
        }
    }

    console.log('BroadcastManager initialized');
})();