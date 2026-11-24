(function(){
  function createModal(){
    let overlay=document.getElementById('compareOverlay');
    if(overlay) return overlay;
    overlay=document.createElement('div');
    overlay.id='compareOverlay';
    overlay.className='modal-overlay';
    const modal=document.createElement('div');
    modal.className='modal';
    const close=document.createElement('span');
    close.className='modal-close';
    close.textContent='✖';
    close.onclick=()=>{ overlay.remove(); };
    modal.appendChild(close);
    const content=document.createElement('div');
    content.id='compareContent';
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    return overlay;
  }
  function showCompare(selectedPosts){
    if(!selectedPosts||selectedPosts.length===0) return;
    const overlay=createModal();
    const content=document.getElementById('compareContent');
    content.innerHTML='';
    selectedPosts.forEach(p=>{
      const div=document.createElement('div');
      div.className='compare-post';
      div.style.border='1px solid #d0d7de';
      div.style.padding='8px';
      div.style.marginBottom='8px';
      const areaIndex=getAreaIndex(p.area||'');
      div.innerHTML=`<div class="meta">${escapeHtml(p.author)} — ${escapeHtml(p.timestamp)}</div>`+
        `<div class="${p.priceTag}">${p.priceTag==='cheap'?'رخيص':'غالي'}</div>`+
        `<div>مؤشر المنطقة: ${areaIndex}</div>`+
        `<div>${escapeHtml(p.content)}</div>`;
      content.appendChild(div);
    });
  }
  window.showCompare=showCompare;
})();