(function(){
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('sw.js').then(r=>{console.log('SW registered',r);}).catch(e=>{console.warn('SW registration failed',e);});
    });
  }
})();