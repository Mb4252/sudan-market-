(function(){
  function createModal() {
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
    close.onclick = () => { overlay.remove(); };
    modal.appendChild(close);
    const content = document.createElement('div');
    content.id = 'compareContent';
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    return overlay;
  }

  function showCompare() {
    let posts = [];
    try {
      const data = localStorage.getItem(window.APP_CONFIG.storageKey);
      if (data) posts = JSON.parse(data);
    } catch(e) { posts = []; }

    const cheapPosts = posts.filter(p => p.priceTag === 'cheap');
    const expensivePosts = posts.filter(p => p.priceTag === 'expensive');

    const overlay = createModal();
    const content = document.getElementById('compareContent');
    
    let html = '<h3>مقارنة الأسعار</h3>';
    
    if (cheapPosts.length === 0 && expensivePosts.length === 0) {
      html += '<p>لا توجد منشورات مصنفة كرخيص أو غالي للمقارنة.</p>';
    } else {
      html += '<div style="margin-bottom:15px; padding:10px; background:#f0f8ff; border-radius:5px;">';
      html += '<strong>الفرق السعري النصي:</strong><br/>';
      html += `المنشورات الرخيصة: ${cheapPosts.length} | المنشورات الغالية: ${expensivePosts.length}<br/>`;
      if (cheapPosts.length > 0 && expensivePosts.length > 0) {
        html += `الفرق في العدد: ${Math.abs(cheapPosts.length - expensivePosts.length)} منشورات`;
      }
      html += '</div>';
      
      if (cheapPosts.length > 0) {
        html += '<h4 style="color:green;">المنشورات الرخيصة:</h4>';
        cheapPosts.forEach(p => {
          html += `<div style="border:1px solid #d0d7de; padding:8px; margin-bottom:8px; border-radius:4px;">
            <div class="meta">${p.author || 'مجهول'} — ${new Date(p.timestamp).toLocaleString()}</div>
            <div>${p.content}</div>
          </div>`;
        });
      }
      
      if (expensivePosts.length > 0) {
        html += '<h4 style="color:red;">المنشورات الغالية:</h4>';
        expensivePosts.forEach(p => {
          html += `<div style="border:1px solid #d0d7de; padding:8px; margin-bottom:8px; border-radius:4px;">
            <div class="meta">${p.author || 'مجهول'} — ${new Date(p.timestamp).toLocaleString()}</div>
            <div>${p.content}</div>
          </div>`;
        });
      }
    }
    
    content.innerHTML = html;
  }

  window.showCompare = showCompare;
  
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('compareBtn');
    if (btn) {
      btn.addEventListener('click', showCompare);
    }
  });
})();