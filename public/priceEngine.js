(function(){
  const keywords = {
    cheap: ['رخيص', 'خصم', 'تخفيض', 'عرض', 'سعر منخفض', 'صفقة'],
    expensive: ['غالي', 'سعر مرتفع', 'مكلف', 'أسعار مرتفعة', 'فاخر', 'مميز']
  };

  window.tagPost = function(post) {
    const text = (post.content || '').toLowerCase();
    if (keywords.cheap.some(k => text.includes(k))) return 'cheap';
    if (keywords.expensive.some(k => text.includes(k))) return 'expensive';
    return 'normal';
  };
})();