import json
from datetime import datetime

def validate_post(post):
    if not all(key in post for key in ['author', 'content', 'price', 'city', 'timestamp']):
        raise ValueError('بيانات المنشور غير كاملة')
    if not isinstance(post['price'], (int, float)) or post['price'] <= 0:
        raise ValueError('السعر يجب أن يكون رقم موجب')
    try:
        datetime.fromisoformat(post['timestamp'])
    except ValueError:
        raise ValueError('تاريخ غير صالح')

def process_posts(posts):
    return [
        {
            **post,
            'price': float(post['price']),
            'timestamp': datetime.fromisoformat(post['timestamp']).isoformat()
        }
        for post in posts
    ]

if __name__ == '__main__':
    # مثال على استخدام الدوال
    sample_post = {
        'author': 'مستخدم',
        'content': 'منتج جديد',
        'price': 100,
        'city': 'الخرطوم',
        'timestamp': datetime.now().isoformat()
    }
    try:
        validate_post(sample_post)
        processed_posts = process_posts([sample_post])
        print(json.dumps(processed_posts, indent=2, ensure_ascii=False))
    except ValueError as e:
        print(f'خطأ: {e}')