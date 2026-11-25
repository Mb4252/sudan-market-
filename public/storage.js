(function(){
  const POSTS_KEY = 'postsData';
  const postsContainer = document.getElementById('posts');
  const publishBtn = document.getElementById('publishBtn');
  const authorInput = document.getElementById('author');
  const contentInput = document.getElementById('content');

  function loadPosts(){
    const raw = localStorage.getItem(POSTS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  function savePosts(posts){
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  }

  function renderPost(post){
    const div = document.createElement('div');
    div.className = `post ${post.priceTag}`;
    div.dataset.id = post.id;
    div.innerHTML = `
      <div class="meta">${post.author || 'مجهول'} — ${new Date(post.timestamp).toLocaleString()}</div>
      <div class="content">${post.content}</div>
      <div class="tag ${post.priceTag}">${post.priceTag === 'cheap' ? 'رخيص' : post.priceTag === 'expensive' ? 'غالي' : 'عادي'}</div>
    `;
    postsContainer.appendChild(div);
  }

  function renderAll(){
    postsContainer.innerHTML = '';
    const posts = loadPosts();
    posts.forEach(renderPost);
    // Apply current filter if any
    if (window.currentFilter !== undefined) {
      window.applyFilter(window.currentFilter);
    }
  }

  function addPost(){
    const content = contentInput.value.trim();
    if (!content) return;
    const author = authorInput.value.trim();
    const timestamp = Date.now();
    // استخدم الدالة detectPrice الموجودة في price.js لتصنيف السعر
    const priceTag = typeof detectPrice === 'function' ? detectPrice(content) || 'neutral' : 'neutral';
    const post = {id: timestamp, author, content, timestamp, priceTag};
    const posts = loadPosts();
    posts.push(post);
    savePosts(posts);
    renderPost(post);
    // إفراغ الحقول
    contentInput.value = '';
    authorInput.value = '';
    // إبلاغ الخادم (WebSocket أو long‑polling) إذا كان متصلاً
    if (window.sendMessage) {
      window.sendMessage({type:'newPost', data:post});
    }
  }

  // استمع للنقر على زر النشر
  if (publishBtn) {
    publishBtn.addEventListener('click', addPost);
  }

  // مراقبة تغيّر التخزين عبر نافذة أخرى (sync بين تبويبات)
  window.addEventListener('storage', e => {
    if (e.key === POSTS_KEY) {
      renderAll();
    }
  });

  // تحميل أولي
  document.addEventListener('DOMContentLoaded', renderAll);
})();