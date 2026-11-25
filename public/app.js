(function() {
  'use strict';
  
  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500,
    priceRegex: /(\\d+(\\.\\d{1,2})?)\s*(ريال|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار|مليون ريال|مليون جنيه)/i,
    storeRegex: /(في|من|عند)\s+([\\u0600-\\u06FF\\s]+)/i
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
    post.price = priceMatch ? parseFloat(priceMatch[0].replace(/[^\\d.]/g, '')) : null;
    
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
    }
    
    return post;
  };

  // 4. UI Rendering
  function renderPosts(posts) {
    const postsContainer = document.getElementById('posts');
    postsContainer.innerHTML = '';
    
    posts.forEach(post => {
      const postElement = document.createElement('div');
      postElement.className = `post ${post.priceTag || ''}`;
      
      const authorElement = document.createElement('div');
      authorElement.className = 'author';
      authorElement.textContent = post.author || 'مجهول';
      
      const contentElement = document.createElement('div');
      contentElement.className = 'content';
      contentElement.textContent = post.content;
      
      const metaElement = document.createElement('div');
      metaElement.className = 'meta';
      metaElement.innerHTML = `
        <span class="store">${post.store}</span>
        <span class="price">${post.price ? `${post.price} ريال` : 'سعر غير محدد'}</span>
        <span class="time">${new Date(post.timestamp).toLocaleString()}</span>
      `;
      
      postElement.appendChild(authorElement);
      postElement.appendChild(contentElement);
      postElement.appendChild(metaElement);
      
      postsContainer.appendChild(postElement);
    });
  }
  
  // 5. Event Listeners
  document.getElementById('publishBtn').addEventListener('click', () => {
    const author = document.getElementById('author').value.trim();
    const content = document.getElementById('content').value.trim();
    
    if (!content) {
      showError('الرجاء كتابة منشور', 'warning');
      return;
    }
    
    const post = {
      id: Date.now().toString(),
      author: author || null,
      content: content,
      timestamp: Date.now()
    };
    
    const taggedPost = window.tagPost(post);
    window.postStorage.addPost(taggedPost);
    
    document.getElementById('author').value = '';
    document.getElementById('content').value = '';
    
    showError('تم نشر المنشور بنجاح!', 'success');
  });
  
  // 6. Initialization
  document.addEventListener('DOMContentLoaded', () => {
    const posts = window.postStorage.getAll();
    renderPosts(posts);
    
    // Enable publish button when content is entered
    document.getElementById('content').addEventListener('input', (e) => {
      document.getElementById('publishBtn').disabled = e.target.value.trim() === '';
    });
  });

  // 7. Storage Update Listener
  window.addEventListener('storage:update', (e) => {
    renderPosts(e.detail);
  });
}