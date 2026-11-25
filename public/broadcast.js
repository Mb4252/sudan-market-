const channel = new BroadcastChannel('posts');
channel.addEventListener('message', e => {
  if (e.data && e.data.type === 'NEW_POST') {
    const postsDiv = document.getElementById('posts');
    if (postsDiv) {
      const div = document.createElement('div');
      div.className = 'post ' + (e.data.priceTag || '');
      div.innerHTML = `<div class="meta">${e.data.author || 'مجهول'} — ${new Date(e.data.timestamp).toLocaleString()}</div><div>${e.data.content}</div>`;
      postsDiv.prepend(div);
      applyFilter(window.currentFilter);
    }
  }
});
function publishPost(post) {
  if (window.tagPost) {
    post.priceTag = window.tagPost(post);
  }
  channel.postMessage({ type: 'NEW_POST', ...post });
}
window.publishPost = publishPost;