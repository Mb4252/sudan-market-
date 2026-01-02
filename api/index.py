from flask import Flask, jsonify

app = Flask(__name__)

@app.route('/api/info')
def sdm_info():
    return jsonify({
        "status": "active",
        "project": "SDM Market",
        "description": "Solana Hidden Gem - High Value & Security"
    })

def handler(event, context):
    return app(event, context)
