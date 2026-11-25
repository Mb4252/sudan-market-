window.feature57Logic = {
    analyzeCityTrends: async function(city) {
        const response = await fetch(`/api/analyze-city?city=${encodeURIComponent(city)}`);
        if (!response.ok) throw new Error('خطأ في تحليل المدينة');
        return await response.json();
    }
};