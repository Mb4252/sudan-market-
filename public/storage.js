const storageKey='posts_v2';
async function loadPosts(){const data=localStorage.getItem(storageKey);return data?JSON.parse(data):[];}
async function savePosts(posts){localStorage.setItem(storageKey,JSON.stringify(posts));}
async function addPost(post){const posts=await loadPosts();posts.push(post);await savePosts(posts);return posts.length-1;}
async function getAllPosts(){return await loadPosts();}