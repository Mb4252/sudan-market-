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
    const contentInput = document.getElementById('content');
    const publishBtn = document.getElementById('publishBtn');
    const postsContainer = document.getElementById('posts');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');
    const closeCompareBtn = document.getElementById('closeCompare');
    const compareResults = document.getElementById('compareResults');
    
    // Initialize UI
    renderPosts(window.postStorage.getAll());
    
    // Event Listeners
    contentInput.addEventListener('input', () => {
      publishBtn.disabled = contentInput.value.trim() === '';
    });
    
    publishBtn.addEventListener('click', () => {
      const content = contentInput.value.trim();
      if (content) {
        const post = {
          id: Date.now().toString(),
          content,
          author: document.getElementById('author').value.trim() || 'مجهول',
          timestamp: Date.now(),
          price: null,
          store: null,
          priceTag: null
        };
        
        const taggedPost = window.tagPost(post);
        window.postStorage.addPost(taggedPost);
        contentInput.value = '';
        publishBtn.disabled = true;
      }
    });
    
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderPosts(window.postStorage.getAll(), btn.dataset.filter);
      });
    });
    
    compareBtn.addEventListener('click', () => {
      const posts = window.postStorage.getAll();
      const products = {};
      
      posts.forEach(post => {
        if (post.price && post.store) {
          if (!products[post.content]) {
            products[post.content] = {
              name: post.content,
              prices: []
            };
          }
          products[post.content].prices.push({
            store: post.store,
            price: post.price
          });
        }
      });
      
      compareResults.innerHTML = '';
      Object.values(products).forEach(product => {
        if (product.prices.length > 1) {
          const productDiv = document.createElement('div');
          productDiv.className = 'product-comparison';
          
          const title = document.createElement('h4');
          title.textContent = product.name;
          productDiv.appendChild(title);
          
          const pricesDiv = document.createElement('div');
          pricesDiv.className = 'prices';
          
          product.prices.sort((a, b) => a.price - b.price);
          
          product.prices.forEach(price => {
            const priceDiv = document.createElement('div');
            priceDiv.className = 'price-item';
            priceDiv.innerHTML = `<span class="store">${price.store}</span><span class="price">${price.price} ريال</span>`;
            pricesDiv.appendChild(priceDiv);
          });
          
          productDiv.appendChild(pricesDiv);
          compareResults.appendChild(productDiv);
        }
      });
      
      compareOverlay.classList.remove('hidden');
    }