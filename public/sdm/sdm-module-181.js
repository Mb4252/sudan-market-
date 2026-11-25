(function() {
    'use strict';

    // تخزين بيانات التفضيلات الخاصة بالمستخدم في localStorage
    function saveUserPreference(key, value) {
        try {
            if (!key || typeof key !== 'string') throw new Error('Invalid key');
            if (value === undefined || value === null) throw new Error('Invalid value');
            localStorage.setItem(`sdm-module-181-${key}`, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Error saving preference:', error);
            return false;
        }
    }

    // جلب بيانات التفضيلات من localStorage
    function getUserPreference(key) {
        try {
            if (!key || typeof key !== 'string') throw new Error('Invalid key');
            const data = localStorage.getItem(`sdm-module-181-${key}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('Error getting preference:', error);
            return null;
        }
    }

    // تحديث واجهة المستخدم مع البيانات المخزنة
    function updateUI() {
        try {
            const element = document.getElementById('sdm-module-181-status');
            if (!element) return;

            const theme = getUserPreference('theme');
            const lastUpdated = getUserPreference('lastUpdated');

            element.textContent = `Theme: ${theme || 'Default'} | Last Updated: ${lastUpdated || 'Never'}`;
            element.style.color = theme === 'dark' ? '#ffffff' : '#000000';
        } catch (error) {
            console.error('Error updating UI:', error);
        }
    }

    // تنفيذ عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        try {
            // تخزين بيانات تجريبية
            saveUserPreference('theme', 'dark');
            saveUserPreference('lastUpdated', new Date().toISOString());

            // تحديث واجهة المستخدم
            updateUI();
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    });

})();