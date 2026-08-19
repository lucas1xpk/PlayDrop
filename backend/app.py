from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from pathlib import Path

from services.cheapshark import CheapSharkService

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app)

cheapshark = CheapSharkService()


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "project": "PlayDrop", "version": "1.0.1"})


@app.get("/api/deals")
def deals():
    """Promoções de PC validadas para uso no Brasil nesta V1.

    Nesta primeira versão, apenas ofertas diretas da Steam são exibidas no feed
    ao vivo, porque a origem dos dados utilizada não informa de forma confiável
    a restrição regional de chaves de revendedores externos.
    """
    limit = request.args.get("limit", default=16, type=int)
    limit = max(4, min(limit, 30))
    data = cheapshark.get_steam_deals(limit=limit)
    return jsonify(data)


@app.get("/api/search")
def search_games():
    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return jsonify([])
    return jsonify(cheapshark.search_steam_deals(term, limit=18))


@app.get("/api/game/<game_id>")
def game_details(game_id: str):
    details = cheapshark.get_game_details(game_id)
    if not details:
        return jsonify({"error": "Jogo não encontrado"}), 404
    return jsonify(details)


@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:path>")
def static_files(path: str):
    file_path = FRONTEND_DIR / path
    if file_path.exists() and file_path.is_file():
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
