/**
 * sdm-module-209.js
 * وظيفته: تخزين وتحديث بيانات المستخدم في localStorage مع التحقق من عناصر DOM.
 */

(function() {
    'use strict';

    const USER_DATA_KEY = 'sdmUserData';
    const DEFAULT_USER_DATA = {
        name: '',
        lastActive: new Date().toISOString()
    };

    // تحميل بيانات المستخدم من localStorage
    function loadUserData() {
        try {
            const data = localStorage.getItem(USER_DATA_KEY);
            return data ? JSON.parse(data) : DEFAULT_USER_DATA;
        } catch (e) {
            console.error('Error loading user data:', e);
            return DEFAULT_USER_DATA;
        }
    }

    // حفظ بيانات المستخدم في localStorage
    function saveUserData(userData) {
        try {
            if (!userData || typeof userData !== 'object') {
                throw new Error('Invalid user data');
            }
            localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
            return true;
        } catch (e) {
            console.error('Error saving user data:', e);
            return false;
        }
    }

    // تحديث بيانات المستخدم (تحديث الاسم فقط)
    function updateUserName(newName) {
        try {
            if (typeof newName !== 'string') {
                throw new Error('Name must be a string');
            }

            const userData = loadUserData();
            userData.name = newName;
            userData.lastActive = new Date().toISOString();

            return saveUserData(userData);
        } catch (e) {
            console.error('Error updating user name:', e);
            return false;
        }
    }

    // تحديث واجهة المستخدم مع بيانات المستخدم
    function updateUI() {
        try {
            const userData = loadUserData();
            const userNameElement = document.getElementById('sdm-user-name');

            if (userNameElement) {
                userNameElement.textContent = userData.name || 'Guest';
            }

            const lastActiveElement = document.getElementById('sdm-last-active');
            if (lastActiveElement) {
                const lastActiveDate = new Date(userData.lastActive);
                if (window.isValidDate(lastActiveDate)) {
                    lastActiveElement.textContent = `Last active: ${window.safeFormatDate(lastActiveDate)}`;
                }
            }
        } catch (e) {
            console.error('Error updating UI:', e);
        }
    }

    // تهيئة التوسعة
    function init() {
        try {
            // تحديث واجهة المستخدم عند التحميل
            updateUI();

            // إضافة مستمع لحدث تغيير الاسم
            const nameInput = document.getElementById('sdm-name-input');
            if (nameInput) {
                nameInput.addEventListener('change', function() {
                    updateUserName(this.value);
                    updateUI();
                });
            }
        } catch (e) {
            console.error('Error initializing addon:', e);
        }
    }

    // تنفيذ التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // تصدير الوظائف العامة
    window.sdmModule209 = {
        loadUserData,
        saveUserData,
        updateUserName,
        updateUI
    };
})();