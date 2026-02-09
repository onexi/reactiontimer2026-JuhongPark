const crypto = require('crypto');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const RATE_LIMIT_MS = 2000;
const MIN_REACTION_MS = 90;
const MAX_REACTION_MS = 5000;
const SESSION_TTL_MS = 15000;

const store = {
  sessions: new Map(),
  scores: [],
  audit: [],
  clientStartAt: new Map(),
  clientSubmitAt: new Map()
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getClientKey(req) {
  return req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip || 'unknown';
}

function cleanupExpiredSessions(now) {
  for (const [sessionId, session] of store.sessions.entries()) {
    if (session.status === 'active' && now - session.start_time > SESSION_TTL_MS) {
      session.status = 'expired';
      store.sessions.set(sessionId, session);
    }
  }
}

function getFastest() {
  if (store.scores.length === 0) return null;
  return store.scores.reduce((best, entry) => {
    return entry.reaction_time < best ? entry.reaction_time : best;
  }, Infinity);
}

app.get('/api/fastest', (req, res) => {
  res.json({
    fastest: getFastest(),
    attempts: store.scores.length
  });
});

app.post('/api/start', (req, res) => {
  const now = Date.now();
  cleanupExpiredSessions(now);

  const clientKey = getClientKey(req);
  const lastStart = store.clientStartAt.get(clientKey);
  if (lastStart && now - lastStart < RATE_LIMIT_MS) {
    const retryAfterMs = RATE_LIMIT_MS - (now - lastStart);
    return res.status(429).json({
      valid: false,
      message: 'Too many starts. Please wait before starting again.',
      retry_after_ms: retryAfterMs
    });
  }

  const sessionId = crypto.randomUUID();
  store.sessions.set(sessionId, {
    start_time: now,
    status: 'active',
    client_key: clientKey
  });
  store.clientStartAt.set(clientKey, now);

  store.audit.push({
    type: 'start',
    session_id: sessionId,
    timestamp: now,
    client_key: clientKey
  });

  return res.json({ session_id: sessionId });
});

app.post('/api/submit', (req, res) => {
  const now = Date.now();
  cleanupExpiredSessions(now);

  const clientKey = getClientKey(req);
  const lastSubmit = store.clientSubmitAt.get(clientKey);
  if (lastSubmit && now - lastSubmit < RATE_LIMIT_MS) {
    const retryAfterMs = RATE_LIMIT_MS - (now - lastSubmit);
    return res.status(429).json({
      valid: false,
      message: 'Submissions are rate-limited. Please wait before trying again.',
      retry_after_ms: retryAfterMs
    });
  }

  const { session_id: sessionId, reaction_time: reactionTime } = req.body || {};
  if (typeof sessionId !== 'string' || !Number.isFinite(reactionTime)) {
    return res.status(400).json({
      valid: false,
      message: 'Invalid payload. Provide session_id and reaction_time.'
    });
  }

  const roundedReaction = Math.round(reactionTime);
  const session = store.sessions.get(sessionId);

  if (!session) {
    return res.status(400).json({
      valid: false,
      message: 'Unknown session.'
    });
  }

  if (session.client_key !== clientKey) {
    return res.status(403).json({
      valid: false,
      message: 'Session ownership validation failed.'
    });
  }

  if (session.status !== 'active') {
    return res.status(400).json({
      valid: false,
      message: 'Session is not active or has already been used.'
    });
  }

  if (roundedReaction < MIN_REACTION_MS || roundedReaction > MAX_REACTION_MS) {
    session.status = 'rejected';
    store.sessions.set(sessionId, session);
    return res.status(400).json({
      valid: false,
      message: 'Reaction time failed validation.'
    });
  }

  session.status = 'submitted';
  store.sessions.set(sessionId, session);
  store.clientSubmitAt.set(clientKey, now);

  const score = {
    reaction_time: roundedReaction,
    timestamp: now,
    session_id: sessionId
  };
  store.scores.push(score);

  store.audit.push({
    type: 'submit',
    session_id: sessionId,
    reaction_time: roundedReaction,
    timestamp: now,
    client_key: clientKey
  });

  return res.json({
    valid: true,
    message: 'Reaction time recorded.',
    fastest: getFastest()
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Reaction Timer server is running at http://localhost:${PORT}`);
});
