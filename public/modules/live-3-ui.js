// public/modules/live-3-ui.js
(function() {
    'use strict';

    // دالة مساعدة للتحقق من وجود العنصر
    function elementExists(selector) {
        return document.querySelector(selector) !== null;
    }

    // دالة تحديث حالة البث
    function updateBroadcastStatus(status) {
        if (elementExists('#broadcastStatus')) {
            document.getElementById('broadcastStatus').textContent = status;
        }
    }

    // دالة عرض إشعار
    function showNotification(message) {
        if (elementExists('#notification')) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.style.display = 'block';
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
    }

    // دالة عرض خطأ
    function showError(message) {
        if (elementExists('#errorDisplay')) {
            const errorDisplay = document.getElementById('errorDisplay');
            errorDisplay.textContent = message;
            errorDisplay.style.display = 'block';
        }
    }

    // دالة إخفاء خطأ
    function hideError() {
        if (elementExists('#errorDisplay')) {
            document.getElementById('errorDisplay').style.display = 'none';
        }
    }

    // دالة تحديث قائمة المنشورات
    function updatePostList(posts) {
        if (elementExists('#postList')) {
            const postList = document.getElementById('postList');
            postList.innerHTML = '';
            posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.className = 'post';
                postElement.innerHTML = `
                    <h3>${post.author}</h3>
                    <p>${post.content}</p>
                    <p>السعر: ${post.price}</p>
                    <p>المدينة: ${post.city}</p>
                    <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
                `;
                postList.appendChild(postElement);
            });
        }
    }

    // دالة تحديث قائمة المقارنة
    function updateCompareList(compareData) {
        if (elementExists('#compareList')) {
            const compareList = document.getElementById('compareList');
            compareList.innerHTML = '';
            compareData.forEach(item => {
                const compareElement = document.createElement('div');
                compareElement.className = 'compare-item';
                compareElement.innerHTML = `
                    <h3>${item.product}</h3>
                    <p>السعر المتوسط: ${item.averagePrice}</p>
                    <p>أرخص بائع: ${item.cheapestSeller}</p>
                `;
                compareList.appendChild(compareElement);
            });
        }
    }

    // دالة تحديث بيانات الرادار
    function updateRadarData(radarData) {
        if (elementExists('#radarData')) {
            const radarDataElement = document.getElementById('radarData');
            radarDataElement.innerHTML = `
                <h3>بيانات الرادار</h3>
                <p>عدد المنشورات: ${radarData.postCount}</p>
                <p>عدد المدن: ${radarData.cityCount}</p>
                <p>السعر المتوسط: ${radarData.averagePrice}</p>
            `;
        }
    }

    // دالة تحديث إحصائيات السوق
    function updateMarketStats(stats) {
        if (elementExists('#marketStats')) {
            const marketStatsElement = document.getElementById('marketStats');
            marketStatsElement.innerHTML = `
                <h3>إحصائيات السوق</h3>
                <p>عدد المنشورات: ${stats.postCount}</p>
                <p>عدد المدن: ${stats.cityCount}</p>
                <p>السعر المتوسط: ${stats.averagePrice}</p>
                <p>أعلى سعر: ${stats.maxPrice}</p>
                <p>أقل سعر: ${stats.minPrice}</p>
            `;
        }
    }

    // دالة تحديث التنبؤات
    function updateForecast(forecast) {
        if (elementExists('#forecast')) {
            const forecastElement = document.getElementById('forecast');
            forecastElement.innerHTML = `
                <h3>التنبؤات</h3>
                <p>السعر المتوقع: ${forecast.predictedPrice}</p>
                <p>مستوى الثقة: ${forecast.confidenceLevel}%</p>
            `;
        }
    }

    // تصدير الواجهات
    window.ui = {
        updateBroadcastStatus,
        showNotification,
        showError,
        hideError,
        updatePostList,
        updateCompareList,
        updateRadarData,
        updateMarketStats,
        updateForecast
    };
})();