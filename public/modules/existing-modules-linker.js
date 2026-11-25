// public/modules/existing-modules-linker.js
(function() {
    'use strict';

    // قائمة الملفات المقفلة التي سنربطها
    const lockedFiles = [
        'public/plugins/plugin-hub.js',
        'services/py/price_analyzer.py',
        'tools/ts/schema_guard.ts',
        // ... قائمة كاملة الملفات المقفلة
    ];

    // قائمة الملفات الموجودة التي سنربطها
    const existingFiles = [
        'ai-memory.json',
        'api.js',
        'app.js',
        'index.html',
        'package.json',
        // ... قائمة كاملة الملفات الموجودة
    ];

    // نقطة تنسيق مشتركة
    const moduleBridge = {
        lockedFiles: new Set(lockedFiles),
        existingFiles: new Set(existingFiles),
        localStorageKey: 'linked-modules',
        wsConnection: null,

        init: function() {
            this.setupWebSocket();
            this.loadFromLocalStorage();
            this.linkModules();
        },

        setupWebSocket: function() {
            this.wsConnection = new WebSocket('wss://sudan-market-2.onrender.com');

            this.wsConnection.onopen = () => {
                console.log('WebSocket connected');
                this.reportStatus();
            };

            this.wsConnection.onmessage = (event) => {
                console.log('Message from server:', event.data);
            };

            this.wsConnection.onclose = () => {
                console.log('WebSocket disconnected');
                // إعادة الاتصال بعد 5 ثوان
                setTimeout(() => this.setupWebSocket(), 5000);
            };
        },

        loadFromLocalStorage: function() {
            const savedData = localStorage.getItem(this.localStorageKey);
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                this.linkedModules = new Set(parsedData.linkedModules || []);
            } else {
                this.linkedModules = new Set();
            }
        },

        saveToLocalStorage: function() {
            localStorage.setItem(this.localStorageKey, JSON.stringify({
                linkedModules: Array.from(this.linkedModules)
            }));
        },

        linkModules: function() {
            // ربط الملفات الموجودة
            this.existingFiles.forEach(file => {
                if (!this.linkedModules.has(file)) {
                    this.linkedModules.add(file);
                    console.log(`Linked existing file: ${file}`);
                }
            });

            // ربط الملفات المقفلة
            this.lockedFiles.forEach(file => {
                if (!this.linkedModules.has(file)) {
                    this.linkedModules.add(file);
                    console.log(`Linked locked file: ${file}`);
                }
            });

            this.saveToLocalStorage();
            this.reportStatus();
        },

        reportStatus: function() {
            if (this.wsConnection && this.wsConnection.readyState === WebSocket.OPEN) {
                const status = {
                    type: 'module-status',
                    timestamp: new Date().toISOString(),
                    linkedModules: Array.from(this.linkedModules),
                    totalModules: this.existingFiles.size + this.lockedFiles.size
                };
                this.wsConnection.send(JSON.stringify(status));
            }
        }
    };

    // تهيئة الجسر عند تحميل الصفحة
    moduleBridge.init();

    // إتاح الجسر للوحدات الأخرى
    window.moduleBridge = moduleBridge;
})();