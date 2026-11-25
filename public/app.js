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
            : 'normal';
      } else {
        post.priceTag = 'normal';
      }
    } else {
      post.priceTag = 'unknown';
    }
    
    return post;
  };
  
  // 4. UI Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize UI components
    const postsContainer = document.getElementById('posts');
    const contentInput = document.getElementById('content');
    const publishBtn = document.getElementById('publishBtn');
    const authorInput = document.getElementById('author');
    const filterBtns = document.querySelectorAll('.filter-btn');
    const compareBtn = document.getElementById('compareBtn');
    const analyticsToggle = document.getElementById('analyticsToggle');
    const analyticsPanel = document.getElementById('analyticsPanel');
    const compareOverlay = document.getElementById('compareOverlay');
    const compareContent = document.getElementById('compareContent');
    
    // Initialize charts
    const chartVolume = new Chart(document.getElementById('chartVolume'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'عدد المنشورات',
          data: [],
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
    
    const chartPriceTrends = new Chart(document.getElementById('chartPriceTrends'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'متوسط السعر',
          data: [],
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true
      }
    });
    
    const chartStoreComparison = new Chart(document.getElementById('chartStoreComparison'), {
      type: 'bar',
      data: {
        labels: [],
        datasets: [{
          label: 'متوسط السعر',
          data: [],
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
    
    // Render posts
    function renderPosts(posts, filter = '') {
      postsContainer.innerHTML = '';
      
      posts.forEach(post => {
        if (filter && post.priceTag !== filter) return;
        
        const postElement = document.createElement('div');
        postElement.className = `post ${post.priceTag}`;
        postElement.innerHTML = `
          <div class="post-header">
            <span class="post-author">${post.author || 'مجهول'}</span>
            <span class="post-time">${new Date(post.timestamp).toLocaleString('ar-EG')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          <div class="post-meta">
            <span class="post-store">${post.store}</span>
            ${post.price !== null ? `<span class="post-price">${post.price} ريال</span>` : ''}
          </div>
        `;
        
        postsContainer.appendChild(postElement);
      });
    }
    
    // Update UI based on posts
    function updateUI(posts) {
      renderPosts(posts);
      updateRadar(posts);
      updateAnalytics(posts);
    }
    
    // Update radar with smart opportunities
    function updateRadar(posts) {
      const radarContent = document.getElementById('radarContent');
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      
      const recentPosts = posts.filter(p => p.timestamp > dayAgo && p.price !== null);
      
      if (recentPosts.length === 0) {
        radarContent.innerHTML = 'لا توجد بيانات كافية لتحليل الفرص.';
        return;
      }