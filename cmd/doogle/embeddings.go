package main

import (
	"fmt"
	"os"
	"os/exec"
)

const embeddingServerScript = `#!/usr/bin/env python3
"""Doogle Neural Embedding Server — all-MiniLM-L6-v2 (384-dim)"""
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
app = Flask(__name__)

@app.post("/embed")
def embed():
    texts = request.get_json().get("texts", [])
    if not texts:
        return jsonify({"embeddings": []})
    return jsonify({"embeddings": model.encode(texts, normalize_embeddings=True).tolist()})

@app.get("/health")
def health():
    return jsonify({"status": "ok", "model": "all-MiniLM-L6-v2", "dim": 384})

if __name__ == "__main__":
    print("Doogle embedding server: http://localhost:11411")
    print("Model: all-MiniLM-L6-v2 (384-dim)")
    print("Use with: doogle --embedding-url http://localhost:11411/embed")
    app.run(host="0.0.0.0", port=11411)
`

func runEmbeddingsServer() {
	// Check Python is available
	python, err := exec.LookPath("python3")
	if err != nil {
		fmt.Fprintln(os.Stderr, "error: python3 not found — install Python 3.8+ first")
		os.Exit(1)
	}

	// Check deps
	check := exec.Command(python, "-c", "import sentence_transformers, flask")
	if err := check.Run(); err != nil {
		fmt.Println("Installing dependencies (sentence-transformers + flask)...")
		install := exec.Command("pip3", "install", "sentence-transformers", "flask")
		install.Stdout = os.Stdout
		install.Stderr = os.Stderr
		if err := install.Run(); err != nil {
			fmt.Fprintf(os.Stderr, "error: failed to install dependencies: %v\n", err)
			os.Exit(1)
		}
	}

	// Write script to temp file and run
	tmpFile, err := os.CreateTemp("", "doogle-embeddings-*.py")
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer os.Remove(tmpFile.Name())

	tmpFile.WriteString(embeddingServerScript)
	tmpFile.Close()

	fmt.Println("")
	fmt.Println("  Starting neural embedding server...")
	fmt.Println("  Model: all-MiniLM-L6-v2 (384-dim)")
	fmt.Println("  URL:   http://localhost:11411/embed")
	fmt.Println("")
	fmt.Println("  Then run Doogle with:")
	fmt.Println("    doogle --embedding-url http://localhost:11411/embed")
	fmt.Println("")

	cmd := exec.Command(python, tmpFile.Name())
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "embedding server exited: %v\n", err)
		os.Exit(1)
	}
}
