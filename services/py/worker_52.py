import json
from datetime import datetime

def validate_post(post):
    if not all(key in post for key in ['author', 'content', 'price', 'city', 'timestamp']):
        raise ValueError('المنشور غير صالح: الحقول المطلوبة مفقودة')
    if not isinstance(post['price'], (int, float)) or post['price'] <= 0:
        raise ValueError('السعر غير صالح')
    try:
        datetime.fromisoformat(post['timestamp'])
    except ValueError:
        raise ValueError('تاريخ غير صالح')

    return True

def process_post(post):
    try:
        validate_post(post)
        # معالجة المنشور
        return json.dumps({'status': 'success', 'post': post})
    except ValueError as e:
        return json.dumps({'status': 'error', 'message': str(e)})