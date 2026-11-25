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
        post.priceTag = post.price < avgPrice * 0.9 ? 'cheap' : post.price > avgPrice * 1.1 ? 'expensive' : 'normal';
      } else {
        post.priceTag = 'normal';
      }
    }
    
    return post;
  };

  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI Elements
    const publishBtn = document.getElementById('publishBtn');
    const contentInput = document.getElementById('content');
    const authorInput = document.getElementById('author');
    const postsContainer = document.getElementById('posts');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');
    const closeBtn = compareContent.querySelector('.close-btn');
    
    // Initialize UI State
    updateUIStatus('جاري الاتصال...', false);
    
    // Event Listeners
    publishBtn.addEventListener('click', publishPost);
    contentInput.addEventListener('input', validateInput);
    authorInput.addEventListener('input', validateInput);
    filterButtons.forEach(btn => btn.addEventListener('click', filterPosts));
    compareBtn.addEventListener('click', showCompareModal);
    analyticsToggle.addEventListener('click', toggleAnalytics);
    closeBtn.addEventListener('click', hideCompareModal);
    
    // Initialize Posts
    renderPosts(window.postStorage.getAll());
    
    // Storage Update Listener
    window.addEventListener('storage:update', (e) => {
      renderPosts(e.detail);
      updateRadar();
    });
  });

  // 5. Core Functions
  function publishPost() {
    const content = document.getElementById('content').value.trim();
    const author = document.getElementById('author').value.trim();
    
    if (!content) return;
    
    const post = {
      id: Date.now().toString(),
      content,
      author: author || 'مجهول',
      timestamp: Date.now()
    };
    
    // Tag the post
    window.tagPost(post);
    
    // Save to storage
    window.postStorage.addPost(post);
    
    // Clear input
    document.getElementById('content').value = '';
    document.getElementById('author').value = '';
    
    // Update UI
    validateInput();
  }

  function validateInput() {
    const content = document.getElementById('content').value.trim();
    document.getElementById('publishBtn').disabled = !content;
  }

  function renderPosts(posts, filter = '') {
    const container = document.getElementById('posts');
    container.innerHTML = '';
    
    posts.filter(p => !filter || p.priceTag === filter).forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = `post ${post.priceTag || ''}`;
      postElement.innerHTML = `
        <div class="post-header">
          <span class="post-author">${escapeHtml(post.author)}</span>
          <span class="post-time">${formatTime(post.timestamp)}</span>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        ${post.price ? `<div class="post-price">${post.price} ${getCurrency(post.content)}</div>` : ''}
        ${post.store ? `<div class="post-store">${escapeHtml(post.store)}</div>` : ''}