(function(){
  const workerPath='public/price-worker.js';
  let worker=null;
  function initWorker(){
    if(!worker){
      worker=new Worker(workerPath);
    }
  }
  // Expose a helper that returns the worker classification
  window.classifyPrice = function(content){
    return new Promise(resolve=>{
      initWorker();
      const handler=e=>{
        worker.removeEventListener('message',handler);
        resolve(e.data);
      };
      worker.addEventListener('message',handler);
      worker.postMessage({content});
    });
  };
})();