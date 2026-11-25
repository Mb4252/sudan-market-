(function(){
  const DB_NAME = 'postsDB';
  const STORE_NAME = 'posts';
  const CONFIG_KEY = 'appConfig';
  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { db = request.result; resolve(db); };
      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('priceTag', 'priceTag', { unique: false });
        }
      };
    });
  }

  async function getAll() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function add(post) {
    if (!db) await openDB();
    const enriched = { ...post, id: post.id || Date.now() + Math.random() };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(enriched);
      request.onsuccess = () => { enriched.id = request.result; resolve(enriched); };
      request.onerror = () => reject(request.error);
    });
  }

  async function update(post) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(post);
      request.onsuccess = () => resolve(post);
      request.onerror = () => reject(request.error);
    });
  }

  async function clear() {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function tagPost(post) {
    const text = (post.content || '').toLowerCase();
    const cheapKeywords = ['رخيص', 'عروض', 'خصم', 'تخفيض', 'سعر جيد', 'مناسب', 'اقتصادي'];
    const expensiveKeywords = ['غالي', 'مكلف', 'فاخر', 'بريميوم', 'أصلي', 'علامة تجارية'];
    let score = 0;
    cheapKeywords.forEach(k => { if (text.includes(k)) score -= 1; });
    expensiveKeywords.forEach(k => { if (text.includes(k)) score += 1; });
    if (score < 0) return 'cheap';
    if (score > 0) return 'expensive';
    return 'neutral';
  }

  function renderAll() {
    getAll().then(posts => {
      const container = document.getElementById('posts');
      if (!container) return;
      container.innerHTML = '';
      posts.sort((a, b) => b.timestamp - a.timestamp).forEach(p => {
        const div = document.createElement('div');
        div.className = 'post';
        div.dataset.priceTag = p.priceTag || tagPost(p);
        div.innerHTML = `<div class="meta">${escapeHtml(p.author)} — ${new Date(p.timestamp).toLocaleString()}</div><div>${escapeHtml(p.content)}</div>`;
        container.appendChild(div);
      });
      if (window.filterPosts) window.filterPosts();
    }).catch(console.error);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  openDB().then(() => {
    window.postStorage = { addPost: add, getAll, update, clear, renderAll, tagPost };
    window.tagPost = tagPost;
    renderAll();
  }).catch(console.error);
}