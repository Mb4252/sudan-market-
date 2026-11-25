import json
from datetime import datetime

# Worker for Feature 92 - Wired Expansion
class Feature92Worker:
    def __init__(self):
        self.posts = []

    def process_post(self, post_data):
        """Process a new post for Feature 92"""
        try:
            post = {
                'author': post_data['author'],
                'content': post_data['content'],
                'price': float(post_data['price']),
                'city': post_data['city'],
                'timestamp': datetime.fromisoformat(post_data['timestamp'])
            }
            self.posts.append(post)
            return {'status': 'success', 'post': post}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    def get_posts(self):
        """Get all posts for Feature 92"""
        return self.posts

    def compare_prices(self):
        """Compare prices across different cities"""
        if not self.posts:
            return {'status': 'error', 'message': 'No posts available'}

        city_prices = {}
        for post in self.posts:
            if post['city'] not in city_prices:
                city_prices[post['city']] = []
            city_prices[post['city']].append(post['price'])

        comparison = {
            city: {
                'average': sum(prices)/len(prices),
                'min': min(prices),
                'max': max(prices)
            } for city, prices in city_prices.items()
        }

        return {'status': 'success', 'comparison': comparison}

# Create and expose the worker
worker_92 = Feature92Worker()