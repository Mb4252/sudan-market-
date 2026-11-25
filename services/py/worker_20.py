import asyncio
import json
from aiohttp import web

async def handle_fetch_posts(request):
    try:
        with open('data/posts.json', 'r', encoding='utf-8') as f:
            posts = json.load(f)
        return web.json_response(posts)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)

async def handle_create_post(request):
    try:
        data = await request.json()
        with open('data/posts.json', 'r+', encoding='utf-8') as f:
            posts = json.load(f)
            posts.append(data)
            f.seek(0)
            json.dump(posts, f, ensure_ascii=False, indent=4)
        return web.json_response(data, status=201)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)

app = web.Application()
app.router.add_get('/posts', handle_fetch_posts)
app.router.add_post('/posts', handle_create_post)

if __name__ == '__main__':
    web.run_app(app, port=8080)