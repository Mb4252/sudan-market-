(function(){
  const DB_NAME='postsDB';const STORE='posts';let db;
  function openDB(){return new Promise((res,rej)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});};req.onsuccess=e=>{db=e.target.result;res(db);};req.onerror=e=>rej(e);});}
  function init(){return openDB().then(d=>{db=d;});}
  function addPost(post){return init().then(()=>{return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');const store=tx.objectStore(STORE);store.add(post);tx.oncomplete=res;tx.onerror=rej;});});}
  function getAll(){return init().then(()=>{return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const store=tx.objectStore(STORE);const req=store.getAll();req.onsuccess=e=>res(e.target.result);req.onerror=rej;});});}
  function getByFilter(filter){return getAll().then(posts=>{if(filter==='cheap')return posts.filter(p=>p.priceTag==='cheap');if(filter==='expensive')return posts.filter(p=>p.priceTag==='expensive');return posts;});}
  window.postStorage={addPost,getAll,getByFilter};
})();