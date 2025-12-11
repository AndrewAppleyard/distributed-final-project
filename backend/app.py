import os

import requests
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

API = os.environ.get("API_URL", "https://jsonplaceholder.typicode.com/todos/3")


@app.route("/data", methods=["GET"])
def data():
    payload = None
    try:
        res = requests.get(API, timeout=10)
        res.raise_for_status()
        try:
            payload = res.json()
        except ValueError:
            payload = res.text
    except Exception as exc:
        return "error"

    response = {"api": API}
    if payload is not None:
        response["payload"] = payload

    return jsonify(response)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4000)