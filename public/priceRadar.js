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
    return {total, cheap, expensive};
  }

  function render(){
    const {total, cheap, expensive} = computeStats();
    radarEl.innerHTML = `
      <p>إجمالي المنشورات: <strong>${total}</strong></p>
      <p>رخيص: <strong class="cheap">${cheap}</strong> | غالي: <strong class="expensive">${expensive}</strong></p>
    `;
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