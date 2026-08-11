# The News Digest App

A full-stack news digest app: a FastAPI backend that pulls live headlines from
a news API, and a React (Vite) frontend styled as a "wire desk" - a scrolling
headline ticker, category pills, search, and save-for-later.

```
## 1. Get a free news API key

Pick one:

- **GNews** (default, recommended — generous free tier): https://gnews.io → sign up → copy your API key
- **NewsAPI.org**: https://newsapi.org → sign up → copy your API key (note: NewsAPI's free tier blocks some production/deployed use, fine for local dev)

## 2. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# open .env and set NEWS_PROVIDER (gnews or newsapi) and NEWS_API_KEY

uvicorn main:app --reload --port 8000
```

Check it worked: open http://localhost:8000/api/health — you should see
`"key_configured": true`.

## 3. Run the frontend

In a second terminal:

```bash
cd frontend
npm install

cp .env.example .env
# defaults already point at http://localhost:8000, edit if you changed the backend port

npm run dev
```

Open http://localhost:5173 — you should see live headlines.

## API endpoints (backend)

| Endpoint | Description |
|---|---|
| `GET /api/health` | Confirms the server is up and a key is configured |
| `GET /api/categories` | List of available categories |
| `GET /api/news?category=technology&q=&country=us` | Headlines for one category, or a free-text search if `q` is set |
| `GET /api/digest?country=us&per_category=4` | A handful of stories from every category in one response — handy for a true "morning digest" view |

Responses are cached in memory for 5 minutes per query to avoid burning
through your API quota.

## Customizing

- **Add categories**: edit the `CATEGORIES` list in `backend/main.py`.
- **Change default country**: edit the `country` default in `App.jsx`'s fetch call, or add a country selector.
- **Swap providers**: set `NEWS_PROVIDER=newsapi` in `backend/.env` (GNews and NewsAPI have different free-tier limits — check current terms on their sites).
- **Deploy**: the backend is a standard FastAPI app (deploy anywhere that runs Python — Render, Fly.io, a VPS); the frontend builds to static files with `npm run build` (deploy the `dist/` folder anywhere that serves static sites — Vercel, Netlify, GitHub Pages). Remember to update `FRONTEND_ORIGIN` in the backend `.env` and `VITE_API_URL` in the frontend `.env` to your real URLs.

## Notes

- Free tiers on both GNews and NewsAPI are rate-limited (e.g. GNews: 100 requests/day on the free plan) — the 5-minute cache helps, but don't hammer refresh during testing.
- This is a starting point, not a production deployment — for real use you'd want persistent storage for saved articles (currently just `localStorage` in the browser), auth if it's multi-user, and a background job to pre-fetch the digest instead of fetching on-demand.
