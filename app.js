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
            header.innerHTML = `<span>${post.author || 'مجهول'}</span><span>${new Date(post.time).toLocaleString()}</span>`;

            const body = document.createElement('div');
            body.textContent = post.content;

            div.appendChild(header);
            div.appendChild(body);
            container.appendChild(div);
        });
    }

    // دالة لتحميل المنشورات
    async function loadPosts() {
        try {
            store.status = 'جارِ التحميل...';
            const posts = await fetchPosts();
            store.posts = posts;
            store.status = 'تم التحميل بنجاح';
        } catch (error) {
            console.error('خطأ في تحميل المنشورات:', error);
            store.status = 'خطأ في التحميل';
        }
    }

    // دالة لنشر منشور جديد
    async function publishPost() {
        const author = safeText('author');
        const content = safeText('content');

        if (!author || !content) {
            alert('يرجى ملء جميع الحقول');
            return;
        }

        try {
            store.status = 'جارِ النشر...';
            const newPost = await createPost(author, content);
            store.posts = [...store.posts, newPost];
            store.status = 'تم النشر بنجاح';

            // مسح الحقول بعد النشر
            qs('author').value = '';
            qs('content').value = '';
        } catch (error) {
            console.error('خطأ في النشر:', error);
            store.status = 'خطأ في النشر';
        }
    }

    // دالة لفتح نافذة المقارنة
    function openCompare() {
        const overlay = qs('compareOverlay');
        if (overlay) overlay.classList.remove('hidden');
    }

    // دالة لإغلاق نافذة المقارنة
    function closeCompare() {
        const overlay = qs('compareOverlay');
        if (overlay) overlay.classList.add('hidden');
    }

    // دالة لتهيئة التطبيق
    function init() {
        // تهيئة الأحداث
        const publishBtn = qs('publishBtn');
        if (publishBtn) publishBtn.addEventListener('click', publishPost);

        const compareBtn = qs('compareBtn');
        if (compareBtn) compareBtn.addEventListener('click', openCompare);

        const overlay = qs('compareOverlay');
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeCompare();
        });

        // تحميل المنشورات عند بدء التطبيق
        loadPosts();
    }

    // بدء التطبيق
    document.addEventListener('DOMContentLoaded', init);

    // تصدير الدوال العامة
    window.app = {
        store,
        loadPosts,
        publishPost,
        openCompare,
        closeCompare
    };
})();