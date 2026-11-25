(function() {
    'use strict';

    // نظام معالجة الأخطاء العام
    window.onerror = function(message, source, lineno, colno, error) {
        console.error('خطأ عام:', { message, source, lineno, colno, error });
        logError('window.onerror', message, error);
        return false;
    };

    window.addEventListener('unhandledrejection', function(event) {
        console.error('رفض غير معالج:', event.reason);
        logError('unhandledrejection', event.reason);
        event.preventDefault();
    });

    function logError(type, message, error) {
        try {
            const errors = JSON.parse(localStorage.getItem('sudan_market_errors') || '[]');
            errors.push({
                type,
                message: String(message),
                stack: error ? error.stack : null,
                timestamp: new Date().toISOString()
            });
            // احتفظ بآخر 50 خطأ فقط
            if (errors.length > 50) errors.shift();
            localStorage.setItem('sudan_market_errors', JSON.stringify(errors));
        } catch (e) {
            console.error('فشل في تسجيل الخطأ:', e);
        }
    }

    // Reactive Store باستخدام Proxy وEventTarget
    const storeTarget = {
        posts: [],
        status: 'متصل',
        totalPosts: 0,
        avgPrice: 0,
        activeCities: 0
    };

    const storeEvents = new EventTarget();

    const store = new Proxy(storeTarget, {
        set(target, key, value) {
            target[key] = value;
            storeEvents.dispatchEvent(new CustomEvent('change', { detail: { key, value } }));
            return true;
        }
    });

    // دالة لجلب العنصر بأمان
    function qs(id) {
        return document.getElementById(id);
    }

    // تحديث الحالة
    function updateStatus(status) {
        const statusText = qs('statusText');
        if (statusText) {
            statusText.textContent = status;
        }
    }

    // عرض المنشورات
    function renderPosts(posts) {
        const container = qs('postsContainer');
        if (!container) return;

        container.innerHTML = '';

        if (posts.length === 0) {
            container.innerHTML = '<p class="empty-state">لا توجد منشورات بعد. كن أول من ينشر!</p>';
            return;
        }

        posts.slice().reverse().forEach(post => {
            const card = document.createElement('div');
            card.className = `post-card ${post.anomaly ? 'anomaly' : ''}`;

            const header = document.createElement('div');
            header.className = 'post-header';

            const title = document.createElement('h3');
            title.className = 'post-title';
            title.textContent = post.title || 'منتج بدون عنوان';

            const price = document.createElement('span');
            price.className = 'post-price';
            price.textContent = post.price ? `S${post.price}` : 'N/A';

            header.appendChild(title);
            header.appendChild(price);

            const meta = document.createElement('div');
            meta.className = 'post-meta';
            meta.textContent = `${post.city || 'غير محدد'} • ${new Date(post.timestamp).toLocaleDateString('ar-SD')}`;

            card.appendChild(header);
            card.appendChild(meta);
            container.appendChild(card);
        });
    }

    // تحديث التحليلات
    function updateAnalytics() {
        const totalPosts = qs('totalPosts');
        const avgPrice = qs('avgPrice');
        const activeCities = qs('activeCities');

        if (totalPosts) totalPosts.textContent = store.totalPosts;
        if (avgPrice) avgPrice.textContent = store.avgPrice ? `S${store.avgPrice.toFixed(2)}` : '0';
        if (activeCities) activeCities.textContent = store.activeCities;
    }

    // استماع لتغيرات الـ Store
    storeEvents.addEventListener('change', (e) => {
        const { key, value } = e.detail;
        if (key === 'posts') {
            renderPosts(value);
            calculateAnalytics(value);
        }
        if (key === 'status') {
            updateStatus(value);
        }
        if (key === 'totalPosts' || key === 'avgPrice' || key === 'activeCities') {
            updateAnalytics();
        }
    });

    function calculateAnalytics(posts) {
        store.totalPosts = posts.length;
        const prices = posts.map(p => p.price).filter(p => p > 0);
        store.avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        const cities = new Set(posts.map(p => p.city).filter(c => c));
        store.activeCities = cities.size;
    }

    // جلب البيانات من API
    async function fetchPosts() {
        try {
            const response = await fetch('https://sudan-market-2.onrender.com/posts');
            if (!response.ok) throw new Error('خطأ في جلب المنشورات');
            const data = await response.json();
            store.posts = data;
        } catch (error) {
            console.error('فشل في جلب المنشورات:', error);
            store.posts = [];
        }
    }

    // نشر منتج جديد
    async function publishPost() {
        const title = prompt('عنوان المنتج:');
        if (!title) return;

        const price = prompt('السعر (بالسوداني):');
        const city = prompt('المدينة:');

        const post = {
            id: Date.now().toString(),
            title,
            price: parseFloat(price) || 0,
            city: city || 'غير محدد',
            timestamp: new Date().toISOString(),
            anomaly: false
        };

        // حفظ فوري في localStorage
        try {
            const localPosts = JSON.parse(localStorage.getItem('sudan_market_posts') || '[]');
            localPosts.push(post);
            localStorage.setItem('sudan_market_posts', JSON.stringify(localPosts));
        } catch (e) {
            console.error('فشل في الحفظ المحلي:', e);
        }

        // تحديث الـ Store فورياً
        store.posts = [...store.posts, post];

        // إرسال عبر WebSocket (إذا كان متاحاً)
        sendToWebSocket(post);

        // محاولة حفظ على الخادم
        try {
            await fetch('https://sudan-market-2.onrender.com/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(post)
            });
        } catch (e) {
            console.warn('فشل في الحفظ على الخادم، تم الحفظ محلياً فقط:', e);
        }
    }

    // WebSocket للبث المباشر
    let ws = null;
    const WS_URL = 'wss://sudan-market-2.onrender.com';

    function initWebSocket() {
        try {
            ws = new WebSocket(WS_URL);

            ws.onopen = () => {
                store.status = 'متصل';
                console.log('WebSocket متصل');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'new_post') {
                        // منع التكرار
                        const exists = store.posts.some(p => p.id === data.post.id);
                        if (!exists) {
                            store.posts = [...store.posts, data.post];
                        }
                    }
                } catch (e) {
                    console.error('خطأ في معالجة رسالة WebSocket:', e);
                }
            };

            ws.onclose = () => {
                store.status = 'غير متصل';
                console.log('WebSocket أغلق، إعادة المحاولة بعد 5 ثوانٍ');
                setTimeout(initWebSocket, 5000);
            };

            ws.onerror = (error) => {
                console.error('خطأ في WebSocket:', error);
                store.status = 'خطأ في الاتصال';
            };
        } catch (e) {
            console.error('فشل في إنشاء WebSocket:', e);
            store.status = 'غير متصل';
        }
    }

    function sendToWebSocket(post) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'new_post', post }));
        }
    }

    // تهيئة التطبيق
    function init() {
        // ربط أزرار
        const publishBtn = qs('publishBtn');
        if (publishBtn) {
            publishBtn.addEventListener('click', publishPost);
        }

        // تحميل البيانات الأولية
        fetchPosts();

        // تهيئة WebSocket
        initWebSocket();

        console.log('Sudan Market تم تهيئته بنجاح');
    }

    // بدء التطبيق عند اكتمال تحميل DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();