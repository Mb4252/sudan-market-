(function(){
  const THEME_KEY='user_browser_theme';
  const body=document.body;
  function applyTheme(theme){
    body.dataset.theme=theme;
    localStorage.setItem(THEME_KEY,theme);
  }
  function toggleTheme(){
    const current=body.dataset.theme||'light';
    const next=current==='light'?'dark':'light';
    applyTheme(next);
  }
  // Create toggle button
  const btn=document.createElement('button');
  btn.id='themeToggle';
  btn.textContent='تبديل الوضع';
  btn.style.position='fixed';
  btn.style.top='10px';
  btn.style.right='10px';
  btn.style.zIndex='1000';
  btn.onclick=toggleTheme;
  document.body.appendChild(btn);
  // Init
  const stored=localStorage.getItem(THEME_KEY);
  applyTheme(stored||'light');
  // Sync across tabs
  window.addEventListener('storage',e=>{if(e.key===THEME_KEY){applyTheme(e.newValue||'light');}});
  // Sync posts across tabs
  window.addEventListener('storage',e=>{if(e.key==='user_browser_posts_v1'){if(typeof window.loadPosts==='function'){window.loadPosts();}}});
})();