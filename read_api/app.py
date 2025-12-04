from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/read", methods=["GET"])
def read():
    return jsonify({"status": "read", "data": "success"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4001)