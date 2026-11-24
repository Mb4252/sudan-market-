const STORAGE_KEY = 'user_browser_posts_v1';
const WS_URL = location.hostname === 'localhost'
  ? `ws://${location.host}`
  : `wss://${location.hostname}`;

const statusEl = document.getElementById('status');
const serverTimeEl = document.getElementById('serverTime');
const authorEl = document.getElementById('author');
const contentEl = document.getElementById('content');
const publishBtn = document.getElementById('publishBtn');
const postsEl = document.getElementById('posts');

function getLocalPosts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalPost(post) {
  if (!post || !post.content) return;
  // add price tag if missing
  if (!post.priceTag) {
    post.priceTag = typeof window.detectPrice === 'function' ? window.detectPrice(post.content) : '';
  }
  const posts = getLocalPosts();
  if (post.id && posts.some(p => p.id === post.id)) return;
  posts.unshift(post);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts.slice(0, 200)));
  } catch (e) {
    console.warn('تعذر حفظ المنشور في localStorage:', e);
  }
  renderPosts();
}

function renderPosts() {
  const posts = getLocalPosts();
  if (!postsEl) return;
  postsEl.innerHTML = posts.map(p => `
    <div class="post ${p.priceTag ? p.priceTag : ''}">
      <div class="meta">${escapeHtml(p.author || 'مستخدم')} — ${escapeHtml(p.timestamp || '')}</div>
      <div>${escapeHtml(p.content || '')}</div>
    </div>
  `).join('') || '<p>لا توجد منشورات محفوظة في المتصفح بعد.</p>';
}

function updateOnlineCount() {
  const isOpen = socket && socket.readyState === WebSocket.OPEN;
  fetch('/stats')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(data => {
      const count = Number(data.connectedClients ?? data.clients ?? 0);
      const base = isOpen ? 'متصل بـ Render' : 'جاري الاتصال بـ Render';
      if (statusEl) {
        statusEl.textContent = `${base} — المتصلون الآن: ${count}`;
      }
    })
    .catch(() => {
      if (statusEl && !isOpen) {
        statusEl.textContent = 'انقطع الاتصال، جاري إعادة المحاولة...';
      }
    });
}

let socket;
let reconnectTimer;

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    updateOnlineCount();
  };

  socket.onclose = () => {
    if (statusEl) {
      statusEl.textContent = 'انقطع الاتصال، جاري إعادة المحاولة...';
    }
    reconnectTimer = setTimeout(connect, 2500);
  };

  socket.onerror = () => {
    if (statusEl) {
      statusEl.textContent = 'تعذر الاتصال بالخادم، جاري إعادة المحاولة...';
    }
  };

  socket.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'post') {
        saveLocalPost(data);
        updateOnlineCount();
      } else if (data.type === 'system' && data.timestamp && serverTimeEl) {
        const time = new Date(data.timestamp).toLocaleTimeString();
        serverTimeEl.textContent = `وقت الخادم: ${time}`;
      }
    } catch (e) {
      console.warn('رسالة WebSocket غير صالحة:', e);
    }
  };
}

setInterval(updateOnlineCount, 10000);

if (publishBtn && contentEl) {
  publishBtn.addEventListener('click', () => {
    const text = contentEl.value.trim();
    if (!text) return;

    const msg = {
      type: 'post',
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: (authorEl ? authorEl.value.trim() : '') || 'مستخدم',
      content: text,
      timestamp: new Date().toISOString()
    };

    // add price tag before sending
    msg.priceTag = typeof window.detectPrice === 'function' ? window.detectPrice(msg.content) : '';

    saveLocalPost(msg);

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }

    contentEl.value = '';
  });
}

renderPosts();
connect();