import json
import websockets
import asyncio

async def analyze_market(data):
    # منطق التحليل
    results = {
        'average_price': sum(item['price'] for item in data) / len(data),
        'total_items': len(data),
        'price_variance': max(item['price'] for item in data) - min(item['price'] for item in data)
    }
    return results

async def market_worker(websocket, path):
    async for message in websocket:
        data = json.loads(message)
        if data['type'] == 'analyzeMarket':
            results = await analyze_market(data['data'])
            await websocket.send(json.dumps({
                'type': 'marketAnalysis',
                'results': results
            }))

start_server = websockets.serve(market_worker, 'localhost', 8765)

asyncio.get_event_loop().run_until_complete(start_server)
asyncio.get_event_loop().run_forever()