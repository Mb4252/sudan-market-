(function() {
    'use strict';

    class Feature70UI {
        constructor() {
            this.initUI();
            this.bindEvents();
        }

        initUI() {
            // إنشاء واجهة المستخدم الخاصة بميزة #70
            const feature70Container = document.createElement('div');
            feature70Container.id = 'feature-70-container';
            feature70Container.innerHTML = `
                <div class="feature-70-header">
                    <h2>تحليل اتجاهات المدينة</h2>
                </div>
                <div class="feature-70-content">
                    <select id="city-selector" class="city-selector">
                        <option value="">اختر مدينة</option>
                    </select>
                    <button id="analyze-btn" class="analyze-btn">تحليل</button>
                    <div id="trend-result" class="trend-result"></div>
                </div>
            `;
            document.body.appendChild(feature70Container);
        }

        bindEvents() {
            const analyzeBtn = document.getElementById('analyze-btn');
            const citySelector = document.getElementById('city-selector');

            analyzeBtn.addEventListener('click', () => {
                const selectedCity = citySelector.value;
                if (selectedCity) {
                    window.store.dispatch('analyzeCityTrend', { city: selectedCity });
                }
            });

            // تحديث قائمة المدن عند تحديث المخزن
            window.store.on('storeUpdated', (e) => {
                this.updateCitySelector(e.detail.posts);
            });
        }

        updateCitySelector(posts) {
            const citySelector = document.getElementById('city-selector');
            const cities = [...new Set(posts.map(post => post.city))];

            // مسح الخيارات الحالية
            citySelector.innerHTML = '<option value="">اختر مدينة</option>';

            // إضافة خيارات المدن الجديدة
            cities.forEach(city => {
                const option = document.createElement('option');
                option.value = city;
                option.textContent = city;
                citySelector.appendChild(option);
            });
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        new Feature70UI();
    });
})();