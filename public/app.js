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
        post.priceTag = post.price < avgPrice * 0.9 ? 'cheap' : post.price > avgPrice * 1.1 ? 'expensive' : '';
      }
    }
    
    return post;
  };
  
  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    const publishBtn = document.getElementById('publishBtn');
    const contentInput = document.getElementById('content');
    const authorInput = document.getElementById('author');
    const postsContainer = document.getElementById('posts');
    const radarContent = document.getElementById('radarContent');
    
    // Initialize UI
    updatePostsUI();
    updateRadarUI();
    
    // Event Listeners
    publishBtn.addEventListener('click', () => {
      const content = contentInput.value.trim();
      if (!content) return;
      
      const post = {
        id: Date.now().toString(),
        content,
        author: authorInput.value.trim() || 'مجهول',
        timestamp: Date.now()
      };
      
      // Save locally first
      window.postStorage.addPost(window.tagPost(post));
      updatePostsUI();
      updateRadarUI();
      
      // Clear input
      contentInput.value = '';
      authorInput.value = '';
      
      // Show confirmation
      showError('تم الحفظ محلياً!', 'success');
    });
    
    contentInput.addEventListener('input', () => {
      publishBtn.disabled = !contentInput.value.trim();
    });
    
    // Storage Update Listener
    window.addEventListener('storage:update', (e) => {
      updatePostsUI();
      updateRadarUI();
    });
    
    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePostsUI(btn.dataset.filter);
      });
    });
    
    // Analytics Toggle
    document.getElementById('analyticsToggle').addEventListener('click', () => {
      document.getElementById('analyticsPanel').classList.toggle('hidden');
    });
    
    // Compare Button
    document.getElementById('compareBtn').addEventListener('click', () => {
      const posts = window.postStorage.getAll();
      const stores = [...new Set(posts.map(p => p.store))];
      
      if (stores.length < 2) {
        showError('لا توجد بيانات كافية للمقارنة', 'warning');
        return;
      }
      
      // Simple comparison logic
      const comparison = stores.map(store => {
        const storePosts = posts.filter(p => p.store === store && p.price !== null);
        if (storePosts.length === 0) return null;
        
        const avgPrice = storePosts.reduce((sum, p) => sum + p.price, 0) / storePosts.length;
        return { store, avgPrice, count: storePosts.length };
      }).filter(Boolean).sort((a, b) => a.avgPrice - b.avgPrice);
      
      // Display comparison
      let comparisonText = '<h4>مقارنة الأسعار:</h4><ul>';
      comparison.forEach((item, i) => {
        comparisonText += `<li>${item.store}: ${item.avgPrice.toFixed(2)} ريال (${item.count} منشور)</li>`;
      });
      comparisonText += '</ul>';
      
      radarContent.innerHTML = comparisonText;
    });
    
    // UI Update Functions
    function updatePostsUI(filter = '') {
      const posts = window.postStorage.getAll();
      
      let filteredPosts = posts;
      if (filter) {
        filteredPosts = posts.filter(p => p.priceTag === filter);
      }