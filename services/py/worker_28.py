import json
from datetime import datetime

def validate_post_data(post):
    if not isinstance(post, dict):
        raise ValueError("بيانات المنشور غير صالحة")

    if 'author' not in post or not isinstance(post['author'], str) or not post['author'].strip():
        raise ValueError("اسم المؤلف مطلوب")

    if 'content' not in post or not isinstance(post['content'], str) or not post['content'].strip():
        raise ValueError("محتوى المنشور مطلوب")

    if 'price' not in post or not isinstance(post['price'], (int, float)) or post['price'] <= 0:
        raise ValueError("السعر مطلوب ويجب أن يكون رقم موجب")

    if 'city' not in post or not isinstance(post['city'], str) or not post['city'].strip():
        raise ValueError("المدينة مطلوبة")

    if 'timestamp' not in post:
        raise ValueError("تاريخ المنشور مطلوب")

    try:
        datetime.fromisoformat(post['timestamp'])
    except ValueError:
        raise ValueError("تاريخ غير صالح")

    return True