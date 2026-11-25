(function() {
    'use strict';

    class PriceExtractor {
        extractPrices(posts) {
            return posts.map(post => ({
                ...post,
                price: this.parsePrice(post.content)
            }));
        }

        parsePrice(content) {
            const priceMatch = content.match(/\b\d+\.?\d*\s*(?:جنيه|ج|دولار|د|ريال|ر|سنت|س)\b/i);
            return priceMatch ? parseFloat(priceMatch[0]) : null;
        }
    }

    window.plugins = window.plugins || {};
    window.plugins.PriceExtractor = PriceExtractor;
})();