(function(){
  const radarEl = document.getElementById('radarContent');
  if (!radarEl) return;

  function computeTrend(){
    let posts = [];
    try{ posts = JSON.parse(localStorage.getItem('user_browser_posts_v1') || '[]'); }catch(e){}
    if (posts.length < 2) return 'ثابت';
    const recent = posts.slice(0, 10);
    const cheapRecent = recent.filter(p => p.priceTag === 'cheap').length;
    const cheapOverall = posts.filter(p => p.priceTag === 'cheap').length;
    const pctRecent = recent.length ? cheapRecent / recent.length : 0;
    const pctOverall = posts.length ? cheapOverall / posts.length : 0;
    if (pctRecent > pctOverall + 0.1) return 'صاعد (المزيد من المنشورات الرخيصة حديثاً)';
    if (pctOverall > pctRecent + 0.1) return 'نازل (المزيد من المنشورات الغالية حديثاً)';
    return 'ثابت';
  }

  function renderTrend(){
    const trend = computeTrend();
    let trendEl = radarEl.querySelector('.price-trend');
    if (!trendEl) {
      trendEl = document.createElement('div');
      trendEl.className = 'price-trend';
      radarEl.appendChild(trendEl);
    }
    trendEl.textContent = `الاتجاه الحالي: ${trend}`;
  }

  renderTrend();
  window.addEventListener('storage', (e)=>{ if(e.key==='user_browser_posts_v1') renderTrend(); });
  const postsContainer = document.getElementById('posts');
  if (postsContainer){
    const observer = new MutationObserver(renderTrend);
    observer.observe(postsContainer, {childList:true, subtree:true});
  }
})();