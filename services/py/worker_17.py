import json
from datetime import datetime

def process_posts(posts):
    if not isinstance(posts, list):
        raise ValueError("Invalid posts data")

    processed_posts = []
    for post in posts:
        try:
            processed_post = {
                **post,
                "timestamp": datetime.fromisoformat(post["timestamp"]).isoformat()
            }
            processed_posts.append(processed_post)
        except Exception as e:
            print(f"Error processing post: {e}")

    return processed_posts

if __name__ == "__main__":
    # مثال على استخدام الدالة
    sample_posts = [
        {"author": "مستخدم", "content": "منتج جديد", "price": 100, "city": "الخرطوم", "timestamp": "2023-11-25T08:21:52.713Z"}
    ]
    print(json.dumps(process_posts(sample_posts), indent=2))