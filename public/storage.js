// LocalStorage based persistence
const STORAGE_KEY='posts:v1';
function loadPosts(){
  const data=localStorage.getItem(STORAGE_KEY);
  return data?JSON.parse(data):[];
}
function savePosts(posts){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(posts));
}
function exportJSON(){
  const data=localStorage.getItem(STORAGE_KEY);
  if(!data) return '';
  const blob=new Blob([data],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='posts_backup.json';
  a.click();
  URL.revokeObjectURL(url);
}
function importJSON(file){
  const reader=new FileReader();
  reader.onload=e=>{
    try{const posts=JSON.parse(e.target.result);savePosts(posts);}catch(err){console.error('Import failed',err);} };
  reader.readAsText(file);
}
// API compatible with old IndexedDB functions
function addPost(post){
  const posts=loadPosts();
  post.id=Date.now();
  posts.push(post);
  savePosts(posts);
  return Promise.resolve(post.id);
}
function getAllPosts(){
  return Promise.resolve(loadPosts());
}
window.addPost=addPost;window.getAllPosts=getAllPosts;window.exportJSON=exportJSON;window.importJSON=importJSON;