(function() {
    'use strict';

    const STORE_KEY = 'sudanMarketPosts';
    const MAX_ITEMS = 1000;
    const RECONNECT_INTERVAL = 5000; // 5 ثوانٍ
    const MAX_RETRIES = 3;

    class Store {
        constructor() {
            this.data = this.load();
            this.eventTarget = new EventTarget();
            this.reconnectAttempts = 0;
            this.isConnected = false;
            this.ws = null;
            this.initWebSocket();
        }

        // التحقق من تاريخ صالح
        isValidDate(date) {
            return date instanceof Date && !isNaN(date.getTime());
        }

        // تحميل من localStorage
        load() {
            try {
                const saved = localStorage.getItem(STORE_KEY);
                return saved ? JSON.parse(saved) : [];
            } catch (e) {
                console.error('خطأ في تحميل localStorage:', e);
                return [];
            }
        }

        // حفظ في localStorage
        save() {
            try {
                localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
                this.emit('storeUpdated', { posts: this.data, status: 'saved' });
            } catch (e) {
                console.error('خطأ في حفظ localStorage:', e);
            }
        }

        // إضافة منشور مع صحة التاريخ
        add(post) {
            if (!this.isValidDate(new Date(post.timestamp))) {
                throw new Error('تاريخ غير صالح');
            }
            this.data = [...this.data.slice(-MAX_ITEMS + 1), post];
            this.save();
            this.broadcastPost(post);
        }

        // بث المنشور عبر WebSocket
        broadcastPost(post) {
            if (this.isConnected) {
                try {
                    this.ws.send(JSON.stringify(post));
                } catch (e) {
                    console.error('خطأ في بث المنشور:', e);
                    this.reconnectWebSocket();
                }
            } else {
                this.reconnectWebSocket();
            }
        }

        // استماع إلى أحداث
        on(event, callback) {
            this.eventTarget.addEventListener(event, callback);
        }

        // بث حدث تحديث
        emit(event, detail) {
            this.eventTarget.dispatchEvent(new CustomEvent(event, { detail }));
        }

        // اتصال WebSocket
        initWebSocket() {
            this.ws = new WebSocket('wss://sudan-market-2.onrender.com');
            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.emit('connectionStatus', { status: 'connected' });
            };
            this.ws.onclose = () => {
                this.isConnected = false;
                this.reconnectWebSocket();
            };
            this.ws.onerror = (error) => {
                console.error('خطأ في WebSocket:', error);
                this.reconnectWebSocket();
            };
        }

        // إعادة الاتصال التلقائي
        reconnectWebSocket() {
            if (this.reconnectAttempts < MAX_RETRIES) {
                this.reconnectAttempts++;
                setTimeout(() => {
                    this.initWebSocket();
                }, RECONNECT_INTERVAL * this.reconnectAttempts);
            } else {
                this.emit('connectionStatus', { status: 'failed', error: 'فشل إعادة الاتصال بعد عدة محاولات' });
            }
        }
    }

    // إنشاء Instance
    window.store = new Store();

})();