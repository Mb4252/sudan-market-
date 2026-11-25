class Feature81Logic {
  constructor() {
    this.websocket = new WebSocket('wss://sudan-market-2.onrender.com');
    this.setupWebSocket();
  }

  setupWebSocket() {
    this.websocket.onopen = () => {
      console.log('تم الاتصال بخدمة Render');
    };

    this.websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'marketAnalysis') {
        this.processAnalysisResults(data.results);
      }
    };
  }

  analyzeMarket() {
    const marketData = JSON.parse(localStorage.getItem('marketData')) || {};
    this.websocket.send(JSON.stringify({
      type: 'analyzeMarket',
      data: marketData
    }));
  }

  processAnalysisResults(results) {
    const event = new CustomEvent('feature81AnalysisComplete', {
      detail: results
    });
    window.dispatchEvent(event);
  }
}

window.feature81Logic = new Feature81Logic();