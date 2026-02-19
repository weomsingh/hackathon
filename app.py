
from flask import Flask, render_template, request, jsonify
from fraud_detector import FraudDetector
import os

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16MB limit

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    if 'csv_file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['csv_file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'File must be CSV'}), 400
        
    try:
        detector = FraudDetector()
        results = detector.analyze(file)
        return jsonify(results)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
