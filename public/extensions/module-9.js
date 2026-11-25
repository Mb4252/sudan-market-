(function() {
    'use strict';

    // دالة مساعدة للتحقق من وجود العنصر
    function safeSetTextContent(elementId, text) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    // دالة مساعدة للتحقق من وجود العنصر قبل الإضافة
    function safeAppendChild(parentId, childElement) {
        const parent = document.getElementById(parentId);
        if (parent) {
            parent.appendChild(childElement);
        } else {
            console.warn(`Parent element with ID ${parentId} not found`);
        }
    }

    // دالة مساعدة للتحقق من وجود العنصر قبل الإضافة
    function safeInsertBefore(newElement, referenceElementId) {
        const referenceElement = document.getElementById(referenceElementId);
        if (referenceElement && referenceElement.parentNode) {
            referenceElement.parentNode.insertBefore(newElement, referenceElement);
        } else {
            console.warn(`Reference element with ID ${referenceElementId} not found or has no parent`);
        }
    }

    // دالة مساعدة للتحقق من وجود العنصر قبل الإضافة
    function safeAddEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element with ID ${elementId} not found`);
        }
    }

    // تصدير الدوال المساعدة
    window.module9Utils = {
        safeSetTextContent,
        safeAppendChild,
        safeInsertBefore,
        safeAddEventListener
    };
})();