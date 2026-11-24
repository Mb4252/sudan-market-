function detectPrice(content) {
  if (!content) return '';
  const lower = content.toLowerCase();
  if (lower.includes('رخيص') || lower.includes('قليل')) return 'cheap';
  if (lower.includes('غالي') || lower.includes('باهظ')) return 'expensive';
  return '';
}

window.detectPrice = detectPrice;