// priceEngine.js – integrates WebAssembly price classifier
// Assumes priceWasm.js has loaded a module exposing a classify function
window.tagPost = function(post){
  try{
    if (window.priceWasm && typeof window.priceWasm.classify === 'function') {
      const tag = window.priceWasm.classify(post.content);
      return tag === 'cheap' || tag === 'expensive' ? tag : 'normal';
    }
  }catch(err){
    console.warn('PriceEngine classify error', err);
  }
  return 'normal';
};