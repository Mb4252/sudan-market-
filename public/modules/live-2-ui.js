(function() {
    'use strict';

    function updateLiveUI(posts) {
        const liveFeed = document.getElementById('liveFeed');
        if (!liveFeed) return;

        liveFeed.innerHTML = '';
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
            liveFeed.appendChild(postElement);
        });
    }

    function updateCompareUI(compareData) {
        const compareResults = document.getElementById('compareResults');
        if (!compareResults) return;

        compareResults.innerHTML = '';
        compareData.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'compare-item';
            itemElement.innerHTML = `
                <h3>${item.product}</h3>
                <p>أرخص سعر: ${item.lowestPrice}</p>
                <p>أعلى سعر: ${item.highestPrice}</p>
                <p>متوسط السعر: ${item.averagePrice}</p>
            `;
            compareResults.appendChild(itemElement);
        });
    }

    window.liveUI = {
        updateLiveUI,
        updateCompareUI
    };
})();