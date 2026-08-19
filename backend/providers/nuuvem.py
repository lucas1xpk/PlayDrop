import os
import requests

BASE = "https://api.nuuvem.com"


def enabled():
    return bool(os.getenv("NUUVEM_API_TOKEN"))


def deals(page_size=50):
    if not enabled():
        return []
    headers = {
        "Authorization": f"Bearer {os.getenv('NUUVEM_API_TOKEN')}",
        "Accept": "application/vnd.api+json",
        "Accept-Language": "pt",
    }
    response = requests.get(
        f"{BASE}/v3/br/products",
        params={"page[size]": min(max(1, int(page_size)), 50), "page[number]": 1},
        headers=headers, timeout=15,
    )
    response.raise_for_status()
    result = []
    for item in response.json().get("data", []):
        attrs = item.get("attributes") or {}
        pricing = attrs.get("pricing") or {}
        if not attrs.get("purchasable") or not pricing.get("discount_percentage"):
            continue
        if pricing.get("currency") != "BRL":
            continue
        steam_app_id = attrs.get("steam_app_id")
        activation = "Steam" if steam_app_id else None
        if not activation:
            continue
        images = attrs.get("images") or []
        image = None
        if isinstance(images, list):
            for entry in images:
                if isinstance(entry, dict):
                    image = entry.get("url") or entry.get("src")
                    if image:
                        break
        result.append({
            "id": f"nuuvem-{item.get('id')}",
            "title": attrs.get("name", "Jogo"),
            "image": image,
            "price": pricing.get("sale_amount"),
            "regular": pricing.get("full_amount") or pricing.get("sale_amount"),
            "discount": pricing.get("discount_percentage") or 0,
            "currency": "BRL",
            "shop": "Nuuvem",
            "activation": activation,
            "url": attrs.get("store_url"),
            "historical_low": None,
            "offers": [{
                "shop": "Nuuvem",
                "price": pricing.get("sale_amount"),
                "regular": pricing.get("full_amount") or pricing.get("sale_amount"),
                "discount": pricing.get("discount_percentage") or 0,
                "activation": activation,
                "url": attrs.get("store_url"),
            }],
        })
    return result
