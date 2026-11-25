// public/app.js - Core Logic: Storage, Tagging, UI, Broadcast, Analytics
(function(){
  'use strict';
  
  // Config
  window.APP_CONFIG = {
    wsUrl: 'wss://browser-relay-server.onrender.com', // Render Relay
    storageKey: 'smart_posts_v1',
    maxPosts: 500
  };

  // --- 1. Smart Tagging Engine (Phase 1) ---
  const CHEAP_KEYWORDS = ['عرض', 'خصم', 'تخفيض', 'رخيص', 'ببلاش', 'مجاني', 'صفقة', 'عروض', 'توفير'];
  const EXPENSIVE_KEYWORDS = ['غالي', 'مكلف', 'فاخر', 'بريميوم', 'أصلي', 'ماركة', 'استيراد'];
  const PRICE_REGEX = /(\d+[.,]?\d*)\s*(ريال|ر\.س|\$|دولار|درهم)/i;
  const STORE_REGEX = \b(سوبر|ماركت|هايبر|بنده|العثيم|كارفور|لولو|دانوب|تمو|نون|امازون|جرير|اكسترا|مكتبة|صيدلية|بقاله|سوق|مركز|مول)\b/i;

  function analyzeContext(text) {
    if (!text) return { price: null, priceTag: 'unknown', store: 'غير معروف' };
    const lower = text.toLowerCase();
    let tag = 'normal';
    if (CHEAP_KEYWORDS.some(k => lower.includes(k))) tag = 'cheap';
    if (EXPENSIVE_KEYWORDS.some(k => lower.includes(k))) tag = 'expensive';
    
    const priceMatch = text.match(PRICE_REGEX);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
    
    const storeMatch = text.match(STORE_REGEX);
    const store = storeMatch ? storeMatch[0] : 'غير محدد';
    
    return { price, priceTag: tag, store };
  }
  window.tagPost = (post) => analyzeContext(post.content).priceTag;

  // --- 2. LocalStorage Manager (Phase 0 Fix) ---
  const Storage = {
    getAll() {
      try { return JSON.parse(localStorage.getItem(APP_CONFIG.storageKey) || '[]'); }
      catch { return []; }
    },
    saveAll(posts) {
      localStorage.setItem(APP_CONFIG.storageKey, JSON.stringify(posts.slice(-APP_CONFIG.maxPosts)));
    },
    addPost(post) {
      const posts = this.getAll();
      const enriched = { ...post, id: post.id || Date.now() + Math.random(), createdAt: post.createdAt || Date.now(), ...analyzeContext(post.content) };
      if (!posts.some(p => p.id === enriched.id)) {
        posts.push(enriched);
        this.saveAll(posts);
        renderPosts(posts);
        updateRadar(posts);
        updateAnalytics(posts);
      }
      return enriched;
    },
    clear() { localStorage.removeItem(APP_CONFIG.storageKey); renderPosts([]); updateRadar([]); }
  };
  window.postStorage = Storage;

  // --- 3. Broadcast & WebSocket (Phase 0 Fix) ---
  const channel = new BroadcastChannel('posts');
  let ws = null;
  function connectWS() {
    if (ws) ws.close();
    ws = new WebSocket(APP_CONFIG.wsUrl);
    ws.onopen = () => setStatus('متصل ✅', 'online');
    ws.onclose = () => setStatus('منفصل ⚠️', 'offline');
    ws.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d.type === 'NEW_POST') Storage.addPost(d); } catch {} };
  }
  function publishPost(post) {
    const enriched = Storage.addPost(post);
    channel.postMessage({ type: 'NEW_POST', ...enriched });
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'NEW_POST', ...enriched }));
  }
  window.publishPost = publishPost;
  channel.onmessage = (e) => { if (e.data?.type === 'NEW_POST') Storage.addPost(e.data); };
  window.addEventListener('online', connectWS);
  window.addEventListener('offline', () => { if (ws) ws.close(); setStatus('أوفلاين 📴', 'offline'); });
  connectWS();

  // --- 4. UI Rendering ---
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  let currentFilter = '';
  let charts = {};

  function setStatus(msg, cls) { $('#status').textContent = msg; $('#status').className = 'status ' + cls; }