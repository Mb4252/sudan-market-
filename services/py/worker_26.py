import json
import requests

def fetch_feature_26_data():
    try:
        response = requests.get('https://sudan-market-2.onrender.com/feature-26-data')
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching feature 26 data: {e}")
        return {'error': str(e)}

def process_feature_26_data(data):
    # منطق المعالجة
    return {'processed': True, 'data': data}

if __name__ == '__main__':
    data = fetch_feature_26_data()
    processed_data = process_feature_26_data(data)
    print(json.dumps(processed_data, ensure_ascii=False))