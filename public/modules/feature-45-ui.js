(function() {
    'use strict';

    /**
     * دالة آمنة لتحديث نص عنصر DOM
     * @param {string} elementId - معرف العنصر
     * @param {string} text - النص المطلوب
     */
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`[Feature-45-UI] Element with ID "${elementId}" not found.`);
        }
    }

    /**
     * دالة آمنة لتحديث محتوى HTML لعنصر
     * @param {string} elementId - معرف العنصر
     * @param {string} html - المحتوى HTML
     */
    function safeSetInnerHTML(elementId, html) {
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;
        } else {
            console.warn(`[Feature-45-UI] Element with ID "${elementId}" not found.`);
        }
    }

    window.feature45UI = {
        safeSetTextContent,
        safeSetInnerHTML
    };
})();