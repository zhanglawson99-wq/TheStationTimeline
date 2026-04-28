/**
 * Vercel Serverless API — Comments
 *
 * Storage priority:
 * 1. Upstash Redis (Vercel Marketplace): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * 2. Legacy Vercel KV: KV_REST_API_URL + KV_REST_API_TOKEN
 * 3. In-memory fallback (resets on cold start)
 *
 * GET  /api/comments           → all comments
 * GET  /api/comments?taskId=x  → comments for a specific task
 * POST /api/comments           → create a comment
 *   body: { name: string, text: string, taskId?: string }
 */

// --- In-memory fallback ---
let memoryComments = [];

// --- Redis client (cached) ---
let redis = null;
let redisAttempted = false;

function getRedisEnv() {
  // Prefer Upstash Marketplace env vars
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN };
  }
  // Fall back to legacy Vercel KV env vars
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  }
  return null;
}

function getRedis() {
  if (redis) return redis;
  if (redisAttempted) return null;
  redisAttempted = true;

  const env = getRedisEnv();
  if (!env) return null;

  try {
    // @upstash/redis is the current recommended package
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url: env.url, token: env.token });
    return redis;
  } catch (_) {
    try {
      // Fall back to @vercel/kv if installed
      const vercelKV = require('@vercel/kv');
      redis = vercelKV.createClient({ url: env.url, token: env.token });
      return redis;
    } catch (e) {
      console.warn('Redis init failed, using in-memory:', e.message);
      return null;
    }
  }
}

const REDIS_KEY = 'timeline-comments';

async function getAllComments() {
  const store = getRedis();
  if (store) {
    const data = await store.get(REDIS_KEY);
    return Array.isArray(data) ? data : [];
  }
  return memoryComments;
}

async function saveComment(comment) {
  const store = getRedis();
  if (store) {
    const existing = await getAllComments();
    existing.push(comment);
    const trimmed = existing.slice(-500);
    await store.set(REDIS_KEY, trimmed);
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
module.exports = async function handler(req, res) {
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
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
      if (!checkRate(ip)) {
        return res.status(429).json({ error: 'Too many comments. Please wait a moment.' });
      }

      const { name, text, taskId } = req.body || {};

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
