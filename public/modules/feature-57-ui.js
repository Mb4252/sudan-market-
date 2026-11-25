document.addEventListener('DOMContentLoaded', function() {
    const citySelect = document.getElementById('citySelect');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');

    analyzeBtn.addEventListener('click', function() {
        const selectedCity = citySelect.value;
        if (selectedCity) {
            window.feature57Logic.analyzeCityTrends(selectedCity)
                .then(results => {
                    resultsDiv.innerHTML = `<h3>تحليلات ${selectedCity}</h3><pre>${JSON.stringify(results, null, 2)}</pre>`;
                })
                .catch(error => {
                    resultsDiv.innerHTML = `<p class="error">خطأ: ${error.message}</p>`;
                });
        }
    });
});