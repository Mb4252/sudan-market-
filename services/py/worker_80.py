import json
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/analyze', methods=['POST'])
def analyze_trend():
    data = request.get_json()
    city = data.get('city')
    
    # محاكاة تحليل الاتجاه (يجب استبدال هذا بالتحليل الفعلي)
    trend = 'ارتفاع' if hash(city) % 2 == 0 else 'انخفاض'
    confidence = hash(city) % 100
    
    return jsonify({
        'city': city,
        'trend': trend,
        'confidence': confidence
    })

if __name__ == '__main__':
    app.run(debug=True)