(function() {
    'use strict';

    // واجهة تحكم الوحدات التوسعية
    const ModulesUIPanel = {
        // إنشاء واجهة التحكم
        createPanel: function() {
            const panel = document.createElement('div');
            panel.id = 'modules-ui-panel';
            panel.style.position = 'fixed';
            panel.style.bottom = '20px';
            panel.style.right = '20px';
            panel.style.zIndex = '1000';
            panel.style.backgroundColor = '#fff';
            panel.style.padding = '10px';
            panel.style.borderRadius = '5px';
            panel.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';

            const title = document.createElement('h3');
            title.textContent = 'الوحدات التوسعية';
            panel.appendChild(title);

            const modulesList = document.createElement('ul');
            modulesList.id = 'modules-list';
            panel.appendChild(modulesList);

            document.body.appendChild(panel);
            return panel;
        },

        // تحديث قائمة الوحدات
        updateModulesList: function(modules) {
            const modulesList = document.getElementById('modules-list');
            if (!modulesList) return;

            modulesList.innerHTML = '';

            modules.forEach(module => {
                const item = document.createElement('li');
                item.textContent = module.name;
                modulesList.appendChild(item);
            });
        }
    };

    // تفعيل واجهة التحكم عند تحميل الصفحة
    window.addEventListener('DOMContentLoaded', function() {
        const panel = ModulesUIPanel.createPanel();
        window.ModulesUIPanel = ModulesUIPanel;
    });
})();