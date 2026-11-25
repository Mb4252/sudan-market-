const modelUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.20.0/dist/tf.min.js';

function loadModel() {
  return new Promise((resolve, reject) => {
    if (window.tf) return resolve(window.tf);
    const script = document.createElement('script');
    script.src = modelUrl;
    script.onload = () => resolve(window.tf);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function tagPost(post) {
  const cheapKeywords = ['رخيص', 'ثمن منخفض', 'عادي'];
  const expensiveKeywords = ['غالي', 'ثمن مرتفع', 'مكلف'];
  const content = post.content.toLowerCase();
  if (cheapKeywords.some(k => content.includes(k))) return 'cheap';
  if (expensiveKeywords.some(k => content.includes(k))) return 'expensive';
  return 'normal';
}

window.tagPost = tagPost;
window.loadTaggingModel = loadModel;