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
- **Storage**: Vercel KV (Redis) for persistent comments; in-memory fallback if KV not configured
- **Hosting**: Vercel

## Setup

### 1. Deploy to Vercel

```bash
# Import this repo on vercel.com or:
npm i -g vercel
vercel
```

### 2. Enable Persistent Comments (Vercel KV)

1. Go to **Vercel Dashboard → Your Project → Storage**
2. Click **Create Database → KV (Durable Redis)**
3. Follow the setup — Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars
4. Redeploy (or it may auto-redeploy)

Without KV, comments use in-memory storage (resets on serverless cold starts).

### 3. Update Timeline Data

Edit `data/timeline.json` and push. The data structure is:

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
│   ├── index.html          # Main page
│   ├── css/style.css       # All styles
│   └── js/app.js           # Gantt renderer + comments UI
├── api/
│   └── comments.js         # Serverless comment API
├── data/
│   └── timeline.json       # Timeline source data (v1)
├── package.json            # @vercel/kv dependency
├── vercel.json             # Routing + headers
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
