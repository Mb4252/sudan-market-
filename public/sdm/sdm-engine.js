// sdm-engine.js

// نواة محرك الذكاء الاصطناعي SDM
// الوظيفة: تحليل دردشة الشخص الخاص، حلل الأسعار والمنتجات والمدن، وإعطاء ردود فورية محلية

(function() {
    'use strict';

    // إعدادات التخزين
    const SDM_STORAGE_KEY = 'sdmChatHistory';

    // تحميل سجل الدردشة
    function loadChatHistory() {
        try {
            const data = localStorage.getItem(SDM_STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Error loading SDM chat history:', error);
            return [];
        }
    }

    // حفظ سجل الدردشة
    function saveChatHistory(history) {
        try {
            localStorage.setItem(SDM_STORAGE_KEY, JSON.stringify(history));
            return true;
        } catch (error) {
            console.error('Error saving SDM chat history:', error);
            return false;
        }
    }

    // تحليل الرسالة
    function analyzeMessage(message) {
        // تحليل بسيط للأسعار والمنتجات والمدن
        const priceRegex = /\d+\s*(?:SDG|جنيه سوداني)/i;
        const productRegex = /(?:منتج|منتجات|سوق|سوق السودان)/i;
        const cityRegex = /(?:خرطوم|الخرطوم|بورتسودان|بورت سودان|الجزيرة|الجزيرة)/i;

        const containsPrice = priceRegex.test(message);
        const containsProduct = productRegex.test(message);
        const containsCity = cityRegex.test(message);

        return {
            containsPrice,
            containsProduct,
            containsCity
        };
    }

    // توليد الرد
    function generateResponse(messageAnalysis) {
        let response = "أهلا بك في خدمة دعم السوق!";

        if (messageAnalysis.containsPrice) {
            response += " لقد لاحظت أنك تتحدث عن أسعار. هل تريد معرفة أسعار المنتجات الحالية في السوق؟";
        }

        if (messageAnalysis.containsProduct) {
            response += " هل تريد معرفة تفاصيل حول منتج معين أو معلومات عن السوق؟";
        }

        if (messageAnalysis.containsCity) {
            response += " هل تريد معرفة أسعار أو منتجات في مدينة معينة؟";
        }

        return response;
    }

    // معالجة الرسالة
    function processMessage(message) {
        const messageAnalysis = analyzeMessage(message);
        const response = generateResponse(messageAnalysis);

        // حفظ الرسالة والرد في سجل الدردشة
        const chatHistory = loadChatHistory();
        chatHistory.push({
            message,
            response,
            timestamp: new Date().toISOString()
        });
        saveChatHistory(chatHistory);

        return response;
    }

    // ربط الدوال مع النافذة العالمية
    window.sdmEngine = {
        processMessage
    };

    // تهيئة المحرك عند تحميل الصفحة
    document.addEventListener('DOMContentLoaded', function() {
        // يمكنك إضافة أي تهيئة إضافية هنا
    });

})();