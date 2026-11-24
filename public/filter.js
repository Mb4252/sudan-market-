(function(){
  const btns = document.querySelectorAll('.filter-btn');
  if (!btns.length) return;
  btns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const filter = btn.getAttribute('data-filter')||'';
      // update active UI
      btns.forEach(b=>b.classList.toggle('active',b===btn));
      if (typeof window.setPostFilter==='function'){
        window.setPostFilter(filter);
      }
    });
  });
})();