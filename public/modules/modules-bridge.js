(function() {
    'use strict';

    // جسر الوحدات التوسعية
    const ModulesBridge = {
        // تخزين الوحدات المسجلة
        registeredModules: new Map(),

        // تسجيل وحدة جديدة
        registerModule: function(moduleName, module) {
            if (this.registeredModules.has(moduleName)) {
                console.warn(`Module ${moduleName} is already registered`);
                return false;
            }

            this.registeredModules.set(moduleName, module);
            this._syncWithLocalStorage(moduleName, module);
            this._connectToWebSocket(moduleName, module);
            return true;
        },

        // مزامنة الوحدة مع localStorage
        _syncWithLocalStorage: function(moduleName, module) {
            const storageKey = `module_${moduleName}_state`;
            const savedState = localStorage.getItem(storageKey);

            if (savedState) {
                try {
                    const parsedState = JSON.parse(savedState);
                    if (module.onLocalStorageLoad) {
                        module.onLocalStorageLoad(parsedState);
                    }
                } catch (e) {
                    console.error(`Error loading state for ${moduleName}:`, e);
                }
            }

            // حفظ الحالة عند التحديث
            if (module.onStateUpdate) {
                const originalUpdate = module.onStateUpdate.bind(module);
                module.onStateUpdate = function(newState) {
                    originalUpdate(newState);
                    localStorage.setItem(storageKey, JSON.stringify(newState));
                };
            }
        },

        // ربط الوحدة مع خدمة البث
        _connectToWebSocket: function(moduleName, module) {
            if (!module.onWebSocketMessage) return;

            const wsUrl = 'wss://sudan-market-2.onrender.com';
            const ws = new WebSocket(wsUrl);

            ws.onopen = function() {
                console.log(`WebSocket connection established for ${moduleName}`);
            };

            ws.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    module.onWebSocketMessage(data);
                } catch (e) {
                    console.error(`Error processing WebSocket message for ${moduleName}:`, e);
                }
            };

            ws.onerror = function(error) {
                console.error(`WebSocket error for ${moduleName}:`, error);
            };

            ws.onclose = function() {
                console.log(`WebSocket connection closed for ${moduleName}`);
            };
        }
    };

    // تفعيل الجسر عند تحميل الصفحة
    window.addEventListener('DOMContentLoaded', function() {
        window.ModulesBridge = ModulesBridge;
    });
})();