import json
from datetime import datetime

def process_post(post):
    """معالجة منشور واحد"""
    if not isinstance(post, dict):
        raise ValueError("المنشور يجب أن يكون كائن JSON")

    # التحقق من صحة البيانات
    required_fields = ['author', 'content', 'price', 'city', 'timestamp']
    for field in required_fields:
        if field not in post:
            raise ValueError(f"حقل {field} مفقود")

    # التحقق من صحة السعر
    if not isinstance(post['price'], (int, float)) or post['price'] <= 0:
        raise ValueError("السعر يجب أن يكون رقم موجب")

    # التحقق من صحة التاريخ
    try:
        datetime.fromisoformat(post['timestamp'])
    except ValueError:
        raise ValueError("التاريخ غير صالح")

    return post

def process_posts(posts):
    """معالجة قائمة المنشورات"""
    if not isinstance(posts, list):
        raise ValueError("المنشورات يجب أن تكون قائمة")

    processed_posts = []
    for post in posts:
        try:
            processed_posts.append(process_post(post))
        except ValueError as e:
            print(f"خطأ في معالجة المنشور: {e}")

    return processed_posts

if __name__ == "__main__":
    # قراءة المنشورات من الإدخال
    posts = json.loads(input())
    
    # معالجة المنشورات
    processed_posts = process_posts(posts)
    
    # طباعة المنشورات المعالجة
    print(json.dumps(processed_posts))