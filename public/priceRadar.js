(function(){
  const radarEl = document.getElementById('radarContent');
  if (!radarEl) return;

  function updateRadar(posts) {
    if (!posts || posts.length === 0) {
      radarEl.innerHTML = '<p>لا توجد بيانات كافية بعد.</p>';
      return;
    }

    let cheapCount = 0;
    let expensiveCount = 0;
    let total = posts.length;

    posts.forEach(p => {
      if (p.priceTag === 'cheap') cheapCount++;
      else if (p.priceTag === 'expensive') expensiveCount++;
    });

    const cheapPct = Math.round((cheapCount / total) * 100);
    const expensivePct = Math.round((expensiveCount / total) * 100);

    radarEl.innerHTML = `
      <div style="margin-bottom:10px">
        <strong>المنشورات الرخيصة:</strong> ${cheapCount} (${cheapPct}%)<br>
        <strong>المنشورات الغالية:</strong> ${expensiveCount} (${expensivePct}%)<br>
        <strong>المحايد:</strong> ${total - cheapCount - expensiveCount}
      </div>
      <div style="background:#f0f0f0;padding:5px;border-radius:4px">
        مؤشر السوق: ${cheapPct > expensivePct ? 'ميل نحو الرخص 📉' : expensivePct > cheapPct ? 'ميل نحو الغلاء 📈' : 'متوازن ⚖️'}
      </div>
    `;
  }

  window.updatePriceRadar = updateRadar;
})();