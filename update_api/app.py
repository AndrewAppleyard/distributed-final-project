from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route("/update", methods=["PUT"])
def update():
    data = request.json
    name = data.get("name")
    return jsonify({"status": "updated", "new_name": name})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4002)