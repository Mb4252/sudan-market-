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
  };

  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    const contentInput = document.getElementById('content');
    const publishBtn = document.getElementById('publishBtn');
    const postsContainer = document.getElementById('posts');
    const radarContent = document.getElementById('radarContent');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');
    
    // Initialize UI State
    updatePostsList();
    updatePriceRadar();
    
    // Event Listeners
    contentInput.addEventListener('input', () => {
      publishBtn.disabled = contentInput.value.trim().length === 0;
    });
    
    publishBtn.addEventListener('click', () => {
      const content = contentInput.value.trim();
      if (content.length === 0) return;
      
      const post = {
        id: Date.now().toString(),
        content,
        author: document.getElementById('author').value.trim() || 'مجهول',
        timestamp: Date.now()
      };
      
      window.tagPost(post);
      window.postStorage.addPost(post);
      contentInput.value = '';
      publishBtn.disabled = true;
    });
    
    window.addEventListener('storage:update', () => {
      updatePostsList();
      updatePriceRadar();
    });
    
    analyticsToggle.addEventListener('click', () => {
      analyticsPanel.classList.toggle('hidden');
    });
    
    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updatePostsList(btn.dataset.filter);
      });
    });
    
    // Compare Button
    document.getElementById('compareBtn').addEventListener('click', () => {
      const posts = window.postStorage.getAll();
      const stores = [...new Set(posts.map(p => p.store))];
      
      let comparisonHTML = '<h4>مقارنة الأسعار</h4>';
      stores.forEach(store => {
        const storePosts = posts.filter(p => p.store === store && p.price !== null);
        if (storePosts.length > 1) {
          const minPrice = Math.min(...storePosts.map(p => p.price));
          const maxPrice = Math.max(...storePosts.map(p => p.price));
          
          comparisonHTML += `<div class="comparison-item">
            <strong>${store}</strong><br>
            أرخص: ${minPrice} ريال<br>
            أغلى: ${maxPrice} ريال<br>
            فرق: ${maxPrice - minPrice} ريال
          </div>`;
        }
      });
      
      radarContent.innerHTML = comparisonHTML;
    });
    
    // Update Functions
    function updatePostsList(filter = '') {
      const posts = window.postStorage.getAll();
      let filteredPosts = posts;
      
      if (filter) {
        filteredPosts = posts.filter(p => p.priceTag === filter);
      }
      
      postsContainer.innerHTML = filteredPosts.length > 0 ?
        filteredPosts.map(p => {
          const priceTag = p.priceTag ? `<span class="price-tag ${p.priceTag}">${p.priceTag === 'cheap' ? 'رخيص' : 'غالي'}</span>` : '';
          return `<div class="post">
            <div class="post-header">
              <span class="post-author">${p.author}</span>
              <span class="post-time">${new Date(p.timestamp).toLocaleString('ar-EG')}