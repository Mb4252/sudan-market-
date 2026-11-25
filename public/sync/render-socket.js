(function() {
    'use strict';

    // اتصال WebSocket
    const socket = new WebSocket('wss://sudan-market-2.onrender.com');

    // حالة الاتصال
    let isConnected = false;

    // إرسال ping كل 30 ثانية
    const pingInterval = setInterval(() => {
        if (isConnected) {
            socket.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);

    // فتح الاتصال
    socket.addEventListener('open', () => {
        isConnected = true;
        console.log('تم فتح الاتصال ب Render');
        notifyListeners({ status: 'تم الاتصال ب Render بنجاح' });
    });

    // إغلاق الاتصال
    socket.addEventListener('close', () => {
        isConnected = false;
        console.log('تم إغلاق الاتصال ب Render');
        clearInterval(pingInterval);
        notifyListeners({ status: 'تم إغلاق الاتصال ب Render' });
    });

    // استقبال الرسائل
    socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'new-post') {
            if (window.store.isValidDate(new Date(data.data.timestamp))) {
                window.store.addPost(data.data);
            }
        } else if (data.type === 'ping') {
            socket.send(JSON.stringify({ type: 'pong' }));
        }
    });

    // معالجة الأخطاء
    socket.addEventListener('error', (error) => {
        console.error('خطأ في الاتصال ب Render:', error);
        notifyListeners({ status: 'خطأ في الاتصال ب Render' });
    });

    // إشعار المستمعين بالتحسينات
    function notifyListeners(data) {
        if (window.renderSocketListeners) {
            window.renderSocketListeners.forEach(listener => listener(data));
        }
    }

    // تعرّف على window.renderSocket
    window.renderSocket = {
        isConnected,
        on: function(event, callback) {
            if (event === 'socketStatus') {
                if (!window.renderSocketListeners) {
                    window.renderSocketListeners = [];
                }
                window.renderSocketListeners.push(callback);
            }
        }
    };

    // استيراد الدوال من window.renderSocket
    if (typeof window.renderSocket === 'undefined') {
        console.error('فشل في تعريف window.renderSocket');
    }

})();