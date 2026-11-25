(function(){
  function tagPost(post) {
    const text = (post.content || '').toLowerCase();
    if (text.includes('خصم') || text.includes('رخيص') || text.includes('تخفيض') || text.includes('عرض')) return 'cheap';
    if (text.includes('محدود') || text.includes('غالي') || text.includes('فاخر') || text.includes('حصري')) return 'expensive';
    return 'normal';
  }
  window.tagPost = tagPost;
})();