(function(){
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function loadPosts(){
    try {
      const raw = localStorage.getItem(window.APP_CONFIG.storageKey);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function createModal(){
    let overlay = document.getElementById('compareOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'compareOverlay';
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const close = document.createElement('span');
    close.className = 'modal-close';
    close.textContent = '✖';
    close.onclick = function(){ overlay.remove(); };
    modal.appendChild(close);
    const content = document.createElement('div');
    content.id = 'compareContent';
    modal.appendChild(content);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function(e){
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function card(p){
    return '<div style="border:1px solid #d0d7de;padding:8px;margin-bottom:8px;border-radius:4px;">' +
      '<div class="meta">' + esc(p.author || 'مجهول') + ' — ' + esc(new Date(p.timestamp).toLocaleString()) + '</div>' +
      '<div>' + esc(p.content) + '</div></div>';
  }

  function showCompare(){
    const posts = loadPosts();
    const cheap = posts.filter(function(p){ return p.priceTag === 'cheap'; });
    const expensive = posts.filter(function(p){ return p.priceTag === 'expensive'; });
    const overlay = createModal();
    const content = document.getElementById('compareContent');
    let html = '<h3>مقارنة الأسعار</h3>';
    if (!cheap.length && !expensive.length) {
      html += '<p>لا توجد منشورات مصنفة كرخيص أو غالي للمقارنة.</p>';
    } else {
      html += '<div style="margin-bottom:15px;padding:10px;background:#f0f8ff;border-radius:5px;">' +
        '<strong>الفرق السعري النصي:</strong><br/>' +
        'المنشورات الرخيصة: ' + cheap.length + ' | المنشورات الغالية: ' + expensive.length + '<br/>';
      if (cheap.length && expensive.length) {
        html += 'الفرق في العدد: ' + Math.abs(cheap.length - expensive.length) + ' منشورات';
      }
      html += '</div>';
      if (cheap.length) html += '<h4 style="color:green;">المنشورات الرخيصة:</h4>' + cheap.map(card).join('');
      if (expensive.length) html += '<h4 style="color:red;">المنشورات الغالية:</h4>' + expensive.map(card).join('');
    }
    content.innerHTML = html;
  }

  window.showCompare = showCompare;
})();
