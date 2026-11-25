import json

def process_data(raw_data):
    if not raw_data:
        raise ValueError('No data provided for Feature 91')

    return {
        'title': raw_data.get('title', 'ميزة 91'),
        'description': raw_data.get('description', 'وصف ميزة 91')
    }

if __name__ == '__main__':
    import sys
    input_data = json.loads(sys.stdin.read())
    result = process_data(input_data)
    print(json.dumps(result))