import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from providers import itad, nuuvem, steam

load_dotenv()
BASE_DIR = Path(__file__).resolve().parent
FRONTEND = BASE_DIR.parent / "frontend"
app = Flask(__name__, static_folder=str(FRONTEND), static_url_path="")
CORS(app)
CACHE_SECONDS = int(os.getenv("CACHE_SECONDS", "120"))
_cache = {}

PREMIUM_TITLES = [
    "Elden Ring",
    "Cyberpunk 2077",
    "Red Dead Redemption 2",
    "Baldur's Gate 3",
    "Hogwarts Legacy",
    "God of War",
    "The Witcher 3",
    "Resident Evil 4",
    "Forza Horizon 5",
    "Grand Theft Auto V",
    "Helldivers 2",
    "Sekiro Shadows Die Twice",
    "Black Myth Wukong",
    "Silent Hill 2",
    "Diablo IV",
    "Dead Cells",
    "Horizon Zero Dawn",
    "Metro Exodus",
    "Disco Elysium",
]

PREMIUM_KEYWORDS = {
    "elden ring": 100,
    "cyberpunk": 99,
    "red dead redemption": 99,
    "baldur": 98,
    "hogwarts": 97,
    "god of war": 97,
    "witcher": 96,
    "resident evil": 96,
    "forza": 95,
    "grand theft auto": 95,
    "gta": 95,
    "helldivers": 94,
    "sekiro": 93,
    "black myth": 93,
    "silent hill": 92,
    "diablo": 92,
    "dead cells": 90,
    "horizon": 90,
    "metro": 89,
    "disco elysium": 88,
    "assassin": 90,
    "monster hunter": 91,
    "final fantasy": 90,
    "doom": 89,
    "call of duty": 89,
    "battlefield": 88,
    "persona": 86,
}


def cached(key, fn, ttl=None):
    now = time.time()
    item = _cache.get(key)
    lifetime = CACHE_SECONDS if ttl is None else ttl
    if item and now - item[0] < lifetime:
        return item[1]
    value = fn()
    _cache[key] = (now, value)
    return value


def merge_games(groups):
    merged = {}
    for games in groups:
        for game in games:
            key = (game.get("title") or "").strip().casefold()
            if not key:
                continue
            current = merged.get(key)
            if not current:
                current = dict(game)
                current["offers"] = list(game.get("offers") or [])
                merged[key] = current
                continue

            current["offers"].extend(game.get("offers") or [])
            if game.get("popularity_rank") and not current.get("popularity_rank"):
                current["popularity_rank"] = game["popularity_rank"]
            if game.get("price") is not None and (
                current.get("price") is None or float(game["price"]) < float(current["price"])
            ):
                offers = current["offers"]
                popularity_rank = current.get("popularity_rank")
                current.update(game)
                current["offers"] = offers
                if popularity_rank and not current.get("popularity_rank"):
                    current["popularity_rank"] = popularity_rank

    for game in merged.values():
        unique = {}
        for offer in game.get("offers", []):
            unique[(offer.get("shop"), offer.get("price"), offer.get("activation"))] = offer
        game["offers"] = sorted(
            unique.values(),
            key=lambda item: item.get("price") if item.get("price") is not None else 10**9,
        )
    return list(merged.values())


def premium_score(game):
    title = (game.get("title") or "").casefold()
    brand = max((score for key, score in PREMIUM_KEYWORDS.items() if key in title), default=0)
    rank = int(game.get("popularity_rank") or 999)
    popularity = max(0, 340 - min(rank, 85) * 4) if rank != 999 else 0
    discount = min(int(game.get("discount") or 0), 90)
    shops = min(len(game.get("offers") or []), 4) * 10
    price_bonus = 12 if 0 < float(game.get("price") or 0) <= 99.99 else 0
    return brand * 100 + popularity + discount * 2 + shops + price_bonus


def sort_by_relevance(games):
    return sorted(
        games,
        key=lambda game: (
            -premium_score(game),
            int(game.get("popularity_rank") or 999),
            -int(game.get("discount") or 0),
            float(game.get("price") or 10**9),
        ),
    )


