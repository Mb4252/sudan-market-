(function(){
  const wsUrl=window.APP_CONFIG&&window.APP_CONFIG.wsUrl; if(!wsUrl) return;
  const ws=new WebSocket(wsUrl);
  ws.onopen=()=>{computeAndSend();};
  function computeAndSend(){
    if(!window.postStorage) return;
    window.postStorage.getAll().then(posts=>{
      const count=posts.length;
      const avg=posts.reduce((s,p)=>s+(p.price||0),0)/count||0;
      const categories={cheap:0,expensive:0};
      posts.forEach(p=>{if(p.priceTag)categories[p.priceTag]++;});
      const stats={count,avg,categories};
      ws.send(JSON.stringify({type:'STATS',data:stats}));
    });
  }
})();