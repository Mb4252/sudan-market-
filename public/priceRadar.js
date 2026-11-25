(function(){
  function updateRadar() {
    const contentEl = document.getElementById('radarContent');
    if (!contentEl) return;
    
    let posts = [];
    try {
      const data = localStorage.getItem(window.APP_CONFIG.storageKey);
      if (data) posts = JSON.parse(data);
    } catch(e) { posts = []; }

    let cheap = 0, expensive = 0, normal = 0;
    posts.forEach(p => {
      if (p.priceTag === 'cheap') cheap++;
      else if (p.priceTag === 'expensive') expensive++;
      else normal++;
    });

    contentEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
        <span>الرخيص: <strong style="color:green">${cheap}</strong></span>
        <span>الغالي: <strong style="color:red">${expensive}</strong></span>
        <span>العادي: <strong style="color:blue">${normal}</strong></span>
      </div>
      <div style="font-size:0.9em; color:#666;">إجمالي المنشورات: ${posts.length}</div>
    `;
  }

  window.updateRadar = updateRadar;
  
  // تحديث عند التحميل
  document.addEventListener('DOMContentLoaded', updateRadar);
  
  // تحديث عند تغيير الفلتر أو إضافة منشور
  const observer = new MutationObserver(() => updateRadar());
  const postsDiv = document.getElementById('posts');
  if (postsDiv) {
    observer.observe(postsDiv, { childList: true, subtree: true });
  }
})();