// priceEngine.js – compute area index
function median(values){
  if(values.length===0) return 0;
  const sorted=values.slice().sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]: (sorted[mid-1]+sorted[mid])/2;
}
function extractPrice(text){
  const regex=/([\$€£]?\d[\d,.]*)/g;
  const matches=text.match(regex);
  if(!matches) return null;
  const nums=matches.map(m=>parseFloat(m.replace(/[^\d.,]/g,'').replace(',','.')));
  return nums.length?Math.max(...nums):null;
}
function getAreaIndex(area){
  const posts=JSON.parse(localStorage.getItem('posts:v1')||'[]');
  const prices=posts.filter(p=>p.area===area).map(p=>extractPrice(p.content)).filter(v=>v!==null);
  return median(prices);
}
window.getAreaIndex=getAreaIndex;