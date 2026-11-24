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
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(posts.slice(0,200)));}
  catch(e){console.warn('تعذر حفظ المنشور في localStorage:',e);}
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

renderPosts();
connect();

/* ---------- مقارنة سريعة بين منشورين ---------- */
function attachPostClickHandlers(){
  if(!postsEl) return;
  postsEl.querySelectorAll('.post').forEach(el=>el.classList.remove('selected'));
  let selectedIds=[];
  const clickListener=e=>{
    const postEl=e.target.closest('.post');
    if(!postEl) return;
    const id=postEl.getAttribute('data-id');
    if(selectedIds.includes(id)){
      selectedIds=selectedIds.filter(i=>i!==id);
      postEl.classList.remove('selected');
    }else{
      if(selectedIds.length<2){
        selectedIds.push(id);
        postEl.classList.add('selected');
      }
    }
    if(selectedIds.length===2){
      const posts=getLocalPosts().filter(p=>selectedIds.includes(p.id));
      showCompareModal(posts);
      selectedIds=[];
      postsEl.querySelectorAll('.post.selected').forEach(el=>el.classList.remove('selected'));
    }
  };
  postsEl.addEventListener('click',clickListener);
}

function showCompareModal(posts){
  const modal=document.createElement('div');
  modal.style.position='fixed';
  modal.style.top='0';
  modal.style.left='0';
  modal.style.width='100%';
  modal.style.height='100%';
  modal.style.background='rgba(0,0,0,0.5)';
  modal.style.display='flex';
  modal.style.alignItems='center';
  modal.style.justifyContent='center';
  modal.style.zIndex='1000';
  const box=document.createElement('div');
  box.style.background='#fff';
  box.style.padding='20px';
  box.style.borderRadius='8px';
  box.style.maxWidth='90%';
  box.style.maxHeight='80%';
  box.style.overflowY='auto';
  const closeBtn=document.createElement('button');
  closeBtn.textContent='إغلاق';
  closeBtn.style.marginBottom='12px';
  closeBtn.onclick=()=>{document.body.removeChild(modal);};
  const table=document.createElement('table');
  table.style.width='100%';
  table.style.borderCollapse='collapse';
  const header=document.createElement('tr');
  ['الكاتب','الوقت','المحتوى','السعر'].forEach(txt=>{
    const th=document.createElement('th');
    th.textContent=txt;
    th.style.borderBottom='1px solid #ddd';
    th.style.padding='8px';
    header.appendChild(th);
  });
  table.appendChild(header);
  posts.forEach(p=>{
    const tr=document.createElement('tr');
    [p.author||'مستخدم', new Date(p.timestamp).toLocaleString(), p.content, p.priceTag||''].forEach(val=>{
      const td=document.createElement('td');
      td.textContent=val;
      td.style.padding='8px';
      td.style.verticalAlign='top';
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  box.appendChild(closeBtn);
  box.appendChild(table);
  modal.appendChild(box);
  document.body.appendChild(modal);
}
})();