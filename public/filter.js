(function(){
  const btns = document.querySelectorAll('.filter-btn');
  if (!btns.length) return;
  window.currentFilter = '';

  function applyFilter(filter) {
    const posts = document.querySelectorAll('#posts .post');
    posts.forEach(post => {
      if (!filter) {
        post.style.display = 'block';
      } else {
        post.style.display = post.classList.contains(filter) ? 'block' : 'none';
      }
    });
  }

  function setFilter(filter) {
    window.currentFilter = filter;
    btns.forEach(b => b.classList.toggle('active', b.getAttribute('data-filter') === filter));
    applyFilter(filter);
    // تحديث الـ URL بدون إعادة تحميل
    const url = new URL(window.location);
    if (filter) {
      url.searchParams.set('filter', filter);
    } else {
      url.searchParams.delete('filter');
    }
    window.history.replaceState({}, '', url);
  }

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.getAttribute('data-filter') || '');
    });
  });

  // تطبيق الفلتر من الـ URL عند التحميل
  const params = new URLSearchParams(window.location.search);
  const initialFilter = params.get('filter');
  if (initialFilter) {
    setFilter(initialFilter);
  } else {
    btns[0] && btns[0].classList.add('active');
  }

  window.applyFilter = applyFilter;
})();