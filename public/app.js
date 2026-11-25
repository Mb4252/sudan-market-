(function(){
  'use strict';

  // 1. Config & State
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com',
    storageKey: 'smart_posts_v1',
    maxPosts: 500
  };

  // 2. Service Worker Registration (Robust)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW Registration failed:', err));
    });
  }

  // 3. Storage Manager (Source of Truth)
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

  // 4. Price Extraction & Tagging Engine
  window.tagPost = (post) => {
    const text = post.content || '';
    const priceMatch = text.match(/(\d+(?:\.\d+)?)/);
    post.price = priceMatch ? parseFloat(priceMatch[1]) : null;
    
    // Simple Heuristic for Cheap/Expensive (Threshold 50 SAR example)
    if (post.price !== null) {
      post.priceTag = post.price < 50 ? 'cheap' : 'expensive';
    }
    
    // Extract Store Name (Simple Regex: text after 'في' or 'من')
    const storeMatch = text.match(/(?:في|من|عند)\s+([\u0600-\u06FF\s]+)/);
    post.store = storeMatch ? storeMatch[1].trim().substring(0, 20) : 'غير محدد';
    
    return post;
  };

  // 5. Broadcast Channel (Offline-First Sync)
  const channel = new BroadcastChannel('posts_sync');
  channel.onmessage = (e) => {
    if (e.data.type === 'NEW_POST' && window.postStorage) {
      window.postStorage.addPost(e.data);
    }
  };

  // 6. WebSocket Relay (Background Sync)
  let ws = null;
  function connectWS() {
    if (!window.APP_CONFIG.wsUrl) return;
    try {
      ws = new WebSocket(window.APP_CONFIG.wsUrl);
      ws.onopen = () => {
        const badge = document.getElementById('syncBadge');
        if(badge) { badge.className = 'badge online'; badge.title = 'مزامن'; badge.textContent = '☁️'; }
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_POST' && window.postStorage) {
            window.postStorage.addPost(data);
          }
        } catch (e) { console.warn('WS Parse Error', e); }
      };
      ws.onclose = () => {
        const badge = document.getElementById('syncBadge');
        if(badge) { badge.className = 'badge offline'; badge.title = 'غير مزامن'; badge.textContent = '☁️'; }
        setTimeout(connectWS, 5000); // Reconnect
      };
    } catch (e) { console.warn('WS Connection Error', e); }
  }

  // 7. UI Rendering & Logic
  function renderPosts(filter = '') {
    const posts = window.postStorage.getAll();
    const container = document.getElementById('posts');
    if (!container) return;
    
    let filtered = posts;
    if (filter) filtered = posts.filter(p => p.priceTag === filter);

    container.innerHTML = filtered.map(p => `
      <div class="post-item ${p.priceTag || ''}">
        <div class="post-header">
          <strong>${p.author || 'مجهول'}</strong>
          <small>${new Date(p.timestamp).toLocaleTimeString('ar-SA')}</small>
        </div>
        <p>${p.content}</p>
        <div class="post-meta">
          ${p.price ? `<span class="price">${p.price} ر.س</span>` : ''}
          ${p.store ? `<span class="store">🏪 ${p.store}</span>` : ''}
        </div>
      </div>
    `).join('') || '<p>لا توجد منشورات</p>';

    renderRadar(filtered);
  }

  function renderRadar(posts) {
    const radarContent = document.getElementById('radarContent');
    if (!radarContent) return;
    
    const pricedPosts = posts.filter(p => p.price !== null);
    if (pricedPosts.length === 0) {
      radarContent.innerHTML = '<p>لا توجد بيانات أسعار كافية.</p>';
      return;
    }

    // Group by Store
    const storePrices = {};
    pricedPosts.forEach(p => {
      if (!storePrices[p.store]) storePrices[p.store] = [];
      storePrices[p.store].push(p.price);
    });

    // Calculate Averages
    const storeAvgs = Object.keys(storePrices).map(store => {
      const prices = storePrices[store];
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
      return { store, avg, count: prices.length };
    }).sort((a, b) => a.avg - b.avg);

    const cheapest = storeAvgs[0];
    const mostExpensive = storeAvgs[storeAvgs.length - 1];

    radarContent.innerHTML = `
      <div class="radar-stats">
        <div class="stat cheap">🟢 أرخص: ${cheapest.store} (${cheapest.avg.toFixed(2)} ر.س)</div>
        <div class="stat expensive">🔴 أغلى: ${mostExpensive.store} (${mostExpensive.avg.toFixed(2)} ر.س)</div>
      </div>
      <table class="radar-table">
        <thead><tr><th>المتجر</th><th>متوسط السعر</th><th>العدد</th></tr></thead>
        <tbody>
          ${storeAvgs.map(s => `<tr><td>${s.store}</td><td>${s.avg.toFixed(2)}</td><td>${s.count}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function renderAnalytics() {
    const posts = window.postStorage.getAll();
    const priced = posts.filter(p => p.price !== null);
    
    if (priced.length === 0) return;

    // Chart 1: Price Distribution
    const ctx1 = document.getElementById('chartVolume').getContext('2d');
    if (window.chartVolume) window.chartVolume.destroy();
    window.chartVolume = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['رخيص', 'غالي'],
        datasets: [{
          label: 'العدد',
          data: [priced.filter(p=>p.priceTag==='cheap').length, priced.filter(p=>p.priceTag==='expensive').length],
          backgroundColor: ['#4CAF50', '#F44336']
        }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });

    // Chart 2: Avg Price by Store
    const storePrices = {};
    priced.forEach(p => {
      if (!storePrices[p.store]) storePrices[p.store] = [];
      storePrices[p.store].push(p.price);
    });
    const storeAvgs = Object.keys(storePrices).map(s => ({
      store: s,
      avg: storePrices[s].reduce((a,b)=>a+b,0)/storePrices[s].length
    }