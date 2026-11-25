(function() {
    'use strict';

    async function comparePrices() {
        try {
            const compareData = await window.api.fetchCompareData();
            const compareResults = document.getElementById('compareResults');
            compareResults.innerHTML = '';

            // إنشاء جدول المقارنة
            const table = document.createElement('table');
            table.className = 'compare-table';

            // إضافة رأس الجدول
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['البائع', 'المنتج', 'السعر', 'المدينة'].forEach(headerText => {
                const th = document.createElement('th');
                th.textContent = headerText;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // إضافة بيانات الجدول
            const tbody = document.createElement('tbody');
            compareData.forEach(item => {
                const row = document.createElement('tr');
                [item.author, item.content, item.price, item.city].forEach(cellText => {
                    const td = document.createElement('td');
                    td.textContent = cellText;
                    row.appendChild(td);
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);

            compareResults.appendChild(table);
        } catch (error) {
            console.error('خطأ في المقارنة:', error);
        }
    }

    window.comparePrices = comparePrices;
})();