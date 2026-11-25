import json
from datetime import datetime

class Feature35Worker:
    def __init__(self):
        self.posts = []

    def add_post(self, post):
        post['timestamp'] = datetime.now().isoformat()
        self.posts.append(post)
        return post

    def get_posts(self):
        return self.posts

    def compare_prices(self):
        # منطق المقارنة
        pass

worker_35 = Feature35Worker()