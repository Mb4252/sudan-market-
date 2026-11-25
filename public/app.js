/*! Smart Market Price Tagger v2.0 - Reactive, Offline-First, NLP & Analytics */
(function() {
  'use strict';

  // 1. Global Error Handling (Mandatory)
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('[App Error]', message, source, lineno, colno, error);
    logError('JS', message, source, lineno);
  };
  window.onunhandledrejection = function(event) {
    console.error('[Promise Rejection]', event.reason);
    logError('Promise', event.reason.message || 'Unknown', 'async', 0);
  };

  function logError(type, msg, src, line) {
    try {
      const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
      logs.push({ type, msg, src, line, time: new Date().toISOString() });
      if (logs.length > 50) logs.shift();
      localStorage.setItem('error_logs', JSON.stringify(logs));
    } catch(e) {}
  }

  // 2. Reactive Store Implementation
  window.Store = class extends EventTarget {
    constructor(initialState = {}) {
      super();
      this._state = new Proxy(initialState, {
        set: (target, prop, value) => {
          target[prop] = value;
          this.dispatchEvent(new CustomEvent('change', { detail: { key: prop, value } }));
          return true;
        }
      });
    }
    get state() { return this._state; }
    set(key, value) { this._state[key] = value; }
  };

  // Initialize Store
  window.appStore = new Store({
    posts: [],
    connectionStatus: 'offline',
    selectedCity: 'all',
    filter: 'all'
  });

  // 3. Plugin Registry
  window.PluginRegistry = {
    plugins: {},
    register(name, plugin) {
      this.plugins[name] = plugin;
      console.log(`[Plugin] Registered: ${name}`);
    },
    execute(name, ...args) {
      if (this.plugins[name] && typeof this.plugins[name].execute === 'function') {
        return this.plugins[name].execute(...args);
      }
      return null;
    }
  };

  // 4. NLP Engine (Arabic)
  window.NLP = {
    extractEntities(text) {
      const result = { item: '', price: 0, unit: '', place: '', confidence: 0 };
      
      // Price Extraction
      const priceMatch = text.match(/(\d+(\.\d{1,2})?)\s*(ريال|جنيه|جنية|دولار|ليرة|دينار|قيراط|مليون|مليار)/i);
      if (priceMatch) {
        result.price = parseFloat(priceMatch[1]);
        result.unit = priceMatch[2];
        result.confidence += 0.4;
      }

      // Place Extraction (Sudan Cities)
      const cities = ['الخرطوم', 'أم درمان', 'بحري', 'بورتسودان', 'كسلا', 'سنار', 'الفاشر', 'الدامر', 'مدني', 'الجنينة'];
      for (let city of cities) {
        if (text.includes(city)) {
          result.place = city;
          result.confidence += 0.3;
          break;
        }
      }

      // Item Extraction (Basic heuristic: words before price)
      const words = text.split(/\s+/);
      let itemWords = [];
      let foundPrice = false;
      for (let w of words) {
        if (foundPrice) break;
        if (/\d/.test(w)) foundPrice = true;
        else if (w.length > 2 && !['في', 'من', 'عند', 'بسعر', 'سعر', 'اليوم', 'الآن'].includes(w)) {
          itemWords.push(w);
        }
      }
      if (itemWords.length > 0) {
        result.item = itemWords.join(' ');
        result.confidence += 0.3;
      }

      // Cap confidence
      result.confidence = Math.min(result.confidence, 1.0);
      return result;
    }
  };

  // 5. Analytics Engine (Volatility, Anomaly, Prediction)
  window.Analytics = {
    calculateVolatility(prices) {
      if (prices.length < 2) return 0;
      const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance = prices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / prices.length;
      return Math.sqrt(variance);
    },
    detectAnomaly(price, history) {
      if (history.length < 3) return false;
      const mean = history.reduce((a, b) => a + b, 0) / history.length;
      const std = this.calculateVolatility(history);
      if (std === 0) return false;
      const zScore = Math.abs(price - mean) / std;
      return zScore > 2.0; // Threshold
    },
    predictNextPrice(prices) {
      if (prices.length < 2) return prices[0] || 0;
      // Simple Linear Regression
      const n = prices.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += prices[i];
        sumXY += i * prices[i];
        sumX2 += i * i;
      }
      const denominator = (n * sumX2 - sumX * sumX);
      if (denominator === 0) return prices[n-1];
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;
      return intercept + slope * n; // Next point
    },
    getConfidenceScore(data) {
      if (!data || data.length === 0) return 0;
      const volatility = this.calculateVolatility(data);
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const score = mean === 0 ? 0 : Math.max(0, 100 - (volatility / mean) * 100);
      return Math.round(score);
    }
  };

  // 6. Storage Manager (Local-First)
  window.postStorage = {
    getAll: () => {
      try {
        return JSON.parse(localStorage.getItem('smart_posts_v2') || '[]');
      } catch (e) {
        return [];
      }
    },
    addPost: (post) => {
      const posts = window.postStorage.getAll();
      posts.unshift(post);
      if (posts.length > 500) posts.pop();
      localStorage.setItem('smart_posts_v2', JSON.stringify(posts));
      window.appStore.set('posts', posts);
      // Broadcast to WS if online
      if (window.appStore.state.connectionStatus === 'online' && window.ws) {
        window.ws.send(JSON.stringify({ type: 'post:new', data: post }));
      }
    },
    updatePost: (id, updates) => {
      const posts = window.postStorage.getAll();
      const index = posts.findIndex(p => p.id === id);
      if (index > -1) {
        posts[index] = { ...posts[index], ...updates };
        localStorage.setItem('smart_posts_v2', JSON.stringify(posts));
        window.appStore.set('posts', posts);
      }
    }
  };

  // 7. WebSocket Manager
  window.ws = null;
  window.connectWS = function() {
    const url = 'wss://sudan-market-2.onrender.com';
    try {
      window.ws = new WebSocket(url);
      window.ws.onopen = () => {
        window.appStore.set('connectionStatus', 'online');
        console.log('[WS] Connected');
      };
      window.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'post:new') {
            // Avoid duplicates
            const existing = window.postStorage.getAll().find(p => p.id === msg.data.id);
            if (!existing) {
              window.postStorage.addPost(msg.data);
            }
          }
        } catch(e) { console.error('[WS] Parse error', e); }
      };
      window.ws.onclose = () => {
        window.appStore.set('connectionStatus', 'offline');
        setTimeout(connectWS, 5000); // Reconnect
      };
      window.ws.onerror = () => {
        window.appStore.set('connectionStatus', 'offline');
      };
    } catch(e) {
      window.appStore.set('connectionStatus', 'offline');
    }
  };

  // 8. UI Renderer
  window.renderUI = function() {
    const posts = window.appStore.state.posts;
    const container = document.getElementById('postsContainer');
    if (!container) return;

    let html = '';
    posts.forEach(post => {
      const entities = window.NLP.extractEntities(post.content);
      const isAnomaly = window.Analytics.detectAnomaly(entities.price, posts.filter(p => window.NLP.extractEntities(p.content).item === entities.item).map(p => window.NLP.extractEntities(p.content).price));
      const confidence = window.Analytics.getConfidenceScore(posts.filter(p => window.NLP.extractEntities(p.content).item === entities.item).map(p => window.NLP.extractEntities(p.content).price));
      
      html += `
        <div class="post-card ${isAnomaly ? 'anomaly' : ''}" data-id="${post.id}">
          <div class="post-header">
            <span class="author">${post.author || 'مجهول'}</span>
            <span class="time">${new Date(post.timestamp).toLocaleTimeString('ar-SD')}</span>
          </div>
          <div class="post-content">${post.content}</div>
          ${entities.item ? `<div class="entity-item">📦 ${entities.item}</div>` : ''}
          ${entities.price ? `<div class="entity-price">💰 ${entities.price} ${entities.unit} <span class="confidence">(ثقة: ${Math.round(entities.confidence * 100)}%)</span></div>` : ''}
          ${entities.place ? `<div class="entity-place">📍 ${entities.place}</div>` : ''}
          ${isAnomaly ? '<div class="anomaly-badge">⚠️ شذوذ سعري</div>' : ''}
          <div class="confidence-bar" style="width: ${confidence}%">${confidence}%</div>
        </div>
      `;
    });
    container.innerHTML = html;
  };

  // 9. Market Pulse SVG Generator
  window.generateMarketPulse = function() {
    const posts = window.appStore.state.posts;
    const prices = posts.map(p => window.NLP.extractEntities(p.content).price).filter(p => p > 0);
    const volatility = window.Analytics.calculateVolatility(prices);
    const pulse = Math.min(100, volatility * 10);
    
    const svg = `
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="#e0e0e0" stroke-width="8"/>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#4CAF50" stroke-width="8" 
                stroke-dasharray="251.2" stroke-dashoffset="${251.2 - (251.2 * pulse / 100)}" 
                transform="rotate(-90 50 50)"/>
        <text x="50" y="55" text-anchor="middle" font-size="14" fill="#333">${Math.round(pulse)}%</text>
      </svg>
    `;
    return svg;
  };

  // 10. Voice Assistant (Web Speech API)
  window.initVoiceAssistant = function() {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new webkitSpeechRecognition();
      recognition.lang = 'ar-SA';
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        document.getElementById('content').value = transcript;
        console.log('[Voice]', transcript);
      };
      const btn = document.getElementById('voiceBtn');
      if (btn) {
        btn.onclick = () => recognition.start();
      }
    } else {
      console.warn('[Voice] Web Speech API not supported');
    }
  };

  // 11. Developer Console
  window.initDevConsole = function() {
    const consoleDiv = document.createElement('div');
    consoleDiv.id = 'devConsole';
    consoleDiv.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;height:150px;background:#222;color:#0f0;font-family:monospace;font-size:12px;overflow-y:auto;z-index:9999;border-top:2px solid #0f0;';
    consoleDiv.innerHTML = '<div style="padding:5px;">Developer Console (Ctrl+Shift+D to toggle)</div>';
    document.body.appendChild(consoleDiv);

    const originalLog = console.log;
    console.log = function(...args) {
      originalLog.apply(console, args);
      const entry = document.createElement('div');
      entry.textContent = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
      consoleDiv.appendChild(entry);
      consoleDiv.scrollTop = consoleDiv.scrollHeight;
    };

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        consoleDiv.style.display = consoleDiv.style.display === 'none' ? 'block' : 'none';
      }
    });
  };

  // 12. Service Worker Registration (Offline-First)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[SW] Registered');
    }).catch(err => {
      console.error('[SW] Registration failed', err);
    });
  }

  // 13. Initialization
  document.addEventListener('DOMContentLoaded', () => {
    // Load initial posts
    const posts = window.postStorage.getAll();
    window.appStore.set('posts', posts);
    
    // Connect WS
    window.connectWS();
    
    // Init Voice
    window.initVoiceAssistant();
    
    // Init Dev Console
    window.initDevConsole();
    
    // Render UI
    window.renderUI();
    
    // Listen to store changes
    window.appStore.addEventListener('change', (e) => {
      if (e.detail.key === 'posts') {
        window.renderUI();
      }
    });

    // Publish Button
    const publishBtn = document.getElementById('publishBtn');
    if (publishBtn) {
      publishBtn.onclick = () => {
        const content = document.getElementById('content').value.trim();
        const author = document.getElementById('author').value.trim();
        if (!content) return;
        
        const post = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          content,
          author,
          timestamp: Date.now(),
          entities: window.NLP.extractEntities(content)
        };
        
        window.postStorage.addPost(post);
        document.getElementById('content').value = '';
        document.getElementById('author').value = '';
      };
    }

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        window.appStore.set('filter', btn.dataset.filter || 'all');
      };
    });
  });

  // 14. Plugin Registration Example
  window.PluginRegistry.register('nlp', {
    execute: (text) => window.NLP.extractEntities(text)
  });
  window.PluginRegistry.register('analytics', {
    execute: (type, data) => {
      if (type === 'volatility') return window.Analytics.calculateVolatility(data);
      if (type === 'predict') return window.Analytics.predictNextPrice(data);
      return null;
    }
  });

})();