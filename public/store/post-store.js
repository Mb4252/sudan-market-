(function() {
    'use strict';

    // تخزين المنشورات في localStorage
    const STORAGE_KEY = 'sudanMarketPosts';
    let posts = [];
    let listeners = [];

    // دالة للتحقق من صحة التاريخ
    function isValidDate(date) {
        return date instanceof Date && !isNaN(date.getTime());
    }

    // تنسيق التاريخ إلى ISO String صالح
    function formatDate(date) {
        return isValidDate(date) ? date.toISOString() : new Date().toISOString();
    }

    // تحميل المنشورات من localStorage
    function loadPosts() {
        const savedPosts = localStorage.getItem(STORAGE_KEY);
        if (savedPosts) {
            try {
                const parsedPosts = JSON.parse(savedPosts);
                if (Array.isArray(parsedPosts)) {
                    posts = parsedPosts.map(post => {
                        const date = new Date(post.timestamp);
                        return isValidDate(date) ? { ...post, timestamp: date } : { ...post, timestamp: new Date() };
                    });
                    notifyListeners({ posts, status: 'تم تحميل المنشورات من التخزين المحلي' });
                }
            } catch (e) {
                console.error('خطأ في تحميل المنشورات:', e);
                posts = [];
            }
        }
        return posts;
    }

    // حفظ المنشورات في localStorage
    function savePosts() {
        try {
            const validPosts = posts.filter(post => isValidDate(new Date(post.timestamp)));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(validPosts));
            notifyListeners({ posts: validPosts, status: 'تم حفظ المنشورات في التخزين المحلي' });
        } catch (e) {
            console.error('خطأ في حفظ المنشورات:', e);
        }
    }

    // إضافة منشور جديد
    function addPost(post) {
        if (!isValidDate(new Date(post.timestamp))) {
            post.timestamp = new Date();
        }
        posts = [...posts, post];
        savePosts();
        notifyListeners({ posts, status: 'تم إضافة المنشور' });
    }

    // حذف منشور
    function removePost(postId) {
        posts = posts.filter(post => post.id !== postId);
        savePosts();
        notifyListeners({ posts, status: 'تم حذف المنشور' });
    }

    // الحصول على جميع المنشورات
    function getPosts() {
        return [...posts];
    }

    // إشعار المستمعين بالتحسينات
    function notifyListeners(data) {
        listeners.forEach(listener => listener(data));
    }

    // إضافة مستمع
    function on(event, callback) {
        if (event === 'storeUpdated') {
            listeners.push(callback);
        }
    }

    // تحميل المنشورات عند تحميل الصفحة
    loadPosts();

    // تعرّف على window.store
    window.store = {
        isValidDate,
        formatDate,
        loadPosts,
        savePosts,
        addPost,
        removePost,
        getPosts,
        on
    };

    // استيراد الدوال من window.store
    if (typeof window.store === 'undefined') {
        console.error('فشل في تعريف window.store');
    }

})();