self.addEventListener('message', e => {
  const {content} = e.data;
  const price = extractPrice(content);
  const avg = 100;
  let label = '';
  let confidence = 0;
  if (price !== null) {
    if (price < avg * 0.9) {
      label = 'cheap';
      confidence = 1;
    } else if (price > avg * 1.1) {
      label = 'expensive';
      confidence = 1;
    } else {
      label = 'neutral';
      confidence = 0.5;
    }
  }
  self.postMessage({label, confidence});
});
function extractPrice(text) {
  const regex = /([\\$€£]?[\\d,.]+)/g;
  const matches = text.match(regex);
  if (!matches) return null;
  const nums = matches.map(m => parseFloat(m.replace(/[^\\d.,]/g, '').replace(',', '.')));
  return nums.length ? Math.max(...nums) : null;
}
