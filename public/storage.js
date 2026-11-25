(function(){
  const key = window.APP_CONFIG?.storageKey || 'app_posts';
  const listeners = [];

  function load(){
    try{ const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : []; }
    catch(e){ return []; }
  }

  function save(posts){
    try{ localStorage.setItem(key, JSON.stringify(posts)); dispatch('posts:updated', posts); }
    catch(e){}
  }

  function add(post){
    const posts = load();
    posts.push(post);
    save(posts);
  }

  function clear(){
    localStorage.removeItem(key);
    dispatch('posts:cleared', []);
  }

  function on(event,cb){ listeners.push({event,cb}); }

  function dispatch(event,data){
    const e = new CustomEvent(event,{detail:data});
    window.dispatchEvent(e);
    listeners.filter(l=>l.event===event).forEach(l=>l.cb(data));
  }

  window.postStorage = { load, save, add, clear, on };

  window.addEventListener('DOMContentLoaded',()=>{ dispatch('posts:ready', load()); });
})();
