import json
from datetime import datetime

class Feature45Worker:
    def __init__(self):
        self.posts = []

    def add_post(self, post_data):
        try:
            post = {
                'id': len(self.posts) + 1,
                'author': post_data['author'],
                'content': post_data['content'],
                'price': float(post_data['price']),
                'city': post_data['city'],
                'timestamp': datetime.now().isoformat(),
                'status': 'جديد'
            }
            self.posts.append(post)
            return post
        except Exception as e:
            print(f"[Feature-45-Worker] Error adding post: {str(e)}")
            return None

    def update_post_status(self, post_id, new_status):
        for post in self.posts:
            if post['id'] == post_id:
                post['status'] = new_status
                return post
        return None

    def get_posts(self):
        return self.posts