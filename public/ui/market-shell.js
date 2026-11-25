// market-shell.js

// دالة بناء هيكل الواجهة العصرية
function buildModernUI() {
  // إنشاء عناصر الواجهة الأساسية
  const appContainer = document.createElement('div');
  appContainer.id = 'sudan-market-app';
  appContainer.innerHTML = `
    <header>
      <h1>سوق السودان</h1>
      <div id="connection-status">متصل</div>
    </header>
    <main>
      <div id="live-stream-container"></div>
      <div id="posts-container"></div>
    </main>
    <footer>
      <button id="publish-btn">نشر</button>
    </footer>
  `;

  // إضافة عناصر الواجهة إلى DOM
  document.body.appendChild(appContainer);

  // تهيئة الواجهة
  initializeUI();
}

// دالة تهيئة الواجهة
function initializeUI() {
  // تهيئة البث الحي
  initializeLiveStream();

  // تهيئة المنشورات
  initializePosts();

  // تهيئة النشر
  initializePublish();
}

// دالة تهيئة البث الحي
function initializeLiveStream() {
  const streamContainer = document.getElementById('live-stream-container');
  if (!streamContainer) return;

  // إنشاء عنصر البث الحي
  const streamElement = document.createElement('div');
  streamElement.id = 'live-stream';
  streamElement.innerHTML = '<p>البث الحي قيد التحميل...</p>';
  streamContainer.appendChild(streamElement);
}

// دالة تهيئة المنشورات
function initializePosts() {
  const postsContainer = document.getElementById('posts-container');
  if (!postsContainer) return;

  // عرض المنشورات الحالية
  displayPosts();

  // تحديث المنشورات دورياً
  setInterval(displayPosts, 5000);
}

// دالة عرض المنشورات
function displayPosts() {
  const postsContainer = document.getElementById('posts-container');
  if (!postsContainer) return;

  const posts = window.localPostsStore.getAllPosts();
  postsContainer.innerHTML = '';

  if (posts.length === 0) {
    postsContainer.innerHTML = '<p>لا توجد منشورات متاحة.</p>';
    return;
  }

  posts.forEach(post => {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    postElement.innerHTML = `
      <div class="post-title">${post.title}</div>
      <div class="post-date">${window.safeFormatDate(new Date(post.date), 'ar-EG')}</div>
      <div class="post-content">${post.content}</div>
    `;
    postsContainer.appendChild(postElement);
  });
}

// دالة تهيئة النشر
function initializePublish() {
  const publishBtn = document.getElementById('publish-btn');
  if (!publishBtn) return;

  publishBtn.addEventListener('click', () => {
    // هنا ستتم إضافة منطق النشر
    alert('تم النشر!');
  });
}

// تصدير الوظيفة الرئيسية
window.buildModernUI = buildModernUI;