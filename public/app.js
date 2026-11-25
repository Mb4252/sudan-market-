(function() {
  'use strict';
  
  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500,
    priceRegex: /(\d+(\.\d{1,2})?)\s*(ريال|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار|مليون ريال|مليون جنيه)/i,
    storeRegex: /(في|من|عند)\s+([\u0600-\u06FF\s]+)/i
  };
  
  // 2. Storage Manager (Source of Truth)
  window.postStorage = {
    getAll: () => {
      try {
        const raw = localStorage.getItem(window.APP_CONFIG.storageKey);
        return JSON.parse(raw || '[]');
      } catch (e) {
        console.error('Storage read error:', e);
        return [];
      }
    },
    addPost: (post) => {
      const posts = window.postStorage.getAll();
      const existingPostIndex = posts.findIndex(p => p.id === post.id);
      
      if (existingPostIndex >= 0) {
        posts[existingPostIndex] = post;
      } else {
        posts.unshift(post);
        if (posts.length > window.APP_CONFIG.maxPosts) posts.pop();
      }
      
      localStorage.setItem(window.APP_CONFIG.storageKey, JSON.stringify(posts));
      window.dispatchEvent(new CustomEvent('storage:update', { detail: posts }));
    },
    clear: () => localStorage.removeItem(window.APP_CONFIG.storageKey)
  };
  
  // 3. Price Extraction & Smart Tagging Engine
  window.tagPost = (post) => {
    const text = post.content || '';
    
    // Extract Price
    const priceMatch = text.match(window.APP_CONFIG.priceRegex);
    post.price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\d.]/g, '')) : null;
    
    // Extract Store Name
    const storeMatch = text.match(window.APP_CONFIG.storeRegex);
    post.store = storeMatch ? storeMatch[2].trim().substring(0, 20) : 'غير محدد';
    
    // Smart Dynamic Tagging
    if (post.price !== null) {
      const posts = window.postStorage.getAll();
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      
      const relevantPosts = posts.filter(p =>
        p.timestamp > dayAgo &&
        p.store === post.store &&
        p.price !== null
      );
      
      if (relevantPosts.length > 0) {
        const avgPrice = relevantPosts.reduce((sum, p) => sum + p.price, 0) / relevantPosts.length;
        post.priceTag = post.price < avgPrice * 0.9
          ? 'cheap'
          : post.price > avgPrice * 1.1
            ? 'expensive'
            : '';
      }
    }
    
    return post;
  };
  
  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    const publishBtn = document.getElementById('publishBtn');
    const contentInput = document.getElementById('content');
    const authorInput = document.getElementById('author');
    
    // Check connection status
    checkConnection();
    
    // Load posts from storage
    renderPosts(window.postStorage.getAll());
    
    // Event Listeners
    publishBtn.addEventListener('click', handlePublish);
    contentInput.addEventListener('input', validateInput);
    authorInput.addEventListener('input', validateInput);
    
    // Storage update listener
    window.addEventListener('storage:update', (e) => {
      renderPosts(e.detail);
      updateRadar();
    });
  });
  
  // 5. Connection Check
  function checkConnection() {
    const statusElement = document.getElementById('status');
    const syncBadge = document.getElementById('syncBadge');
    
    if (navigator.onLine) {
      fetch('/health', { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          statusElement.textContent = 'متصل بالجسر';
          syncBadge.classList.remove('offline');
          syncBadge.classList.add('online');
          syncBadge.title = 'متصل';
          document.getElementById('publishBtn').disabled = false;
          document.getElementById('compareBtn').disabled = false;
          document.getElementById('analyticsToggle').disabled = false;
        })
        .catch(() => {
          statusElement.textContent = 'وضع محلي سريع';
          syncBadge.classList.remove('online');
          syncBadge.classList.add('offline');
          syncBadge.title = 'غير مزامن';
        });
    } else {
      statusElement.textContent = 'وضع محلي سريع';
      syncBadge.classList.remove('online');
      syncBadge.classList.add('offline');
      syncBadge.title = 'غير مزامن';
    }
  }
  
  // 6. Publish Handler
  function handlePublish() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();
    
    if (!content) return;
    
    const post = {
      id: Date.now().toString(),
      content,
      author: author || 'مجهول',
      timestamp: Date.now()
    };
    
    // Tag post and save locally
    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);
    
    // Clear input
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';
    document.getElementById('publishBtn').disabled = true;
    
    // Show success message
    showToast('تم نشر المنشور بنجاح!', 'success');
  }
  
  // 7. Input Validation
  function validateInput() {
    const content = document.getElementById('content').value.trim();
    document.getElementById('publishBtn').disabled = !content;
  }
  
  // 8. Render Posts
  function renderPosts(posts) {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';
    
    if (posts.length === 0) {
      postsContainer.innerHTML = '<p>لا توجد منشورات بعد.</p>';
      return;
    }