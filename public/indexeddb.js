function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('postsDB', 1);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = e => reject(e.target.error);
  });
}

function addPost(post) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('posts', 'readwrite');
    const store = tx.objectStore('posts');
    const request = store.add(post);
    request.onsuccess = () => resolve(request.result);
    request.onerror = e => reject(e.target.error);
  }));
}

function getAllPosts() {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('posts', 'readonly');
    const store = tx.objectStore('posts');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = e => reject(e.target.error);
  }));
}