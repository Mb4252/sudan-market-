// public/modules/linked-workspace-view.js
(function() {
    'use strict';

    const LinkedWorkspaceView = {
        init: function() {
            this.createUI();
            this.setupEventListeners();
            this.updateView();
        },

        createUI: function() {
            const container = document.createElement('div');
            container.id = 'linked-workspace-view';
            container.innerHTML = `
                <h2>وحدات العمل المرتبطة</h2>
                <div id="linked-modules-list"></div>
                <div id="workspace-status"></div>
            `;
            document.body.appendChild(container);
        },

        setupEventListeners: function() {
            window.moduleBridge.wsConnection.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'module-status') {
                    this.updateView(data);
                }
            };
        },

        updateView: function(statusData) {
            const listElement = document.getElementById('linked-modules-list');
            const statusElement = document.getElementById('workspace-status');

            if (statusData) {
                listElement.innerHTML = statusData.linkedModules.map(module => `
                    <div class="linked-module">${module}</div>
                `).join('');

                statusElement.innerHTML = `
                    <p>وحدات مرتبطة: ${statusData.linkedModules.length}/${statusData.totalModules}</p>
                    <p>آخر تحديث: ${new Date(statusData.timestamp).toLocaleString()}</p>
                `;
            } else {
                listElement.innerHTML = '<p>جارٍ تحميل البيانات...</p>';
                statusElement.innerHTML = '';
            }
        }
    };

    // تهيئة العرض عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', () => {
        LinkedWorkspaceView.init();
    });

    // إتاح العرض للوحدات الأخرى
    window.LinkedWorkspaceView = LinkedWorkspaceView;
})();