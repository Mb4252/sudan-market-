(function() {
    'use strict';

    class Feature40UI {
        constructor() {
            this.initUI();
            this.bindEvents();
        }

        initUI() {
            // إنشاء واجهة المستخدم الخاصة بالميزة 40
            this.container = document.createElement('div');
            this.container.id = 'feature-40-container';
            this.container.className = 'feature-container';

            this.errorDisplay = document.createElement('div');
            this.errorDisplay.id = 'feature-40-error';
            this.errorDisplay.className = 'error-message hidden';

            this.container.appendChild(this.errorDisplay);
            document.body.appendChild(this.container);
        }

        bindEvents() {
            // ربط الأحداث
            window.addEventListener('feature40Error', (e) => {
                this.showError(e.detail.message);
            });

            window.addEventListener('feature40Success', () => {
                this.hideError();
            });
        }

        showError(message) {
            if (this.errorDisplay) {
                this.errorDisplay.textContent = message;
                this.errorDisplay.classList.remove('hidden');
            }
        }

        hideError() {
            if (this.errorDisplay) {
                this.errorDisplay.classList.add('hidden');
            }
        }
    }

    // تهيئة الميزة عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        try {
            window.feature40UI = new Feature40UI();
        } catch (error) {
            console.error('خطأ في تهيئة واجهة الميزة 40:', error);
        }
    });
})();