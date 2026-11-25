import json

def process_data(data):
    """معالجة البيانات الواردة من العميل"""
    try:
        processed = {
            'status': 'success',
            'price': data.get('price', 'غير متوفر')
        }
        return json.dumps(processed)
    except Exception as e:
        return json.dumps({'status': 'error', 'message': str(e)})

if __name__ == '__main__':
    import sys
    input_data = json.loads(sys.stdin.read())
    print(process_data(input_data))