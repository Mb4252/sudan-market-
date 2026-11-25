from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/api/analyze-city', methods=['GET'])
def analyze_city():
    city = request.args.get('city')
    # منطق التحليل هنا
    trends = {
        'city': city,
        'priceTrend': 'increase',
        'confidence': 0.85
    }
    return jsonify(trends)

if __name__ == '__main__':
    app.run(port=5000)