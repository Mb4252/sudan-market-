function openDB(){
  return new Promise((r,e)=>{
    const req=indexedDB.open('postsDB',1);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains('posts')){
        db.createObjectStore('posts',{keyPath:'id',autoIncrement:true});
      }
    };
    req.onsuccess=e=>r(e.target.result);
    req.onerror=e=>e(e.target.error);
  });
}