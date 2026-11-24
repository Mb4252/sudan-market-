(function(){
  const btns = document.querySelectorAll('.filter-btn');
  if (!btns.length) return;
  const defaultBtn = Array.from(btns).find(b=>b.getAttribute('data-filter')==='')||btns[0];
  if (defaultBtn) defaultBtn.classList.add('active');
  btns.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const filter = btn.getAttribute('data-filter')||'';
      btns.forEach(b=>b.classList.toggle('active',b===btn));
      if (typeof window.setPostFilter==='function'){
        window.setPostFilter(filter);
      }
    });
  });
})();