(function(){
  const LS_KEY='posts';
  // Load posts from localStorage
  function loadFromLocal(){
    const data=localStorage.getItem(LS_KEY);
    return data?JSON.parse(data):[];
  }
  // Save posts to localStorage
  function saveToLocal(posts){
    try{
      localStorage.setItem(LS_KEY,JSON.stringify(posts));
    }catch(e){
      console.warn('localStorage full, using IndexedDB fallback');
    }
  }
  // Render a single post in the DOM
  function renderPost(p){
    const container=document.getElementById('posts');
    if(!container) return;
    const div=document.createElement('div');
    div.className='post '+(p.priceTag||'');
    div.dataset.id=p.id||'';
    div.innerHTML=`<div class="meta">${p.author||'مجهول'} — ${new Date(p.timestamp).toLocaleString()}</div>`+
      `<div class="${p.priceTag||'neutral'}">${p.priceTag==='cheap'?'رخيص':p.priceTag==='expensive'?'غالي':'عادي'}</div>`+
      `<div>${p.content||''}</div>`;
    container.appendChild(div);
    if(window.applyFilter) window.applyFilter(window.currentFilter||'');
  }
  // Public API: add a post, persist it and render
  window.addPost = async function(post){
    const posts=loadFromLocal();
    posts.push(post);
    saveToLocal(posts);
    if(window.indexedDB){
      try{ await addPost(post); }catch(e){ console.error('IndexedDB save failed',e); }
    }
    renderPost(post);
  };
  // Initialize UI with stored posts
  loadFromLocal().forEach(renderPost);
})();