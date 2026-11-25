(function(){
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500
  };

  // 2. Storage Manager (Source of Truth)
  window.postStorage = {
    getAll: () => {
      try {
        const raw = localStorage.getItem(window.APP_CONFIG.storageKey);
        return JSON.parse(raw || '[]');
      } catch (e) { return []; }
    },
    addPost: (post) => {
      const posts = window.postStorage.getAll();
      posts.unshift(post);
      if (posts.length > window.APP_CONFIG.maxPosts) posts.pop();
      localStorage.setItem(window.APP_CONFIG.storageKey, JSON.stringify(posts));
      window.dispatchEvent(new CustomEvent('storage:update', { detail: posts }));
    },
    clear: () => localStorage.removeItem(window.APP_CONFIG.storageKey)
  };

  // 3. Price Extraction & Smart Tagging Engine (Time-Based Clustering)
  window.tagPost = (post) => {
    const text = post.content || '';
    const priceMatch = text.match(/(\\d+(?:\\.\\d+)?)/);
    post.price = priceMatch ? parseFloat(priceMatch[1]) : null;
    
    // Extract Store Name
    const storeMatch = text.match(/(?:في|من|عند)\\s+([\\u0600-\\u06FF\\s]+)/);
    post.store = storeMatch ? storeMatch[1].trim().substring(0, 20) : 'غير محدد';
    
    // Smart Dynamic Tagging: Compare with 24h average for same store/item
    if (post.price !== null) {
      const posts = window.postStorage.getAll();
      const now = Date.now();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      
      // Filter posts from last 24 hours, same store, and has price
      const relevantPosts = posts.filter(p =>
        p.timestamp > dayAgo &&
        p.store === post.store &&
        p.price !== null
      );
      
      if (relevantPosts.length > 0) {
        const avgPrice = relevantPosts.reduce((sum, p) => sum + p.price, 0) / relevantPosts.length;
        // If current price is 10% lower than average, it's cheap; 10% higher, it's expensive
        post.priceTag = post.price < avgPrice * 0.9 ? 'cheap' : (post.price > avgPrice * 1.1 ? 'expensive' : 'normal');
      } else {
        // Fallback if no history: use absolute threshold
        post.priceTag = post.price < 50 ? 'cheap' : 'expensive';
      }
    }
    
    return post;
  };

  /* ...مقتطع للاختصار... */

  // 4. Publish Function (Local-First with Fallback)
  window.publishPost = async (content, author) => {
    const post = {
      id: Date.now().toString(36),
      content,
      author: author || 'مجهول',
      timestamp: Date.now()
    };

    // Step 1: Save immediately to localStorage
    window.postStorage.addPost(window.tagPost(post));

    // Step 2: Try WebSocket in background
    try {
      const ws = new WebSocket(window.APP_CONFIG.wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'NEW_POST', ...post }));
        ws.close();
      };
      ws.onerror = () => {
        console.warn('WebSocket failed, post saved locally');
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
    }
  };

  // 5. UI Event Listeners
  document.addEventListener('DOMContentLoaded', () => {
    // Publish Button
    document.getElementById('publishBtn').addEventListener('click', () => {
      const content = document.getElementById('content').value.trim();
      const author = document.getElementById('author').value.trim();
      if (content) {
        window.publishPost(content, author);
        document.getElementById('content').value = '';
      }
    });

    // ...مقتطع للاختصار...
  });

  // 6. Error Handling
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    document.getElementById('status').textContent = `خطأ: ${event.message}`;
    document.getElementById('status').style.color = 'red';
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled rejection:', event.reason);
    document.getElementById('status').textContent = `خطأ: ${event.reason}`;
    document.getElementById('status').style.color = 'red';
  });

})();