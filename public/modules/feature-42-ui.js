document.addEventListener('DOMContentLoaded', function() {
    const feature42Container = document.createElement('div');
    feature42Container.id = 'feature-42-container';
    feature42Container.innerHTML = `
        <button id="statusBtn">حالة الميزة</button>
        <button id="publishBtn">نشر</button>
        <button id="compareBtn">مقارنة</button>
        <div id="status"></div>
    `;
    document.body.appendChild(feature42Container);
});