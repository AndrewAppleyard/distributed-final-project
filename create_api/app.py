from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/create", methods=["POST"])
def create():
    data = request.json
    name = data.get("name")
    return jsonify({"status": "created", "name_received": name})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000)