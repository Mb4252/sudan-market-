const channel = new BroadcastChannel('posts');
channel.addEventListener('message', e => {
  try{
    if (e.data && e.data.type === 'NEW_POST') {
      const postsDiv = document.getElementById('posts');
      if (postsDiv) {
        const div = document.createElement('div');
        div.className = 'post ' + (e.data.priceTag || '');
        div.dataset.timestamp = e.data.timestamp;
        div.innerHTML = `<div class="meta">${e.data.author || 'مجهول'} — ${new Date(e.data.timestamp).toLocaleString()}</div><div>${e.data.content}</div>`;
        postsDiv.prepend(div);
        applyFilter(window.currentFilter);
        // Persist to localStorage
        const stored = JSON.parse(localStorage.getItem(window.APP_CONFIG.storageKey) || '[]');
        stored.unshift(e.data);
        localStorage.setItem(window.APP_CONFIG.storageKey, JSON.stringify(stored));
      }
    }
  }catch(err){
    console.warn('Broadcast handler error', err);
  }
});
function publishPost(post) {
  try{
    if (window.tagPost) {
      post.priceTag = window.tagPost(post);
    }
    channel.postMessage({ type: 'NEW_POST', ...post });
  }catch(err){
    console.warn('Publish error', err);
  }
}
window.publishPost = publishPost;