import json
import numpy as np
from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/api/trends', methods=['GET'])
def get_trends():
    try:
        # بيانات وهمية لتحليل الاتجاهات
        prices = [100, 105, 110, 108, 112, 115, 120, 125, 130, 135]
        x = np.arange(len(prices))
        y = np.array(prices)

        # حساب الانحدار الخطي
        A = np.vstack([x, np.ones(len(x))]).T
        m, c = np.linalg.lstsq(A, y, rcond=None)[0]

        # حساب التباين
        variance = np.var(y)

        return jsonify({
            'trend': m,
            'sampleSize': len(prices),
            'variance': variance
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)