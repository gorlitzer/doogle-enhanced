#!/usr/bin/env python3
"""
Doogle Neural Embedding Server

A minimal HTTP server that provides sentence embeddings using all-MiniLM-L6-v2.
Doogle calls this via --embedding-url to enable neural semantic search.

Install:
    pip install sentence-transformers flask

Run:
    python scripts/embedding-server.py

Then start Doogle with:
    ./bin/doogle --embedding-url http://localhost:11411/embed
"""

from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
app = Flask(__name__)


@app.post("/embed")
def embed():
    data = request.get_json()
    texts = data.get("texts", [])
    if not texts:
        return jsonify({"embeddings": []})
    vectors = model.encode(texts, normalize_embeddings=True).tolist()
    return jsonify({"embeddings": vectors})


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": "all-MiniLM-L6-v2", "dim": 384})


if __name__ == "__main__":
    print("Doogle embedding server starting on http://localhost:11411")
    print("Model: all-MiniLM-L6-v2 (384-dim)")
    app.run(host="0.0.0.0", port=11411)
