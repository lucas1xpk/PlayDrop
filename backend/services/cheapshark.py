from __future__ import annotations

import time
from typing import Any

import requests


class CheapSharkService:
    BASE_URL = "https://www.cheapshark.com/api/1.0"
    STEAM_STORE_ID = "1"

    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "PlayDrop/1.0 portfolio-project"})
        self._cache: dict[str, tuple[float, Any]] = {}
        self.cache_seconds = 300

    def _get(self, path: str, params: dict[str, Any]) -> Any:
        key = f"{path}:{sorted(params.items())}"
        now = time.time()
        cached = self._cache.get(key)
        if cached and now - cached[0] < self.cache_seconds:
            return cached[1]

        response = self.session.get(
            f"{self.BASE_URL}{path}", params=params, timeout=12
        )
        response.raise_for_status()
        data = response.json()
        self._cache[key] = (now, data)
        return data

    @staticmethod
    def _money(value: str | float | int | None) -> float:
        try:
            return round(float(value or 0), 2)
        except (TypeError, ValueError):
            return 0.0

    def _normalize_deal(self, deal: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(deal.get("gameID", "")),
            "deal_id": str(deal.get("dealID", "")),
            "title": deal.get("title") or "Jogo sem nome",
            "image": deal.get("thumb") or "",
            "sale_price_usd": self._money(deal.get("salePrice")),
            "normal_price_usd": self._money(deal.get("normalPrice")),
            "discount": int(round(self._money(deal.get("savings")))),
            "store": "Steam",
            "activation": "Steam",
            "store_id": self.STEAM_STORE_ID,
            "steam_app_id": deal.get("steamAppID"),
            "deal_rating": self._money(deal.get("dealRating")),
            "br_verified": True,
            "redirect_url": (
                f"https://www.cheapshark.com/redirect?dealID={deal.get('dealID')}"
                if deal.get("dealID")
                else "https://store.steampowered.com/"
            ),
        }

    def get_steam_deals(self, limit: int = 16) -> list[dict[str, Any]]:
        data = self._get(
            "/deals",
            {
                "storeID": self.STEAM_STORE_ID,
                "pageSize": limit,
                "sortBy": "Savings",
                "desc": 1,
                "onSale": 1,
                "AAA": 0,
            },
        )
        return [self._normalize_deal(item) for item in data]

    def search_steam_deals(self, term: str, limit: int = 18) -> list[dict[str, Any]]:
        data = self._get(
            "/deals",
            {
                "storeID": self.STEAM_STORE_ID,
                "pageSize": limit,
                "title": term,
                "onSale": 1,
                "sortBy": "Savings",
                "desc": 1,
            },
        )
        return [self._normalize_deal(item) for item in data]

    def get_game_details(self, game_id: str) -> dict[str, Any] | None:
        data = self._get("/games", {"id": game_id})
        if not isinstance(data, dict) or not data.get("info"):
            return None

        info = data.get("info", {})
        cheapest = data.get("cheapestPriceEver", {}) or {}
        steam_deals = []

        for deal in data.get("deals", []):
            if str(deal.get("storeID")) != self.STEAM_STORE_ID:
                continue
            steam_deals.append(
                {
                    "store": "Steam",
                    "activation": "Steam",
                    "price_usd": self._money(deal.get("price")),
                    "retail_price_usd": self._money(deal.get("retailPrice")),
                    "savings": int(round(self._money(deal.get("savings")))),
                    "redirect_url": f"https://www.cheapshark.com/redirect?dealID={deal.get('dealID')}",
                    "br_verified": True,
                }
            )

        return {
            "id": game_id,
            "title": info.get("title") or "Jogo",
            "image": info.get("thumb") or "",
            "steam_app_id": info.get("steamAppID"),
            "historical_low_usd": self._money(cheapest.get("price")),
            "historical_date": cheapest.get("date"),
            "offers": steam_deals,
        }
