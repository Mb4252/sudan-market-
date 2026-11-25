window.feature80Logic = {
    analyzeCityTrend: function(city) {
        // محاكاة حساب الاتجاه (في الواقع، يجب استبدال هذا باستدعاء API)
        const trend = Math.random() > 0.5 ? 'ارتفاع' : 'انخفاض';
        const confidence = Math.floor(Math.random() * 100);

        const results = {
            city: city,
            trend: trend,
            confidence: confidence
        };

        window.feature80UI.updateResults(results);
    }
};