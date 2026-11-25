(function(){
  const STORAGE_KEY = window.APP_CONFIG.storageKey;
  
  function getPosts() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch(e) {
      return [];
    }
  }

  function addPost(post) {
    const posts = getPosts();
    posts.unshift(post);
    if (posts.length > 100) posts.pop();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch(e) {
      console.warn('Storage full, trimming posts');
      while (posts.length > 10) {
        posts.pop();
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
          break;
        } catch(e2) { continue; }
      }
    }
    renderPosts();
    window.updateRadar && window.updateRadar();
  }

  function renderPosts() {
    const postsDiv = document.getElementById('posts');
    if (!postsDiv) return;
    const posts = getPosts();
    postsDiv.innerHTML = '';
    posts.forEach(p => {
      const div = document.createElement('div');
      div.className = 'post ' + (p.priceTag || '');
      div.dataset.timestamp = p.timestamp;
      div.innerHTML = `
        <div class="meta">${p.author || 'مجهول'} — ${new Date(p.timestamp).toLocaleString()}</div>
        <div>${p.content}</div>
      `;
      postsDiv.appendChild(div);
    });
    window.applyFilter && window.applyFilter(window.currentFilter);
  }

  window.postStorage = { addPost, getPosts, renderPosts };
  
  document.addEventListener('DOMContentLoaded', renderPosts);
})();