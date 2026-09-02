import os
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
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

CACHE_SECONDS = int(os.getenv("CACHE_SECONDS", "180"))
_cache = {}

PREMIUM_TITLES = [
    "Elden Ring", "Cyberpunk 2077", "Red Dead Redemption 2", "Baldur's Gate 3",
    "Hogwarts Legacy", "God of War", "The Witcher 3", "Resident Evil 4",
    "Forza Horizon 5", "Grand Theft Auto V", "Helldivers 2",
    "Sekiro Shadows Die Twice", "Black Myth Wukong", "Silent Hill 2",
    "Diablo IV", "Monster Hunter Wilds", "Final Fantasy VII Rebirth",
    "Doom The Dark Ages",
]

PREMIUM_KEYWORDS = {
    "elden ring": 100, "cyberpunk": 99, "red dead redemption": 99,
    "baldur": 98, "hogwarts": 97, "god of war": 97, "witcher": 96,
    "resident evil": 96, "forza": 95, "grand theft auto": 95, "gta": 95,
    "helldivers": 94, "sekiro": 93, "black myth": 93, "silent hill": 92,
    "diablo": 92, "monster hunter": 91, "final fantasy": 90,
    "assassin": 90, "horizon": 90, "doom": 89, "call of duty": 89,
    "battlefield": 88, "persona": 86,
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


def normalize_title(value):
    text = (value or "").replace("™", " ").replace("®", " ").replace("©", " ")
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.casefold()
    text = re.sub(r"\b(pc|windows)\b", " ", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _validated_offer(offer):
    price = _number(offer.get("price"))
    return offer.get("region") == "BR" and price is not None and price >= 0 and bool(offer.get("url"))


def _finalize_game(game):
    offers = [dict(offer) for offer in game.get("offers", []) if _validated_offer(offer)]
    unique = {}
    for offer in offers:
        key = (
            normalize_title(offer.get("shop")),
            normalize_title(offer.get("activation")),
            round(_number(offer.get("price")) or 0, 2),
        )
        unique[key] = offer
    offers = sorted(unique.values(), key=lambda offer: _number(offer.get("price")) or 10**9)
    if not offers:
        return None

    best = offers[0]
    game["offers"] = offers
    game["price"] = _number(best.get("price"))
    game["regular"] = _number(best.get("regular")) or game["price"]
    game["discount"] = int(_number(best.get("discount")) or 0)
    game["shop"] = best.get("shop") or "Loja"
    game["activation"] = best.get("activation") or "Loja"
    game["url"] = best.get("url")
    game["currency"] = "BRL"
    game["offer_count"] = len(offers)

    lows = [_number(game.get("historical_low"))]
    lows.extend(_number(offer.get("historical_low")) for offer in offers)
    lows = [value for value in lows if value is not None and value > 0]
    historical_low = min(lows) if lows else None
    game["historical_low"] = historical_low
    if historical_low:
        if game["price"] <= historical_low * 1.001:
            game["price_status"] = "new-low"
        elif game["price"] <= historical_low * 1.10:
            game["price_status"] = "near-low"
        else:
            game["price_status"] = "tracked"
    else:
        game["price_status"] = "tracking"

    appid = game.get("appid") or next((offer.get("appid") for offer in offers if offer.get("appid")), None)
    if appid:
        game["appid"] = int(appid)
        game["id"] = f"steam-{appid}"
    elif not game.get("id"):
        game["id"] = f"game-{normalize_title(game.get('title')).replace(' ', '-')}"
    return game


def merge_games(groups):
    merged = {}
    for games in groups:
        for source_game in games:
            key = normalize_title(source_game.get("title"))
            if not key:
                continue
            current = merged.get(key)
            if current is None:
                current = dict(source_game)
                current["offers"] = list(source_game.get("offers") or [])
                merged[key] = current
                continue

            current["offers"].extend(source_game.get("offers") or [])
            if not current.get("appid") and source_game.get("appid"):
                current["appid"] = source_game["appid"]
            if not current.get("image") and source_game.get("image"):
                current["image"] = source_game["image"]
            source_rank = int(source_game.get("popularity_rank") or 9999)
            current_rank = int(current.get("popularity_rank") or 9999)
            if source_rank < current_rank:
                current["popularity_rank"] = source_rank
            source_low = _number(source_game.get("historical_low"))
            current_low = _number(current.get("historical_low"))
            if source_low and (not current_low or source_low < current_low):
                current["historical_low"] = source_low

    finalized = []
    for game in merged.values():
        ready = _finalize_game(game)
        if ready:
            finalized.append(ready)
    return finalized


def premium_score(game):
    title = normalize_title(game.get("title"))
    brand = max((score for key, score in PREMIUM_KEYWORDS.items() if key in title), default=0)
    rank = int(game.get("popularity_rank") or 999)
    popularity = max(0, 360 - min(rank, 90) * 4) if rank != 999 else 0
    discount = min(int(game.get("discount") or 0), 90)
    shops = min(len(game.get("offers") or []), 5) * 14
    price_bonus = 16 if 0 < float(game.get("price") or 0) <= 120 else 0
    return brand * 100 + popularity + discount * 2 + shops + price_bonus


def sort_by_relevance(games):
    return sorted(
        games,
        key=lambda game: (
            -premium_score(game), int(game.get("popularity_rank") or 999),
            -int(game.get("discount") or 0), float(game.get("price") or 10**9),
        ),
    )


def _provider_deals(limit=120):
    groups = []
    sources = []
    if itad.enabled():
        try:
            groups.append(cached(f"itad:{limit}", lambda: itad.deals(limit=limit), ttl=300))
            sources.append("IsThereAnyDeal")
        except Exception:
            pass
    if nuuvem.enabled():
        try:
            groups.append(cached("nuuvem", nuuvem.deals, ttl=300))
            sources.append("Nuuvem")
        except Exception:
            pass
    return groups, sources


def live_deals(start=0, count=64):
    steam_data = steam.deals(start=start, count=count, sort="Reviews_DESC")
    groups = [steam_data["games"]]
    sources = [steam_data["source"]]
    provider_groups, provider_sources = _provider_deals(max(count, 120))
    groups.extend(provider_groups)
    sources.extend(provider_sources)
    games = [game for game in merge_games(groups) if int(game.get("discount") or 0) > 0]
    return {
        "games": sort_by_relevance(games),
        "total": max(int(steam_data.get("total", 0)), len(games)),
        "sources": list(dict.fromkeys(sources)),
    }


def bestsellers():
    steam_data = steam.top_sellers(0, 18)
    games = merge_games([steam_data["games"]])
    return {"games": sorted(games, key=lambda game: int(game.get("popularity_rank") or 999))[:10]}


def _curated_promotions():
    found = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(steam.find_promoted_title, title) for title in PREMIUM_TITLES]
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
        pass

    provider_groups, provider_sources = _provider_deals(140)
    groups.extend(provider_groups)
    sources.extend(provider_sources)
    ranked = [game for game in merge_games(groups) if int(game.get("discount") or 0) > 0]
    ranked = sort_by_relevance(ranked)
    if len(ranked) < 8 or sum(1 for game in ranked[:10] if premium_score(game) >= 8500) < 5:
        try:
            ranked = sort_by_relevance(merge_games([ranked, _curated_promotions()]))
        except Exception:
            pass
    return {"games": ranked[:14], "sources": list(dict.fromkeys(sources))}


def search_games(term):
    steam_games = steam.search(term, 40, promotions_only=False)
    groups = [steam_games]
    provider_groups, _ = _provider_deals(180)
    needle = normalize_title(term)
    for games in provider_groups:
        groups.append([game for game in games if needle in normalize_title(game.get("title"))])
    return sort_by_relevance(merge_games(groups))


@app.get("/api/deals")
def api_deals():
    start = max(0, request.args.get("start", 0, type=int))
    count = min(max(1, request.args.get("count", 64, type=int)), 100)
    try:
        key = f"deals:{start}:{count}:{itad.enabled()}:{nuuvem.enabled()}"
        return jsonify(cached(key, lambda: live_deals(start, count)))
    except Exception:
        return jsonify({"games": [], "total": 0, "sources": [], "error": "Não foi possível atualizar as ofertas agora."}), 502


@app.get("/api/featured")
def api_featured():
    try:
        key = f"featured:{itad.enabled()}:{nuuvem.enabled()}"
        return jsonify(cached(key, featured_deals, ttl=max(CACHE_SECONDS, 300)))
    except Exception:
        return jsonify({"games": [], "sources": [], "error": "Não foi possível atualizar os destaques agora."}), 502


@app.get("/api/bestsellers")
def api_bestsellers():
    try:
        return jsonify(cached("bestsellers", bestsellers, ttl=max(CACHE_SECONDS, 300)))
    except Exception:
        return jsonify({"games": [], "error": "Não foi possível atualizar os mais comprados agora."}), 502


@app.get("/api/search")
def api_search():
    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return jsonify({"games": []})
    try:
        games = cached(f"search:{normalize_title(term)}", lambda: search_games(term))
        return jsonify({"games": games})
    except Exception:
        return jsonify({"games": [], "error": "Não foi possível concluir a busca agora."}), 502


@app.get("/api/game")
def api_game():
    term = (request.args.get("q") or "").strip()
    if len(term) < 2:
        return jsonify({"error": "Jogo não informado."}), 400
    try:
        games = cached(f"search:{normalize_title(term)}", lambda: search_games(term))
        target = normalize_title(term)
        best = max(
            games,
            key=lambda game: SequenceMatcher(None, target, normalize_title(game.get("title"))).ratio(),
            default=None,
        )
        if not best:
            return jsonify({"error": "Jogo não encontrado."}), 404
        return jsonify({"game": best})
    except Exception:
        return jsonify({"error": "Não foi possível atualizar este jogo agora."}), 502


@app.get("/api/health")
def api_health():
    return jsonify({"status": "ok", "version": "2.0"})


@app.get("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


@app.get("/catalogo")
def catalogo():
    return send_from_directory(FRONTEND, "catalogo.html")


@app.get("/jogo/<path:_slug>")
def jogo(_slug):
    return send_from_directory(FRONTEND, "jogo.html")


@app.get("/<path:path>")
def frontend_file(path):
    target = FRONTEND / path
    if target.is_file():
        return send_from_directory(FRONTEND, path)
    return send_from_directory(FRONTEND, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
