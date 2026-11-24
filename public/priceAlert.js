(function(){
  const postsEl=document.getElementById('posts');
  if(!postsEl) return;
  const observer=new MutationObserver(mutations=>{
    mutations.forEach(mutation=>{
      mutation.addedNodes.forEach(node=>{
        if(node.nodeType!==1) return;
        const isCheap=node.classList.contains('cheap');
        const isExpensive=node.classList.contains('expensive');
        if(!isCheap && !isExpensive) return;
        const tag=isCheap?'cheap':'expensive';
        if(window.currentFilter && tag!==window.currentFilter){
          const alertDiv=document.createElement('div');
          alertDiv.textContent=`تم إضافة منشور ${tag==='cheap'?'رخيص':'غالي'} بينما تم اختيار عرض ${window.currentFilter==='cheap'?'رخيص':'غالي'}`;
          alertDiv.style.position='fixed';
          alertDiv.style.bottom='20px';
          alertDiv.style.right='20px';
          alertDiv.style.background='#fffae6';
          alertDiv.style.border='1px solid #d0d7de';
          alertDiv.style.padding='8px 12px';
          alertDiv.style.borderRadius='6px';
          alertDiv.style.boxShadow='0 2px 6px rgba(0,0,0,0.2)';
          document.body.appendChild(alertDiv);
          setTimeout(()=>{alertDiv.remove();},4000);
        }
      });
    });
  });
  observer.observe(postsEl,{childList:true});
})();