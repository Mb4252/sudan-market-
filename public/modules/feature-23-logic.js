(function() {
    'use strict';

    // دالة لتحليل الاتجاهات
    function analyzeTrends() {
        // استرجاع المنشورات من المخزن
        const posts = window.store.getPosts();

        // استخراج المدينة المحددة (يمكن توسيعها لاحقًا)
        const selectedCity = 'الخرطوم'; // قيمة افتراضية

        // تصفية المنشورات حسب المدينة
        const cityPosts = posts.filter(post => post.city === selectedCity);

        if (cityPosts.length < 2) {
            displayResults('لا توجد بيانات كافية لتحليل الاتجاهات في هذه المدينة.');
            return;
        }

        // استخراج التواريخ والأسعار
        const dataPoints = cityPosts.map(post => ({
            date: new Date(post.timestamp),
            price: post.price
        })).sort((a, b) => a.date - b.date);

        // حساب الانحدار الخطي
        const { slope, intercept } = calculateLinearRegression(dataPoints);

        // تحديد اتجاه السعر
        let trend;
        if (slope > 0.1) {
            trend = 'ارتفاع'; // انحدار موجب
        } else if (slope < -0.1) {
            trend = 'هبوط'; // انحدار سالب
        } else {
            trend = 'ثابت'; // انحدار قريب من الصفر
        }

        // حساب الثقة (بناءً على حجم البيانات والتباين)
        const confidence = calculateConfidence(dataPoints);

        // عرض النتائج
        displayResults(`الاتجاه في ${selectedCity}: ${trend}. الثقة: ${confidence.toFixed(2)}%`);
    }

    // دالة لحساب الانحدار الخطي
    function calculateLinearRegression(dataPoints) {
        const n = dataPoints.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        dataPoints.forEach(point => {
            const x = point.date.getTime(); // تحويل التاريخ إلى عدد
            const y = point.price;

            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += x * x;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    // دالة لحساب الثقة
    function calculateConfidence(dataPoints) {
        // حساب التباين
        const mean = dataPoints.reduce((sum, point) => sum + point.price, 0) / dataPoints.length;
        const variance = dataPoints.reduce((sum, point) => sum + Math.pow(point.price - mean, 2), 0) / dataPoints.length;

        // حساب الثقة (بناءً على حجم البيانات والتباين)
        const confidence = Math.min(100, (dataPoints.length / 10) * (1 - variance / (mean * mean)) * 100);

        return Math.max(0, confidence); // تأكد من أن القيمة بين 0 و 100
    }

    // دالة لعرض النتائج
    function displayResults(message) {
        const resultsDiv = document.getElementById('trends-results');
        if (resultsDiv) {
            resultsDiv.textContent = message;
        }
    }

    // تصدير الوظائف
    window.feature23Logic = {
        analyzeTrends
    };
})();