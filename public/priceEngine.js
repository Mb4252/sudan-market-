(function(){
  function classify(posts){
    if(!posts||posts.length===0) return {cheap:[],expensive:[],average:0};
    const prices = posts.map(p=>Number(p.price)).filter(p=>!isNaN(p));
    if(prices.length===0) return {cheap:[],expensive:[],average:0};
    const avg = prices.reduce((a,b)=>a+b,0)/prices.length;
    const cheap = posts.filter(p=>Number(p.price)<avg);
    const expensive = posts.filter(p=>Number(p.price)>=avg);
    return {cheap,expensive,average:avg};
  }

  function renderRadar(){
    const posts = window.postStorage ? window.postStorage.load() : [];
    const {cheap,expensive,average}=classify(posts);
    const radar=document.getElementById('radarContent');
    if(!radar) return;
    radar.innerHTML = `\n      متوسط السعر: ${average.toFixed(2)}<br/>\n      عدد المنشورات الرخيصة: ${cheap.length}<br/>\n      عدد المنشورات الغالية: ${expensive.length}\n    `;
  }

  window.addEventListener('posts:ready',renderRadar);
  window.addEventListener('posts:updated',renderRadar);
  window.addEventListener('posts:cleared',renderRadar);
})();
