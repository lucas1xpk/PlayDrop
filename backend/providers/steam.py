import re
from difflib import SequenceMatcher

import requests
from bs4 import BeautifulSoup

BASE = "https://store.steampowered.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 PlayDrop/2.0",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
}
SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def _money_from_cents(value):
    if value is None:
        return None
    try:
        return round(int(value) / 100, 2)
    except (TypeError, ValueError):
        return None


def _extract_appid(href):
    match = re.search(r"/app/(\d+)", href or "")
    return int(match.group(1)) if match else None


def _parse_brl(text):
    if not text:
        return None
    cleaned = re.sub(r"[^0-9,\.]", "", text)
    if not cleaned:
        return None
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def _normalize(text):
    return re.sub(r"[^a-z0-9]+", " ", (text or "").casefold()).strip()


def _parse_search_html(html, popularity_offset=None):
    soup = BeautifulSoup(html or "", "html.parser")
    games = []
    for index, row in enumerate(soup.select("a.search_result_row")):
        href = row.get("href", "")
        appid = _extract_appid(href)
        if not appid:
            continue

        title_el = row.select_one("span.title")
        title = title_el.get_text(" ", strip=True) if title_el else "Jogo"
        image = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"

        discount_el = row.select_one(".discount_pct")
        discount_text = discount_el.get_text(strip=True) if discount_el else "0%"
        discount = abs(int(re.sub(r"\D", "", discount_text) or 0))

        price_container = row.select_one(".discount_prices") or row.select_one(".search_price")
        current = regular = None
        if price_container:
            current = _money_from_cents(row.get("data-price-final"))
            original_el = price_container.select_one(".discount_original_price")
            final_el = price_container.select_one(".discount_final_price")
            if current is None and final_el:
                current = _parse_brl(final_el.get_text(" ", strip=True))
            if original_el:
                regular = _parse_brl(original_el.get_text(" ", strip=True))
            elif current is not None:
                regular = current

        if current is None:
            continue
        if regular is None:
            regular = current

        game = {
            "id": f"steam-{appid}",
            "appid": appid,
            "title": title,
            "image": image,
            "price": current,
            "regular": regular,
            "discount": discount,
            "currency": "BRL",
            "region": "BR",
            "shop": "Steam",
            "activation": "Steam",
            "url": f"{BASE}/app/{appid}/?cc=br&l=brazilian",
            "historical_low": None,
            "offers": [{
                "shop": "Steam",
                "appid": appid,
                "price": current,
                "regular": regular,
                "discount": discount,
                "activation": "Steam",
                "region": "BR",
                "url": f"{BASE}/app/{appid}/?cc=br&l=brazilian",
            }],
        }
        if popularity_offset is not None:
            game["popularity_rank"] = popularity_offset + index + 1
        games.append(game)
    return games


def _request_search(params):
    response = SESSION.get(f"{BASE}/search/results/", params=params, timeout=18)
    response.raise_for_status()
    return response.json()


def deals(start=0, count=64, sort="Reviews_DESC"):
    start = max(0, int(start))
    params = {
        "query": "",
        "start": start,
        "count": min(max(1, int(count)), 100),
        "dynamic_data": "",
        "sort_by": sort,
        "specials": 1,
        "cc": "BR",
        "l": "brazilian",
        "infinite": 1,
    }
    data = _request_search(params)
    return {
        "games": _parse_search_html(data.get("results_html", "")),
        "total": int(data.get("total_count", 0) or 0),
        "source": "Steam Brasil",
    }


def top_deals(start=0, count=80):
    start = max(0, int(start))
    params = {
        "query": "",
        "start": start,
        "count": min(max(1, int(count)), 100),
        "dynamic_data": "",
        "filter": "topsellers",
        "specials": 1,
        "cc": "BR",
        "l": "brazilian",
        "infinite": 1,
    }
    data = _request_search(params)
    games = _parse_search_html(data.get("results_html", ""), popularity_offset=start)
    games = [game for game in games if int(game.get("discount") or 0) > 0]
    return {
        "games": games,
        "total": int(data.get("total_count", 0) or 0),
        "source": "Steam Brasil",
    }


def top_sellers(start=0, count=20):
    start = max(0, int(start))
    params = {
        "query": "",
        "start": start,
        "count": min(max(1, int(count)), 50),
        "dynamic_data": "",
        "filter": "topsellers",
        "cc": "BR",
        "l": "brazilian",
        "infinite": 1,
    }
    data = _request_search(params)
    return {
        "games": _parse_search_html(data.get("results_html", ""), popularity_offset=start),
        "total": int(data.get("total_count", 0) or 0),
        "source": "Steam Brasil",
    }


def search(term, count=30, promotions_only=False):
    params = {
        "term": term,
        "start": 0,
        "count": min(max(1, int(count)), 50),
        "dynamic_data": "",
        "cc": "BR",
        "l": "brazilian",
        "infinite": 1,
    }
    data = _request_search(params)
    games = _parse_search_html(data.get("results_html", ""))
    if promotions_only:
        games = [game for game in games if int(game.get("discount") or 0) > 0]
    return games


def find_promoted_title(term):
    target = _normalize(term)
    candidates = search(term, 12, promotions_only=True)
    best = None
    best_score = 0
    for game in candidates:
        title = _normalize(game.get("title"))
        ratio = SequenceMatcher(None, target, title).ratio()
        contains_bonus = 0.2 if target and (target in title or title in target) else 0
        score = ratio + contains_bonus
        if score > best_score:
            best_score = score
            best = game
    return best if best_score >= 0.68 else None
