// storageIndexedDB.js
importScripts('lz-string.min.js');
const dbName='postsDB';
const storeName='posts';
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(dbName,1);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(storeName)){db.createObjectStore(storeName,{keyPath:'id',autoIncrement:true});}};req.onsuccess=e=>resolve(e.target.result);req.onerror=e=>reject(e.target.error);});}
function addPost(post){return openDB().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readwrite');const store=tx.objectStore(storeName);const compressed=LZString.compress(JSON.stringify(post));const request=store.add({data:compressed});request.onsuccess=()=>resolve(request.result);request.onerror=e=>reject(e.target.error);}));}
function getAllPosts(){return openDB().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction(storeName,'readonly');const store=tx.objectStore(storeName);const request=store.getAll();request.onsuccess=()=>resolve(request.result.map(r=>JSON.parse(LZString.decompress(r.data))));request.onerror=e=>reject(e.target.error);}));}
self.addEventListener('message',e=>{const {cmd,post}=e.data;if(cmd==='add'){addPost(post).then(id=>self.postMessage({cmd:'added',id}));}else if(cmd==='getAll'){getAllPosts().then(posts=>self.postMessage({cmd:'all',posts}));}});