def live_deals(start=0, count=64):
    steam_data = steam.deals(start=start, count=count, sort="Reviews_DESC")
    groups = [steam_data["games"]]
    sources = [steam_data["source"]]

    if itad.enabled():
        try:
            groups.append(itad.deals(limit=max(count, 100)))
            sources.append("IsThereAnyDeal")
        except Exception:
            pass

    if nuuvem.enabled():
        try:
            groups.append(nuuvem.deals())
            sources.append("Nuuvem")
        except Exception:
            pass

    games = [game for game in merge_games(groups) if int(game.get("discount") or 0) > 0]
    games = sort_by_relevance(games)
    return {"games": games, "total": steam_data.get("total", len(games)), "sources": sources}


def _curated_promotions():
    found = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(steam.find_promoted_title, title): title for title in PREMIUM_TITLES}
        for future in as_completed(futures):
            try:
                game = future.result()
                if game:
                    found.append(game)
            except Exception:
                continue
    return found


def featured_deals():
    groups = []
    sources = []

    try:
        top = steam.top_deals(0, 100)
        groups.append(top["games"])
        sources.append(top["source"])
    except Exception:
        top = {"games": []}

    if itad.enabled():
        try:
            groups.append(itad.deals(limit=120, sort="-cut"))
            sources.append("IsThereAnyDeal")
        except Exception:
            pass

    if nuuvem.enabled():
        try:
            groups.append(nuuvem.deals())
            sources.append("Nuuvem")
        except Exception:
            pass

    ranked = [game for game in merge_games(groups) if int(game.get("discount") or 0) > 0]
    ranked = sort_by_relevance(ranked)

    if len(ranked) < 5 or sum(1 for game in ranked[:8] if premium_score(game) >= 8500) < 5:
        try:
            ranked = sort_by_relevance(merge_games([ranked, _curated_promotions()]))
        except Exception:
            ranked = sort_by_relevance(ranked)

    chosen = []
    seen = set()
    for game in ranked:
        game_id = str(game.get("id"))
        if game_id in seen:
            continue
        seen.add(game_id)
        chosen.append(game)
        if len(chosen) >= 12:
            break

    if len(chosen) < 5:
        fallback = live_deals(0, 100)["games"]
        for game in fallback:
            game_id = str(game.get("id"))
            if game_id in seen:
                continue
            seen.add(game_id)
            chosen.append(game)
            if len(chosen) >= 12:
                break

    return {"games": chosen, "sources": list(dict.fromkeys(sources))}


@app.get("/api/deals")
def api_deals():
    start = request.args.get("start", 0, type=int)
    count = request.args.get("count", 64, type=int)
    try:
        return jsonify(
            cached(
                f"deals:{start}:{count}:{itad.enabled()}:{nuuvem.enabled()}",
                lambda: live_deals(start, count),
            )
        )
    except Exception:
        return jsonify({"games": [], "total": 0, "sources": [], "error": "Não foi possível atualizar as ofertas agora."}), 502


@app.get("/api/featured")
def api_featured():
    try:
        return jsonify(
            cached(
                f"featured:{itad.enabled()}:{nuuvem.enabled()}",
                featured_deals,
                ttl=max(CACHE_SECONDS, 300),
            )
        )
    except Exception:
        try:
            fallback = live_deals(0, 20)
            return jsonify({"games": fallback["games"][:12], "sources": fallback.get("sources", [])})
        except Exception:
            return jsonify({"games": [], "sources": [], "error": "Não foi possível atualizar os destaques agora."}), 502


@app.get("/api/search")
def api_search():
    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return jsonify({"games": []})
    try:
        games = cached(
            f"search:promos:{term.casefold()}",
            lambda: steam.search(term, 36, promotions_only=True),
        )
        games = sort_by_relevance(games)
        return jsonify({"games": games})
    except Exception:
        return jsonify({"games": [], "error": "Não foi possível concluir a busca agora."}), 502


@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/catalogo")
def catalogo():
    return send_from_directory(FRONTEND, "catalogo.html")


@app.get("/<path:path>")
def frontend_file(path):
    target = FRONTEND / path
    if target.is_file():
        return send_from_directory(FRONTEND, path)
    return send_from_directory(FRONTEND, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
