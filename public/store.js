// إضافة دالة للتحقق من صحة التاريخ
function isValidDate(date) {
    return date instanceof Date && !isNaN(date);
}

// دالة تنسيق التاريخ مع التحقق
function formatDate(date) {
    if (!isValidDate(date)) {
        date = new Date(); // استخدام التاريخ الحالي إذا كان التاريخ غير صالح
    }
    return date.toLocaleString('ar-SD', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// دالة لحفظ البيانات في localStorage
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('خطأ في حفظ البيانات في localStorage:', e);
    }
}

// دالة لاسترجاع البيانات من localStorage
function getFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('خطأ في استرجاع البيانات من localStorage:', e);
        return null;
    }
}

// دالة تحديث البيانات مع حفظها
function updateStore(newData) {
    Object.assign(store, newData);
    saveToLocalStorage('store', store);
    dispatchEvent(new CustomEvent('storeUpdated', { detail: store }));
}

// دالة تهيئة المتجر
function initializeStore() {
    const savedStore = getFromLocalStorage('store');
    if (savedStore) {
        Object.assign(store, savedStore);
    }
}

// المتجر الرئيسي
const store = {
    posts: [],
    radarData: [],
    compareData: [],
    status: 'جاهز',
    isValidDate,
    formatDate,
    updateStore
};

// تهيئة المتجر عند تحميل الصفحة
initializeStore();

// تصدير المتجر إلى النافذة
window.store = store;