(function(){
  // محاكاة WebAssembly للتحليل السريع
  function extractPrice(text) {
    if (!text) return null;
    const regex = /([\d,.]+)/g;
    const matches = text.match(regex);
    if (!matches) return null;
    const nums = matches.map(m => parseFloat(m.replace(/,/g, '')));
    return nums.length ? Math.max(...nums) : null;
  }

  function analyzePrice(price, avgPrice = 100) {
    if (price === null || price === undefined) return { label: 'neutral', confidence: 0 };
    if (price < avgPrice * 0.9) return { label: 'cheap', confidence: 1 };
    if (price > avgPrice * 1.1) return { label: 'expensive', confidence: 1 };
    return { label: 'neutral', confidence: 0.5 };
  }

  window.PriceWasm = {
    extractPrice,
    analyzePrice
  };
})();