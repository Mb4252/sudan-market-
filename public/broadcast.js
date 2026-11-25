(function(){
  const channel = new BroadcastChannel('posts');
  channel.addEventListener('message', e => {
    try {
      if (e.data && e.data.type === 'NEW_POST') {
        window.postStorage && window.postStorage.addPost(e.data);
      }
    } catch (err) {
      console.warn('Broadcast handler error', err);
    }
  });

  function publishPost(post) {
    try {
      if (window.tagPost) {
        post.priceTag = window.tagPost(post);
      }
      if (window.postStorage) {
        window.postStorage.addPost(post);
      }
      channel.postMessage({ type: 'NEW_POST', ...post });
    } catch (err) {
      console.warn('Publish error', err);
    }
  }

  window.publishPost = publishPost;
})();