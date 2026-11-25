(function() {
    'use strict';

    class Feature20UI {
        constructor() {
            this.statusElement = document.getElementById('status');
            this.postsContainer = document.getElementById('posts-container');
        }

        updateStatus(status) {
            if (this.statusElement) {
                this.statusElement.textContent = status;
            }
        }

        renderPosts(posts) {
            if (!this.postsContainer) return;

            this.postsContainer.innerHTML = '';
            posts.forEach(post => {
                const postElement = document.createElement('div');
                postElement.className = 'post';
                postElement.innerHTML = `
                    <h3>${post.author}</h3>
                    <p>${post.content}</p>
                    <p>السعر: ${post.price}</p>
                    <p>المدينة: ${post.city}</p>
                    <p>التاريخ: ${new Date(post.timestamp).toLocaleString()}</p>
                `;
                this.postsContainer.appendChild(postElement);
            });
        }
    }

    window.feature20UI = new Feature20UI();
})();