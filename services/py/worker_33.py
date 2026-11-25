import json
from datetime import datetime

async def process_feature_33_data(posts):
    """معالجة بيانات الميزة #33."""
    try:
        processed_data = [
            {
                'author': post['author'],
                'price': post['price'],
                'timestamp': post['timestamp']
            }
            for post in posts
        ]
        return json.dumps(processed_data)
    except Exception as e:
        print(f"خطأ في معالجة بيانات الميزة #33: {e}")
        raise