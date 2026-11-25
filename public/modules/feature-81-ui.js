class Feature81UI {
  constructor() {
    this.initUI();
    this.setupEventListeners();
  }

  initUI() {
    // إنشاء عناصر DOM
    this.analysisButton = document.createElement('button');
    this.analysisButton.textContent = 'تحليل السوق';
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.id = 'feature81-results';
    document.body.appendChild(this.analysisButton);
    document.body.appendChild(this.resultsContainer);
  }

  setupEventListeners() {
    this.analysisButton.addEventListener('click', () => {
      window.feature81Logic.analyzeMarket();
    });

    window.addEventListener('feature81AnalysisComplete', (e) => {
      this.displayResults(e.detail);
    });
  }

  displayResults(results) {
    this.resultsContainer.innerHTML = '';
    const title = document.createElement('h3');
    title.textContent = 'نتائج التحليل';
    this.resultsContainer.appendChild(title);

    // عرض النتائج
    for (const [key, value] of Object.entries(results)) {
      const item = document.createElement('div');
      item.textContent = `${key}: ${value}`;
      this.resultsContainer.appendChild(item);
    }
  }
}

window.feature81UI = new Feature81UI();