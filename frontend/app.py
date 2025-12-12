import os
from flask import Flask, render_template, redirect, url_for

app = Flask(__name__)
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.jinja_env.auto_reload = True
BACKEND_URL = os.environ.get("BACKEND_URL")

@app.route("/")
def base():
    return redirect(url_for("home"))

@app.route("/old")
def legacy_dashboard():
    return render_template("index.html", backend_url=BACKEND_URL)

@app.route("/home")
def home():
    return render_template("home.html")

@app.route("/portfolio")
def portfolio():
    return render_template("portfolio.html")

@app.route("/metrics")
def metrics():
    return render_template("metrics.html")

@app.route("/search")
def search():
    return render_template("search.html")

@app.route("/stock/<symbol>")
def stock(symbol):
    return render_template("stockpage.html", symbol=symbol.upper(), backend_url=BACKEND_URL)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8800)
