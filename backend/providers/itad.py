import os
import requests

BASE = "https://api.isthereanydeal.com"
WANTED_SHOPS = {"Steam", "GreenManGaming", "Green Man Gaming", "Fanatical", "GOG", "Epic Game Store"}


def enabled():
    return bool(os.getenv("ITAD_API_KEY"))


def _headers():
    return {"ITAD-API-Key": os.getenv("ITAD_API_KEY", ""), "Accept": "application/json"}


def _activation(deal):
    drm = deal.get("drm") or []
    names = [d.get("name", "") for d in drm if isinstance(d, dict)]
    for name in names:
        low = name.lower()
        if "steam" in low:
            return "Steam"
        if "epic" in low:
            return "Epic Games"
        if "gog" in low:
            return "GOG"
        if "ubisoft" in low or "uplay" in low:
            return "Ubisoft Connect"
        if "ea" in low or "origin" in low:
            return "EA app"
        if "drm free" in low:
            return "DRM Free"
    return names[0] if names else "Loja"


def deals(limit=100, sort="-cut"):
    if not enabled():
        return []
    response = requests.get(
        f"{BASE}/deals/v2",
        params={"country": "BR", "limit": min(max(1, int(limit)), 200), "sort": sort},
        headers=_headers(), timeout=15,
    )
    response.raise_for_status()
    payload = response.json()
    items = payload.get("list", payload if isinstance(payload, list) else [])
    result = []
    for item in items:
        deal = item.get("deal") or item.get("price") or {}
        shop = deal.get("shop") or {}
        shop_name = shop.get("name", "")
        if shop_name not in WANTED_SHOPS:
            continue
        platforms = [p.get("name", "") for p in deal.get("platforms", []) if isinstance(p, dict)]
        if platforms and "Windows" not in platforms:
            continue
        price = (deal.get("price") or {}).get("amount")
        regular = (deal.get("regular") or {}).get("amount")
        currency = (deal.get("price") or {}).get("currency")
        if currency != "BRL" or price is None:
            continue
        game = item.get("game") or item
        assets = game.get("assets") or {}
        history_low = item.get("historyLow") or item.get("history_low") or {}
        if isinstance(history_low, dict):
            history_low = history_low.get("amount") or (history_low.get("price") or {}).get("amount")
        result.append({
            "id": f"itad-{game.get('id')}",
            "itad_id": game.get("id"),
            "title": game.get("title", "Jogo"),
            "image": assets.get("banner400") or assets.get("banner300") or assets.get("boxart"),
            "price": price,
            "regular": regular if regular is not None else price,
            "discount": deal.get("cut", 0) or 0,
            "currency": "BRL",
            "region": "BR",
            "shop": shop_name,
            "activation": _activation(deal),
            "url": deal.get("url"),
            "historical_low": history_low,
            "offers": [{
                "shop": shop_name,
                "price": price,
                "regular": regular if regular is not None else price,
                "discount": deal.get("cut", 0) or 0,
                "activation": _activation(deal),
                "region": "BR",
                "historical_low": history_low,
                "url": deal.get("url"),
            }],
        })
    return result
