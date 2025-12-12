import os
from flask import Flask, render_template

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True
BACKEND_URL = os.environ.get("BACKEND_URL")

@app.route("/")
def home():
    return render_template("index.html", backend_url=BACKEND_URL)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8800)
