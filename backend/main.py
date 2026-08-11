import os
import time
from typing import Optional

import httpx
from cachetools import TTLCache
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

NEWS_API_KEY = os.getenv("NEWS_API_KEY", "")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

app = FastAPI(title="News Digest API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache each (category, query, country) combo for 5 minutes so repeated
# frontend polling / refreshing doesn't hammer the upstream API.
cache: TTLCache = TTLCache(maxsize=256, ttl=300)

CATEGORIES = ["general", "world", "business", "technology", "science", "health", "sports", "entertainment"]


def _cache_key(**kwargs) -> str:
    return "|".join(f"{k}={v}" for k, v in sorted(kwargs.items()))


async def _fetch_gnews(category: str, query: Optional[str], country: str, page_size: int) -> list[dict]:
    base_url = "https://gnews.io/api/v4/top-headlines" if not query else "https://gnews.io/api/v4/search"
    params = {
        "apikey": NEWS_API_KEY,
        "lang": "en",
        "country": country,
        "max": page_size,
    }
    if query:
        params["q"] = query
    elif category and category != "general":
        params["topic"] = category

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(base_url, params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GNews error: {resp.text}")

    data = resp.json()
    return [
        {
            "id": a.get("url"),
            "title": a.get("title"),
            "snippet": a.get("description") or "",
            "url": a.get("url"),
            "image": a.get("image"),
            "source": (a.get("source") or {}).get("name", "Unknown"),
            "published_at": a.get("publishedAt"),
            "category": category,
        }
        for a in data.get("articles", [])
    ]


async def _fetch_newsapi(category: str, query: Optional[str], country: str, page_size: int) -> list[dict]:
    base_url = "https://newsapi.org/v2/everything" if query else "https://newsapi.org/v2/top-headlines"
    params = {
        "apiKey": NEWS_API_KEY,
        "pageSize": page_size,
        "language": "en",
    }
    if query:
        params["q"] = query
    else:
        params["country"] = country
        if category and category != "general":
            params["category"] = category

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(base_url, params=params)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"NewsAPI error: {resp.text}")

    data = resp.json()
    return [
        {
            "id": a.get("url"),
            "title": a.get("title"),
            "snippet": a.get("description") or "",
            "url": a.get("url"),
            "image": a.get("urlToImage"),
            "source": (a.get("source") or {}).get("name", "Unknown"),
            "published_at": a.get("publishedAt"),
            "category": category,
        }
        for a in data.get("articles", [])
    ]


@app.get("/api/health")
async def health():
    return {"status": "ok", "provider": NEWS_PROVIDER, "key_configured": bool(NEWS_API_KEY)}


@app.get("/api/categories")
async def categories():
    return {"categories": CATEGORIES}


@app.get("/api/news")
async def get_news(
    category: str = Query("general", description="One of the values from /api/categories"),
    q: Optional[str] = Query(None, description="Free-text search; overrides category"),
    country: str = Query("us"),
    page_size: int = Query(20, ge=1, le=50),
):
    if not NEWS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="No NEWS_API_KEY set. Copy .env.example to .env and add your API key.",
        )

    key = _cache_key(category=category, q=q, country=country, page_size=page_size)
    if key in cache:
        return {"cached": True, "fetched_at": cache[key]["fetched_at"], "articles": cache[key]["articles"]}

    if NEWS_PROVIDER == "newsapi":
        articles = await _fetch_newsapi(category, q, country, page_size)
    else:
        articles = await _fetch_gnews(category, q, country, page_size)

    cache[key] = {"fetched_at": time.time(), "articles": articles}
    return {"cached": False, "fetched_at": cache[key]["fetched_at"], "articles": articles}


@app.get("/api/digest")
async def get_digest(country: str = Query("us"), per_category: int = Query(4, ge=1, le=10)):
    """Convenience endpoint: pulls a handful of top stories from every category in one call."""
    if not NEWS_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="No NEWS_API_KEY set. Copy .env.example to .env and add your API key.",
        )

    fetch_fn = _fetch_newsapi if NEWS_PROVIDER == "newsapi" else _fetch_gnews
    digest = {}
    for cat in CATEGORIES:
        key = _cache_key(category=cat, q=None, country=country, page_size=per_category)
        if key in cache:
            digest[cat] = cache[key]["articles"]
            continue
        try:
            articles = await fetch_fn(cat, None, country, per_category)
        except HTTPException:
            articles = []
        cache[key] = {"fetched_at": time.time(), "articles": articles}
        digest[cat] = articles

    return {"fetched_at": time.time(), "digest": digest}
