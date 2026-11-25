class Feature22Logic {
  constructor() {
    this.data = null;
  }

  async fetchData() {
    try {
      const response = await fetch('https://sudan-market-2.onrender.com/feature-22-data');
      if (!response.ok) throw new Error('خطأ في جلب بيانات الميزة 22');
      this.data = await response.json();
      window.feature22UI.updateContent(this.data.message);
    } catch (error) {
      console.error('خطأ في معالجة بيانات الميزة 22:', error);
    }
  }

  init() {
    this.fetchData();
  }
}

window.feature22Logic = new Feature22Logic();
window.feature22Logic.init();