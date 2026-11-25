import json
from datetime import datetime

class Feature21Worker:
    def __init__(self):
        self.posts = []

    def add_post(self, post):
        try:
            # التحقق من البيانات
            if not all(key in post for key in ['author', 'content', 'price', 'city', 'timestamp']):
                raise ValueError('بيانات المنشور غير كاملة')
            if not isinstance(post['price'], (int, float)) or post['price'] <= 0:
                raise ValueError('السعر يجب أن يكون رقم موجب')
            try:
                datetime.fromisoformat(post['timestamp'])
            except ValueError:
                raise ValueError('تاريخ غير صالح')

            self.posts.append(post)
            return True
        except Exception as e:
            print(f'خطأ في إضافة المنشور: {str(e)}')
            return False

    def get_posts(self):
        return self.posts

    def process_posts(self):
        # معالجة البيانات هنا
        return [{**post, 'processed': True} for post in self.posts]