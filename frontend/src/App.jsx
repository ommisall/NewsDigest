import React, { useEffect, useMemo, useState, useCallback } from "react";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const SAVED_KEY = "news-digest-saved-articles";

function loadSaved() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function App() {
  const [categories, setCategories] = useState(["general"]);
  const [activeCat, setActiveCat] = useState("general");
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(loadSaved);
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  useEffect(() => {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...saved]));
  }, [saved]);

  useEffect(() => {
    fetch(`${API_BASE}/api/categories`)
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || ["general"]))
      .catch(() => {});
  }, []);

  const fetchNews = useCallback(
    (opts = {}) => {
      const cat = opts.category ?? activeCat;
      const q = opts.query ?? query;
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ category: cat });
      if (q.trim()) params.set("q", q.trim());

      fetch(`${API_BASE}/api/news?${params.toString()}`)
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body.detail || `Request failed (${r.status})`);
          }
          return r.json();
        })
        .then((d) => setArticles(d.articles || []))
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [activeCat, query]
  );

  useEffect(() => {
    fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCat]);

  const toggleSave = (id) => {
    setSaved((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visible = useMemo(() => {
    if (!showSavedOnly) return articles;
    return articles.filter((a) => saved.has(a.id));
  }, [articles, saved, showSavedOnly]);

  const ticker = useMemo(
    () => articles.slice(0, 8).map((a) => `${(a.category || "").toUpperCase()} — ${a.title}`),
    [articles]
  );

  const dateline = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="dg-page">
      <div className="dg-ticker-bar">
        <div className="dg-ticker-label">ON&nbsp;THE&nbsp;WIRE</div>
        <div className="dg-ticker-viewport">
          <div className="dg-ticker-track">
            {[...ticker, ...ticker].map((t, i) => (
              <span className="dg-ticker-item" key={i}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="dg-container">
        <header>
          <div className="dg-masthead-top">
            <span>{dateline}</span>
            <span className="dg-edition">LIVE EDITION</span>
          </div>
          <h1 className="dg-wordmark">THE DIGEST</h1>
          <div className="dg-rule" />
        </header>

        <div className="dg-controls">
          <input
            className="dg-search"
            placeholder="Search headlines…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchNews()}
          />
          <button className="dg-refresh" onClick={() => fetchNews()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            className={`dg-saved-toggle ${showSavedOnly ? "active" : ""}`}
            onClick={() => setShowSavedOnly((s) => !s)}
          >
            ★ Saved {saved.size > 0 ? `(${saved.size})` : ""}
          </button>
        </div>

        <div className="dg-pill-row">
          {categories.map((cat) => (
            <span
              key={cat}
              className={`dg-pill ${activeCat === cat ? "active" : ""}`}
              onClick={() => setActiveCat(cat)}
            >
              {cat}
            </span>
          ))}
        </div>

        {error && (
          <div className="dg-state">
            <div className="dg-state-title">Couldn't load the wire.</div>
            <div className="dg-state-body">{error}</div>
          </div>
        )}

        {!error && !loading && visible.length === 0 && (
          <div className="dg-state">
            <div className="dg-state-title">No stories match.</div>
            <div className="dg-state-body">Try a different category, or clear your search.</div>
          </div>
        )}

        {!error && visible.length > 0 && (
          <div className="dg-grid">
            {visible.map((a) => (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="dg-card"
              >
                <div className="dg-card-top">
                  <span className="dg-cat-tag">{a.category}</span>
                  <button
                    className={`dg-star ${saved.has(a.id) ? "saved" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleSave(a.id);
                    }}
                    title={saved.has(a.id) ? "Remove from saved" : "Save for later"}
                  >
                    {saved.has(a.id) ? "★" : "☆"}
                  </button>
                </div>
                <h2 className="dg-card-title">{a.title}</h2>
                <p className="dg-card-snippet">{a.snippet}</p>
                <div className="dg-card-meta">
                  <span className="dg-card-source">{a.source}</span>
                  <span>·</span>
                  <span>{timeAgo(a.published_at)}</span>
                </div>
              </a>
            ))}
          </div>
        )}

        <footer className="dg-footer">
          Powered by your own FastAPI backend · Data from {import.meta.env.VITE_NEWS_PROVIDER_LABEL || "your configured news API"}
        </footer>
      </div>
    </div>
  );
}
