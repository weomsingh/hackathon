import json
from flask import Flask, jsonify, render_template, request, Response
from fraud_detector import FraudDetector

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

LATEST_REPORT = None


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    global LATEST_REPORT

    if "csv_file" not in request.files:
        return jsonify({"error": "Missing file field 'csv_file'"}), 400

    file = request.files["csv_file"]
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400
    if not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Please upload a .csv file"}), 400

    detector = FraudDetector()
    try:
        file.stream.seek(0)
        result = detector.analyze(file)
        LATEST_REPORT = result["analysis"]
        return jsonify(result)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        return jsonify({"error": f"Analysis failed: {str(exc)}"}), 500


@app.route("/download-json", methods=["GET"])
def download_json():
    if LATEST_REPORT is None:
        return jsonify({"error": "No analysis available yet. Run /analyze first."}), 404

    payload = json.dumps(LATEST_REPORT, indent=2)
    return Response(
        payload,
        mimetype="application/json",
        headers={
            "Content-Disposition": "attachment; filename=forensics_report.json",
        },
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
