(function(){
const STORAGE_KEY='user_browser_posts_v1';
const WS_URL=location.hostname==='localhost'?`ws://${location.host}`:`wss://${location.hostname}`;

const statusEl=document.getElementById('status');
const serverTimeEl=document.getElementById('serverTime');
const authorEl=document.getElementById('author');
const contentEl=document.getElementById('content');
const publishBtn=document.getElementById('publishBtn');
const postsEl=document.getElementById('posts');

let currentFilter='';// '' | 'cheap' | 'expensive'
window.currentFilter=currentFilter;

function getLocalPosts(){
  try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[];}
  catch{return[];}
}

function saveLocalPost(post){
  if(!post||!post.content) return;
  if(!post.priceTag){
    post.priceTag=typeof window.detectPrice==='function'?window.detectPrice(post.content):'';
  }
  const posts=getLocalPosts();
  if(post.id&&posts.some(p=>p.id===post.id)) return;
  posts.unshift(post);
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(posts.slice(0,200)));
  }catch(e){console.warn('تعذر حفظ المنشور في localStorage:',e);}
  renderPosts();
}

function renderPosts(){
  const posts=getLocalPosts();
  if(!postsEl) return;
  const filtered=currentFilter?posts.filter(p=>p.priceTag===currentFilter):posts;
  postsEl.innerHTML=filtered.map(p=>`\n    <div class="post ${p.priceTag?p.priceTag:''}" data-id="${p.id}">\n      <div class="meta">${escapeHtml(p.author||'مستخدم')} — ${escapeHtml(p.timestamp||'')}\n      </div>\n      <div>${escapeHtml(p.content||'')}</div>\n    </div>\n  `).join('')||'<p>لا توجد منشورات محفوظة في المتصفح بعد.</p>';
  attachPostClickHandlers();
}

function setConnectedStatus(isConnected){
  if(!statusEl) return;
  const base=isConnected?'متصل بـ Render':'جاري الاتصال بـ Render';
  statusEl.textContent=base;
}

function updateOnlineCount(){
  const isOpen=socket && socket.readyState===WebSocket.OPEN;
  fetch('/stats')
    .then(r=>{if(!r.ok) throw new Error(`HTTP ${r.status}`);return r.json();})
    .then(data=>{const count=Number(data.connectedClients??data.clients??0);const base=isOpen?'متصل بـ Render':'جاري الاتصال بـ Render';if(statusEl){statusEl.textContent=`${base} — المتصلون الآن: ${count}`;}})
    .catch(()=>{if(statusEl && !isOpen){statusEl.textContent='انقطع الاتصال، جاري إعادة المحاولة...';}});
}

let socket;
let reconnectTimer;

function connect(){
  clearTimeout(reconnectTimer);
  socket=new WebSocket(WS_URL);

  socket.onopen=()=>{
    setConnectedStatus(true);
    updateOnlineCount();
  };

  socket.onclose=()=>{
    setConnectedStatus(false);
    if(statusEl){statusEl.textContent='انقطع الاتصال، جاري إعادة المحاولة...';}
    reconnectTimer=setTimeout(connect,2500);
  };

  socket.onerror=()=>{setConnectedStatus(false);if(statusEl){statusEl.textContent='تعذر الاتصال بالخادم، جاري إعادة المحاولة...';}};

  socket.onmessage=event=>{
    try{
      const data=JSON.parse(event.data);
      if(data.type==='post'){
        saveLocalPost(data);
        updateOnlineCount();
      }else if(data.type==='system' && data.timestamp && serverTimeEl){
        const time=new Date(data.timestamp).toLocaleTimeString();
        serverTimeEl.textContent=`وقت الخادم: ${time}`;
      }
    }catch(e){console.warn('رسالة WebSocket غير صالحة:',e);}
  };
}

setInterval(updateOnlineCount,10000);

if(publishBtn && contentEl){
  publishBtn.addEventListener('click',()=>{
    if(publishBtn.disabled) return;
    const text=contentEl.value.trim();
    if(!text) return;

    const msg={
      type:'post',
      id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      author:(authorEl?authorEl.value.trim():'' )||'مستخدم',
      content:text,
      timestamp:new Date().toISOString()
    };

    msg.priceTag=typeof window.detectPrice==='function'?window.detectPrice(msg.content):'';

    saveLocalPost(msg);

    if(socket && socket.readyState===WebSocket.OPEN){socket.send(JSON.stringify(msg));}

    contentEl.value='';
    publishBtn.disabled=true;
    setTimeout(()=>{publishBtn.disabled=false;},1000);
  });
}

window.setPostFilter=function(filter){
  currentFilter=filter;
  window.currentFilter=filter;
  renderPosts();
};

function showCompareModal(selectedPosts){
  if(selectedPosts.length!==2) return;
  const [a,b]=selectedPosts;
  const message=`مقارنة بين المنشورين:\n\n--- المنشور الأول ---\nالكاتب: ${a.author}\nالسعر: ${a.priceTag||'غير محدد'}\nالمحتوى: ${a.content}\n\n--- المنشور الثاني ---\nالكاتب: ${b.author}\nالسعر: ${b.priceTag||'غير محدد'}\nالمحتوى: ${b.content}`;
  alert(message);
}

function attachPostClickHandlers(){
  if(!postsEl) return;
  const postElements=postsEl.querySelectorAll('.post');
  postElements.forEach(el=>{
    el.addEventListener('click',()=>{
      const id=el.getAttribute('data-id');
      if(!id) return;
      if(el.classList.contains('selected')){
        el.classList.remove('selected');
      }else{
        const alreadySelected=postsEl.querySelectorAll('.post.selected');
        if(alreadySelected.length>=2){
          // remove the oldest selected (first in the NodeList)
          alreadySelected[0].classList.remove('selected');
        }
        el.classList.add('selected');
      }
      const selectedPosts=Array.from(postsEl.querySelectorAll('.post.selected')).map(sel=>{
        const pid=sel.getAttribute('data-id');
        const posts=getLocalPosts();
        return posts.find(p=>p.id===pid);
      }).filter(Boolean);
      if(selectedPosts.length===2){
        showCompareModal(selectedPosts);
        // clear selection after showing the modal
        selectedPosts.forEach(p=>{
          const elSel=postsEl.querySelector(`.post[data-id="${p.id}"]`);
          if(elSel) elSel.classList.remove('selected');
        });
      }
    });
  });
}

// initiate WebSocket connection
connect();

})();