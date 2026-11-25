import json
from datetime import datetime

def validate_post(post):
    if not isinstance(post, dict):
        raise ValueError('Invalid post object')

    if 'author' not in post or not isinstance(post['author'], str):
        raise ValueError('Invalid author')

    if 'content' not in post or not isinstance(post['content'], str):
        raise ValueError('Invalid content')

    if 'price' not in post or not isinstance(post['price'], (int, float)) or post['price'] <= 0:
        raise ValueError('Invalid price')

    if 'city' not in post or not isinstance(post['city'], str):
        raise ValueError('Invalid city')

    if 'timestamp' not in post:
        raise ValueError('Invalid timestamp')

    try:
        datetime.fromisoformat(post['timestamp'])
    except ValueError:
        raise ValueError('Invalid timestamp format')

    return True