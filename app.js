(function() {
    'use strict';

    // متغيرات عامة
    const store = new Proxy({
        posts: [],
        status: 'جارِ التحميل...'
    }, {
        set(target, key, value) {
            target[key] = value;
            if (key === 'posts') renderPosts(value);
            if (key === 'status') updateStatus(value);
            return true;
        }
    });

    // دالة لجلب العنصر حسب المعرف
    function qs(id) {
        return document.getElementById(id);
    }

    // دالة لجلب النص الآمن
    function safeText(id) {
        const el = qs(id);
        return el ? el.value.trim() : '';
    }

    // دالة لتحديث حالة التطبيق
    function updateStatus(status) {
        const statusEl = qs('status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = `badge ${status === 'جارِ التحميل...' ? 'badge-loading' : ''}`;
        }
    }

    // دالة لعرض المنشورات
    function renderPosts(list) {
        const container = qs('postsList');
        if (!container) return;

        container.innerHTML = '';
        list.slice().reverse().forEach(post => {
            const div = document.createElement('div');
            div.className = `post-card ${post.anomaly ? 'anomaly' : ''}`;

            const header = document.createElement('div');
            header.className = 'post-header';
            header.innerHTML = `<strong>${post.author}</strong><span>${new Date(post.timestamp).toLocaleString('ar-EG')}</span>`;

            const content = document.createElement('div');
            content.textContent = post.content;

            div.appendChild(header);
            div.appendChild(content);
            container.appendChild(div);
        });
    }

    // دالة لجلب المنشورات
    async function loadPosts() {
        try {
            store.status = 'جارِ التحميل...';
            const posts = await window.api.fetchPosts();
            store.posts = posts;
            store.status = 'تم التحميل بنجاح';
        } catch (error) {
            console.error('خطأ في جلب المنشورات:', error);
            store.status = 'خطأ في التحميل';
        }
    }

    // دالة لإنشاء منشور جديد
    async function handlePost() {
        const author = safeText('author');
        const content = safeText('content');

        if (!author || !content) {
            alert('يرجى ملء جميع الحقول');
            return;
        }

        try {
            store.status = 'جارِ النشر...';
            await window.api.createPost(author, content);
            await loadPosts();
            qs('content').value = '';
        } catch (error) {
            console.error('خطأ في إنشاء المنشور:', error);
            store.status = 'خطأ في النشر';
        }
    }

    // دالة لتهيئة المخططات
    function initCharts() {
        const volumeCtx = qs('chartVolume');
        const priceCtx = qs('chartPrice');

        if (volumeCtx && priceCtx) {
            new Chart(volumeCtx, {
                type: 'bar',
                data: {
                    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
                    datasets: [{
                        label: 'حجم التداول',
                        data: [12, 19, 3, 5, 2, 3],
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });

            new Chart(priceCtx, {
                type: 'line',
                data: {
                    labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
                    datasets: [{
                        label: 'سعر السوق',
                        data: [65, 59, 80, 81, 56, 55],
                        fill: false,
                        borderColor: 'rgb(75, 192, 192)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true
                }
            });
        }
    }

    // دالة لتهيئة الرادار
    async function initRadar() {
        const radarEl = qs('radarContent');
        if (!radarEl) return;

        try {
            const data = await window.api.fetchRadarData();
            radarEl.innerHTML = `<h3>رادار السوق</h3><p>${data.message}</p>`;
        } catch (error) {
            console.error('خطأ في جلب بيانات الرادار:', error);
            radarEl.innerHTML = '<p>خطأ في تحميل بيانات الرادار</p>';
        }
    }

    // دالة لتهيئة التطبيق
    function initApp() {
        qs('postBtn')?.addEventListener('click', handlePost);
        loadPosts();
        initCharts();
        initRadar();
    }

    // بدء التطبيق عند تحميل الصفحة
    window.addEventListener('DOMContentLoaded', initApp);

    // تصدير الدوال العامة
    window.app = {
        loadPosts,
        handlePost
    };
})();