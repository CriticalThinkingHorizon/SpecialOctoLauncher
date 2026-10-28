const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const API_BASE = 'https://api.nonopost.com';
const IDENTITY_DIR = path.join(os.homedir(), '.openclaw', 'nonopost');
const IDENTITY_FILE = path.join(IDENTITY_DIR, 'identity.json');

let cachedPosts = [];
let lastFetchTime = 0;

function getPersistentIdentity() {
  try {
    if (fs.existsSync(IDENTITY_FILE)) {
      const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'));
      if (data && data.authorName) return data.authorName;
    }
  } catch (e) {}

  // Generate a friendly S2 identity if none exists
  const rand = Math.floor(1000 + Math.random() * 9000);
  const authorName = `S2_Pilot_${rand}`;
  try {
    fs.mkdirSync(IDENTITY_DIR, { recursive: true });
    fs.writeFileSync(IDENTITY_FILE, JSON.stringify({ authorName }, null, 2), 'utf8');
  } catch (e) {}
  return authorName;
}

function formatDate(isoStr) {
  if (!isoStr) return 'just now';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'recently';
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hr = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mo}-${day} ${hr}:${min}`;
  } catch {
    return 'recently';
  }
}

function sanitizeText(str, maxLen = 160) {
  if (!str) return '';
  return str
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .trim()
    .slice(0, maxLen);
}

async function fetchFeed(force = false) {
  const now = Date.now();
  if (!force && cachedPosts.length > 0 && now - lastFetchTime < 10000) {
    return cachedPosts;
  }
  try {
    console.log('[NONOPOST] Fetching recent posts from https://api.nonopost.com/api/Posts...');
    const resp = await fetch(`${API_BASE}/api/Posts`, {
      headers: { 'User-Agent': 'S2-Homebrew-SDK/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (resp.ok) {
      const list = await resp.json();
      if (Array.isArray(list)) {
        cachedPosts = list.map(item => ({
          id: String(item.id || '').slice(0, 36),
          author: sanitizeText(item.authorName || 'Anonymous', 20),
          date: formatDate(item.createdDate),
          avgRating: Number(item.averageRating || 0),
          totalRatings: Number(item.totalRatings || 0),
          commentCount: Number(item.commentCount || (Array.isArray(item.comments) ? item.comments.length : 0)),
          content: sanitizeText(item.content || '', 160)
        }));
        lastFetchTime = now;
        console.log(`[NONOPOST] Cached ${cachedPosts.length} posts successfully.`);
      }
    }
  } catch (err) {
    console.error('[NONOPOST] Fetch feed error:', err.message);
  }
  return cachedPosts;
}

async function getFeedSlice(startOffset = 0, count = 4) {
  const posts = await fetchFeed();
  const slice = posts.slice(startOffset, startOffset + count);
  return {
    total: posts.length,
    startOffset,
    posts: slice
  };
}

async function createPost({ authorName = '', content = '' }) {
  if (!authorName) authorName = getPersistentIdentity();
  authorName = sanitizeText(authorName, 20) || 'S2_User';
  content = content.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 500);

  console.log(`[NONOPOST] Creating post as "${authorName}": "${content.slice(0, 40)}..."`);
  try {
    const resp = await fetch(`${API_BASE}/api/Posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'S2-Homebrew-SDK/1.0'
      },
      body: JSON.stringify({ authorName, content }),
      signal: AbortSignal.timeout(15000)
    });

    console.log(`[NONOPOST] Create post response status: ${resp.status}`);
    if (resp.ok) {
      const data = await resp.json();
      // Invalidate cache and fetch fresh
      await fetchFeed(true);
      return { statusCode: resp.status, post: data };
    }
    return { statusCode: resp.status, post: null };
  } catch (err) {
    console.error('[NONOPOST] Create post error:', err.message);
    return { statusCode: 0, post: null, error: err.message };
  }
}

async function ratePost({ postIndex = 0, rating = 5, postId = '' }) {
  let targetId = postId;
  if (!targetId && cachedPosts[postIndex]) {
    targetId = cachedPosts[postIndex].id;
  }
  if (!targetId) {
    console.warn(`[NONOPOST] Rate target not found: index=${postIndex}`);
    return { statusCode: 404 };
  }

  rating = Math.max(1, Math.min(Number(rating) || 5, 10));
  console.log(`[NONOPOST] Rating post ${targetId} with score ${rating}...`);

  try {
    const resp = await fetch(`${API_BASE}/api/Posts/${targetId}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'S2-Homebrew-SDK/1.0'
      },
      body: String(rating),
      signal: AbortSignal.timeout(10000)
    });
    console.log(`[NONOPOST] Rate response status: ${resp.status}`);
    return { statusCode: resp.status };
  } catch (err) {
    console.error('[NONOPOST] Rate post error:', err.message);
    return { statusCode: 0, error: err.message };
  }
}

module.exports = {
  getPersistentIdentity,
  fetchFeed,
  getFeedSlice,
  createPost,
  ratePost
};
