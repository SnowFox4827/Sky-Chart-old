import json
import os

from flask import Flask, send_from_directory

app = Flask(__name__)

PORT = int(os.environ.get("PORT", "5000"))

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")


@app.route("/")
def index():
    return send_from_directory("templates", "starchart.html")


@app.route("/data/<path:filename>")
def data_files(filename):
    return send_from_directory(DATA_DIR, filename)


@app.route("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
