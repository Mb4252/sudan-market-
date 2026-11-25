// dom-date-guard.js

// دالة آمنة لتعيين محتوى النص للعنصر DOM
function safeSetTextContent(element, text) {
  if (element && typeof element.textContent !== 'undefined') {
    element.textContent = text;
    return true;
  }
  return false;
}

// دالة للتحقق من صحة كائن التاريخ
function isValidDate(date) {
  return date instanceof Date && !isNaN(date);
}

// دالة آمنة لتنسيق التاريخ
function safeFormatDate(date, locale = 'en-US', options = {}) {
  if (!isValidDate(date)) {
    return '';
  }
  return date.toLocaleDateString(locale, options);
}

// ربط الدوال مع النافذة العالمية
window.safeSetTextContent = safeSetTextContent;
window.isValidDate = isValidDate;
window.safeFormatDate = safeFormatDate;
