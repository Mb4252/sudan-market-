(function(){
  const postsEl = document.getElementById('posts');
  const publishBtn = document.getElementById('publishBtn');
  const statusEl = document.getElementById('status');
  const authorInput = document.getElementById('author');
  const contentInput = document.getElementById('content');
  const compareBtn = document.getElementById('compareBtn');

  function getPosts() {
    return JSON.parse(localStorage.getItem('posts') || '[]');
  }

  function savePosts(posts) {
    localStorage.setItem('posts', JSON.stringify(posts));
  }

  function renderPosts(posts) {
    if (!postsEl) return;
    postsEl.innerHTML = '';
    posts.forEach(p => {
      const div = document.createElement('div');
      div.className = 'post ' + (p.priceTag || '');
      div.draggable = true;
      div.dataset.id = p.id;
      div.innerHTML = `
        <div class="meta">${p.author || 'مجهول'} — ${p.timestamp}</div>
        <div class="content">${p.content}</div>
        <div class="tag">${p.priceTag === 'cheap' ? 'رخيص' : p.priceTag === 'expensive' ? 'غالي' : 'عادي'}</div>
      `;
      // سحب وإفلات للمقارنة
      div.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', p.id);
      });
      postsEl.appendChild(div);
    });
    // تحديث الرادار
    if (window.updatePriceRadar) window.updatePriceRadar(posts);
    // تطبيق الفلتر الحالي
    if (window.applyFilter) window.applyFilter(window.currentFilter || '');
  }

  function addPost() {
    const content = contentInput.value.trim();
    if (!content) return;
    const author = authorInput.value.trim() || 'مجهول';
    const priceTag = window.detectPrice ? window.detectPrice(content) : '';
    const post = {
      id: Date.now().toString(),
      author,
      content,
      priceTag,
      timestamp: new Date().toLocaleString()
    };
    const posts = getPosts();
    posts.unshift(post);
    savePosts(posts);
    renderPosts(posts);
    contentInput.value = '';
    if (window.sendMessage) {
      window.sendMessage({ type: 'post', data: post });
    }
  }

  publishBtn && publishBtn.addEventListener('click', addPost);

  // منطقة إفلات للمقارنة
  const radarCard = document.getElementById('priceRadar');
  if (radarCard) {
    radarCard.addEventListener('dragover', e => e.preventDefault());
    radarCard.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      const posts = getPosts();
      const post = posts.find(p => p.id === id);
      if (post) {
        let compareList = JSON.parse(localStorage.getItem('compareData') || '[]');
        if (!compareList.some(p => p.id === id)) {
          compareList.push(post);
          localStorage.setItem('compareData', JSON.stringify(compareList));
          if (window.showCompare) window.showCompare(compareList);
        }
      }
    });
  }

  compareBtn && compareBtn.addEventListener('click', () => {
    const compareList = JSON.parse(localStorage.getItem('compareData') || '[]');
    if (window.showCompare) window.showCompare(compareList);
  });

  // تحميل المنشورات عند البدء
  renderPosts(getPosts());
})();