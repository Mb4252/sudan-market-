// public/modules/live-5-ui.js
(function() {
    'use strict';

    // دالة لتحقق من وجود العنصر قبل الإسناد
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`[Live-5-UI] Element with ID "${elementId}" not found`);
        }
    }

    // دالة لتحديث حالة البث الحي
    function updateLiveStatus(statusText, isOnline) {
        safeSetTextContent('live5-status-text', statusText);
        const statusDot = document.getElementById('live5-status-dot');
        if (statusDot) {
            statusDot.className = `status-dot ${isOnline ? 'online' : 'offline'}`;
        }
    }

    // دالة لتحديث آخر تحديث
    function updateLastSync(timestamp) {
        if (!window.isValidDate || !window.isValidDate(timestamp)) {
            safeSetTextContent('live5-last-sync', 'غير متاح');
            return;
        }
        const date = new Date(timestamp);
        safeSetTextContent('live5-last-sync', date.toLocaleString('ar-EG'));
    }

    // دالة لتحديث إحصائيات البث الحي
    function updateLiveStats(postsCount, uniqueCities) {
        safeSetTextContent('live5-posts-count', postsCount.toString());
        safeSetTextContent('live5-cities-count', uniqueCities.toString());
    }

    // دالة لتحديث قائمة المدن
    function updateCitiesList(cities) {
        const citiesList = document.getElementById('live5-cities-list');
        if (citiesList) {
            citiesList.innerHTML = '';
            cities.forEach(city => {
                const li = document.createElement('li');
                li.textContent = city;
                citiesList.appendChild(li);
            });
        }
    }

    // دالة لتحديث قائمة المنشورات
    function updatePostsList(posts) {
        const postsList = document.getElementById('live5-posts-list');
        if (postsList) {
            postsList.innerHTML = '';
            posts.forEach(post => {
                const li = document.createElement('li');
                li.textContent = `${post.author}: ${post.content} - ${post.price} جنية سوداني`;
                postsList.appendChild(li);
            });
        }
    }

    // دالة لتحديث كل الواجهة
    function updateUI(data) {
        updateLiveStatus(data.status, data.isOnline);
        updateLastSync(data.lastSync);
        updateLiveStats(data.postsCount, data.uniqueCities);
        updateCitiesList(data.cities);
        updatePostsList(data.posts);
    }

    // تصدير الدوال العامة
    window.live5UI = {
        updateUI,
        safeSetTextContent,
        updateLiveStatus,
        updateLastSync,
        updateLiveStats,
        updateCitiesList,
        updatePostsList
    };
})();