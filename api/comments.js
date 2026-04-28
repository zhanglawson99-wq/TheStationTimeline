/**
 * Vercel Serverless API — Comments
 *
 * Storage: Vercel KV (Redis) when KV_REST_API_URL is set,
 * otherwise falls back to in-memory (resets on cold start).
 *
 * GET  /api/comments           → all comments
 * GET  /api/comments?taskId=x  → comments for a specific task
 * POST /api/comments           → create a comment
 *   body: { name: string, text: string, taskId?: string }
 */

// --- In-memory fallback ---
let memoryComments = [];

// --- KV helpers ---
let kv = null;

async function getKV() {
  if (kv) return kv;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { createClient } = await import('@vercel/kv');
      kv = createClient({
        url: process.env.KV_REST_API_URL,
        token: process.env.KV_REST_API_TOKEN,
      });
      return kv;
    } catch (e) {
      console.warn('KV init failed, using in-memory:', e.message);
      return null;
    }
  }
  return null;
}

const KV_KEY = 'timeline-comments';

async function getAllComments() {
  const store = await getKV();
  if (store) {
    const data = await store.get(KV_KEY);
    return Array.isArray(data) ? data : [];
  }
  return memoryComments;
}

async function saveComment(comment) {
  const store = await getKV();
  if (store) {
    const existing = await getAllComments();
    existing.push(comment);
    // Cap at 500 comments
    const trimmed = existing.slice(-500);
    await store.set(KV_KEY, trimmed);
    return;
  }
  memoryComments.push(comment);
  if (memoryComments.length > 500) memoryComments = memoryComments.slice(-500);
}

// --- Rate limiting (simple per-IP, in-memory) ---
const rateMap = new Map();
const RATE_WINDOW = 60000; // 1 min
const RATE_LIMIT = 5;      // 5 comments per minute

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_WINDOW) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

// --- Handler ---
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const comments = await getAllComments();
      const { taskId } = req.query;
      if (taskId) {
        return res.json(comments.filter(c => c.taskId === taskId));
      }
      return res.json(comments);
    }

    if (req.method === 'POST') {
      // Rate limit
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      if (!checkRate(ip)) {
        return res.status(429).json({ error: 'Too many comments. Please wait a moment.' });
      }

      const { name, text, taskId } = req.body || {};

      // Validate
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Name is required.' });
      }
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'Comment text is required.' });
      }
      if (name.trim().length > 50) {
        return res.status(400).json({ error: 'Name too long (max 50 characters).' });
      }
      if (text.trim().length > 500) {
        return res.status(400).json({ error: 'Comment too long (max 500 characters).' });
      }

      const comment = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: name.trim(),
        text: text.trim(),
        taskId: taskId || null,
        timestamp: new Date().toISOString(),
      };

      await saveComment(comment);
      return res.status(201).json(comment);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Comments API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
