# The Station Food Market — Project Timeline

Interactive Gantt chart + comment board for tracking The Station Food Market project at Purdue University.

## Features

- **Horizontal Gantt chart** with day-level resolution (Apr 28 – Aug 31, 2026)
- **Color-coded task categories**: Administrative, Procurement, Buildout, Compliance, Operations, Launch
- **Critical path highlighting** with red border
- **Milestone markers** as diamond indicators
- **Today line** for current date reference
- **Click any task** to open detail panel with notes
- **Comments** on individual tasks or project-wide, with name-only identity (no login)
- **Auto-scroll to today** on page load

## Tech Stack

- **Frontend**: Vanilla HTML / CSS / JS (no framework)
- **Backend**: Vercel Serverless Function (`/api/comments`)
- **Storage**: Upstash Redis (via Vercel Marketplace) for persistent comments; in-memory fallback if not configured
- **Hosting**: Vercel

## Setup

### 1. Deploy to Vercel

```bash
# Import this repo on vercel.com or:
npm i -g vercel
vercel
```

### 2. Enable Persistent Comments (Upstash Redis)

Without Redis, comments work immediately but use in-memory storage that resets on serverless cold starts (~minutes of inactivity). To make comments persist permanently:

1. Go to **Vercel Dashboard → Your Project → Storage** tab
2. Click **Browse Storage** or **Create Database**
3. Select **Upstash Redis** (under Marketplace, or via [Upstash integration](https://vercel.com/integrations/upstash))
4. Create a new Redis database (free tier is fine)
5. Connect it to your project — Vercel auto-injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars
6. **Redeploy** the project (Settings → Deployments → Redeploy, or push any commit)

After redeploy, comments persist across all users and sessions. No code changes needed.

> **Legacy note:** The API also supports the old `KV_REST_API_URL` / `KV_REST_API_TOKEN` env var names if you have an existing Vercel KV setup.

### 3. Update Timeline Data

Edit `public/data/timeline.json` and push. The data structure is:

```json
{
  "meta": { "version": "v1", "updated": "...", ... },
  "categories": [...],
  "tasks": [...],
  "milestones": [...]
}
```

## Project Structure

```
├── public/
│   ├── index.html              # Main page
│   ├── css/style.css           # All styles
│   ├── js/app.js               # Gantt renderer + comments UI
│   └── data/timeline.json      # Timeline source data (v1)
├── api/
│   └── comments.js             # Serverless comment API
├── package.json                # @upstash/redis dependency
├── vercel.json                 # Headers config
└── README.md
```

## Anti-Abuse

- Max comment length: 500 chars
- Max name length: 50 chars
- Rate limit: 5 comments/minute per IP
- Comments capped at 500 total (oldest trimmed)
- No client-side secrets

## Timeline Versions

| Version | Date | Notes |
|---------|------|-------|
| v1 | 2026-04-28 | Initial dated timeline from Lisa's brief |
