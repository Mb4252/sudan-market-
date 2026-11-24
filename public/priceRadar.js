(function(){
  const radarEl = document.getElementById('radarContent');
  if (!radarEl) return;

  function computeStats(){
    let posts = [];
    try {
      posts = JSON.parse(localStorage.getItem('user_browser_posts_v1') || '[]');
    } catch(e){
      // ignore malformed storage
    }
    const total = posts.length;
    const cheap = posts.filter(p=>p.priceTag==='cheap').length;
    const expensive = posts.filter(p=>p.priceTag==='expensive').length;
    const cheapPct = total ? ((cheap/total)*100).toFixed(1) : 0;
    const expPct = total ? ((expensive/total)*100).toFixed(1) : 0;
    return {total, cheap, expensive, cheapPct, expPct};
  }

  function render(){
    const {total, cheap, expensive, cheapPct, expPct} = computeStats();
    radarEl.innerHTML = `
      <p>إجمالي المنشورات: <strong>${total}</strong></p>
      <p>رخيص: <strong class="cheap">${cheap} (${cheapPct}%)</strong> | غالي: <strong class="expensive">${expensive} (${expPct}%)</strong></p>
    `;
    // Dominant price alert
    const diff = parseFloat(cheapPct) - parseFloat(expPct);
    if (!isNaN(diff) && diff > 20){
      const alertDiv = document.createElement('div');
      alertDiv.className = 'price-alert';
      alertDiv.textContent = 'المنشورات الرخيصة تفوق الغالية بأكثر من 20%';
      radarEl.appendChild(alertDiv);
    }
  }

  // Initial render
  render();

  // Re‑render when localStorage changes (other tabs)
  window.addEventListener('storage', (e)=>{ if(e.key==='user_browser_posts_v1') render(); });

  // Re‑render when DOM of posts changes (new post added locally)
  const postsContainer = document.getElementById('posts');
  if (postsContainer){
    const observer = new MutationObserver(render);
    observer.observe(postsContainer, {childList:true, subtree:true});
  }
})();