(function() {
    'use strict';
    
    try {
        // دالة لتخزين وتحميل إعدادات الدردشة من localStorage
        function manageChatSettings() {
            const settings = {
                autoConnect: localStorage.getItem('sdmAutoConnect') === 'true',
                theme: localStorage.getItem('sdmTheme') || 'light'
            };
            
            // حفظ الإعدادات
            function saveSettings() {
                localStorage.setItem('sdmAutoConnect', settings.autoConnect);
                localStorage.setItem('sdmTheme', settings.theme);
                console.log('Chat settings saved:', settings);
            }
            
            // تحميل الإعدادات
            function loadSettings() {
                const autoConnectInput = document.getElementById('sdm-auto-connect');
                const themeSelect = document.getElementById('sdm-theme-select');
                
                if (autoConnectInput && themeSelect) {
                    autoConnectInput.checked = settings.autoConnect;
                    themeSelect.value = settings.theme;
                    applyTheme(settings.theme);
                    console.log('Chat settings loaded:', settings);
                }
            }
            
            // تطبيق نمط الظل
            function applyTheme(theme) {
                const body = document.body;
                body.className = theme;
            }
            
            // ربط الأحداث
            document.getElementById('sdm-auto-connect')?.addEventListener('change', (e) => {
                settings.autoConnect = e.target.checked;
                saveSettings();
            });
            
            document.getElementById('sdm-theme-select')?.addEventListener('change', (e) => {
                settings.theme = e.target.value;
                applyTheme(settings.theme);
                saveSettings();
            });
            
            // التحقق من وجود العناصر قبل التحميل
            if (document.getElementById('sdm-settings-container')) {
                loadSettings();
            }
        }
        
        // تنفيذي عند تحميل الصفحة
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', manageChatSettings);
        } else {
            manageChatSettings();
        }
        
    } catch (error) {
        console.error('Error in sdm-module-68:', error);
    }
})();