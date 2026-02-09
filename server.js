const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const RATE_LIMIT_MS = 2000;
const MIN_REACTION_MS = 90;
const MAX_REACTION_MS = 5000;
const TEST_SESSION_TTL_MS = 15000;
const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const SCORE_MODES = new Set(['class', 'multiple']);

const DB_PATH = path.join(__dirname, 'data', 'reaction_timer.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new sqlite3.Database(DB_PATH);

const rateLimit = {
  start: new Map(),
  submit: new Map()
};

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      return resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      return resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      return resolve(rows);
    });
  });
}

async function initializeDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS test_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      trigger_time INTEGER NOT NULL,
      submit_time INTEGER,
      status TEXT NOT NULL,
      client_key TEXT NOT NULL,
      client_reaction_time INTEGER,
      server_reaction_time INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      test_session_id TEXT NOT NULL UNIQUE,
      reaction_time INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'class',
      run_id TEXT,
      run_total INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (test_session_id) REFERENCES test_sessions(id) ON DELETE CASCADE
    )
  `);

  const scoreColumns = await all('PRAGMA table_info(scores)');
  const columnNames = new Set(scoreColumns.map((col) => col.name));
  if (!columnNames.has('mode')) {
    await run("ALTER TABLE scores ADD COLUMN mode TEXT NOT NULL DEFAULT 'class'");
  }
  if (!columnNames.has('run_id')) {
    await run('ALTER TABLE scores ADD COLUMN run_id TEXT');
  }
  if (!columnNames.has('run_total')) {
    await run('ALTER TABLE scores ADD COLUMN run_total INTEGER NOT NULL DEFAULT 1');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id INTEGER,
      test_session_id TEXT,
      client_key TEXT,
      details TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_scores_user_created ON scores(user_id, created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_scores_mode_user ON scores(mode, user_id, created_at DESC)');
  await run('CREATE INDEX IF NOT EXISTS idx_scores_mode_run ON scores(mode, run_id, user_id)');
  await run('CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON test_sessions(user_id, status)');
  await run('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at)');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, storedHash) {
  const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function isValidUsername(username) {
  return typeof username === 'string' && /^[a-zA-Z0-9_]{3,24}$/.test(username);
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

function getClientKey(req) {
  return req.ip || 'unknown';
}

function checkRateLimit(bucket, key, now, windowMs) {
  const last = bucket.get(key);
  if (last && now - last < windowMs) {
    return windowMs - (now - last);
  }
  bucket.set(key, now);
  return 0;
}

function normalizeMode(inputMode) {
  const mode = typeof inputMode === 'string' ? inputMode.toLowerCase().trim() : 'class';
  return SCORE_MODES.has(mode) ? mode : 'class';
}

async function writeAudit({ eventType, userId = null, testSessionId = null, clientKey = null, details = null }) {
  await run(
    `INSERT INTO audit_logs (event_type, user_id, test_session_id, client_key, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [eventType, userId, testSessionId, clientKey, details, Date.now()]
  );
}

async function getAuthContext(req) {
  const token = req.cookies.sid;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const row = await get(
    `SELECT s.id AS session_id, s.user_id, s.expires_at, u.username
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`,
    [tokenHash]
  );

  if (!row) return null;

  if (row.expires_at < Date.now()) {
    await run('DELETE FROM auth_sessions WHERE id = ?', [row.session_id]);
    return null;
  }

  return {
    token,
    tokenHash,
    sessionId: row.session_id,
    user: {
      id: row.user_id,
      username: row.username
    }
  };
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

async function getLeaderboardPayload(mode, userId = null) {
  const normalizedMode = normalizeMode(mode);
  let leaderboardQuery = '';
  let personalQuery = '';

  if (normalizedMode === 'multiple') {
    leaderboardQuery = `
      WITH completed_runs AS (
        SELECT user_id, run_id, SUM(reaction_time) AS run_score, COUNT(*) AS run_count, MAX(run_total) AS run_total
        FROM scores
        WHERE mode = 'multiple' AND run_id IS NOT NULL
        GROUP BY user_id, run_id
        HAVING run_count = run_total
      ),
      user_best AS (
        SELECT u.id AS user_id, u.username, MIN(cr.run_score) AS best_time, COUNT(*) AS attempts
        FROM users u
        JOIN completed_runs cr ON cr.user_id = u.id
        GROUP BY u.id, u.username
      ),
      ranked AS (
        SELECT user_id, username, best_time, attempts, DENSE_RANK() OVER (ORDER BY best_time ASC) AS rank
        FROM user_best
      )
      SELECT rank, username, best_time, attempts
      FROM ranked
      ORDER BY rank ASC, username ASC
      LIMIT 5
    `;

    personalQuery = `
      WITH completed_runs AS (
        SELECT user_id, run_id, SUM(reaction_time) AS run_score, COUNT(*) AS run_count, MAX(run_total) AS run_total
        FROM scores
        WHERE mode = 'multiple' AND run_id IS NOT NULL
        GROUP BY user_id, run_id
        HAVING run_count = run_total
      ),
      user_best AS (
        SELECT u.id AS user_id, u.username, MIN(cr.run_score) AS best_time, COUNT(*) AS attempts
        FROM users u
        JOIN completed_runs cr ON cr.user_id = u.id
        GROUP BY u.id, u.username
      ),
      ranked AS (
        SELECT user_id, username, best_time, attempts, DENSE_RANK() OVER (ORDER BY best_time ASC) AS rank
        FROM user_best
      )
      SELECT rank, username, best_time, attempts
      FROM ranked
      WHERE user_id = ?
    `;
  } else {
    leaderboardQuery = `
      WITH user_best AS (
        SELECT u.id AS user_id, u.username, MIN(s.reaction_time) AS best_time, COUNT(*) AS attempts
        FROM users u
        JOIN scores s ON s.user_id = u.id
        WHERE s.mode = 'class'
        GROUP BY u.id, u.username
      ),
      ranked AS (
        SELECT user_id, username, best_time, attempts, DENSE_RANK() OVER (ORDER BY best_time ASC) AS rank
        FROM user_best
      )
      SELECT rank, username, best_time, attempts
      FROM ranked
      ORDER BY rank ASC, username ASC
      LIMIT 5
    `;

    personalQuery = `
      WITH user_best AS (
        SELECT u.id AS user_id, u.username, MIN(s.reaction_time) AS best_time, COUNT(*) AS attempts
        FROM users u
        JOIN scores s ON s.user_id = u.id
        WHERE s.mode = 'class'
        GROUP BY u.id, u.username
      ),
      ranked AS (
        SELECT user_id, username, best_time, attempts, DENSE_RANK() OVER (ORDER BY best_time ASC) AS rank
        FROM user_best
      )
      SELECT rank, username, best_time, attempts
      FROM ranked
      WHERE user_id = ?
    `;
  }

  const leaderboard = await all(leaderboardQuery);
  let personalRanking = null;
  if (userId) {
    personalRanking = await get(personalQuery, [userId]);
  }

  return {
    mode: normalizedMode,
    leaderboard,
    personal_ranking: personalRanking || null
  };
}

async function requireAuth(req, res, next) {
  const auth = await getAuthContext(req);
  if (!auth) {
    return res.status(401).json({ valid: false, message: 'Authentication required.' });
  }
  req.auth = auth;
  return next();
}

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/me', asyncHandler(async (req, res) => {
  const auth = await getAuthContext(req);
  if (!auth) {
    return res.json({ authenticated: false });
  }

  return res.json({
    authenticated: true,
    user: auth.user
  });
}));

app.post('/api/register', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};

  if (!isValidUsername(username) || !isValidPassword(password)) {
    return res.status(400).json({
      valid: false,
      message: 'Username must be 3-24 chars (letters/numbers/_), password must be 6-128 chars.'
    });
  }

  const { salt, hash } = hashPassword(password);

  try {
    await run(
      'INSERT INTO users (username, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?)',
      [username, salt, hash, Date.now()]
    );
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ valid: false, message: 'Username already exists.' });
    }
    throw error;
  }

  return res.status(201).json({ valid: true, message: 'Registration successful.' });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ valid: false, message: 'Username and password are required.' });
  }

  const user = await get(
    'SELECT id, username, password_salt, password_hash FROM users WHERE username = ?',
    [username]
  );

  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ valid: false, message: 'Invalid credentials.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  await run(
    'INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    [sessionId, user.id, tokenHash, now, now + AUTH_SESSION_TTL_MS]
  );

  res.cookie('sid', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: AUTH_SESSION_TTL_MS
  });

  await writeAudit({ eventType: 'login', userId: user.id, details: 'User logged in' });

  return res.json({
    valid: true,
    message: 'Login successful.',
    user: {
      id: user.id,
      username: user.username
    }
  });
}));

app.post('/api/logout', asyncHandler(async (req, res) => {
  const token = req.cookies.sid;
  if (token) {
    await run('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
  }

  res.clearCookie('sid');
  return res.json({ valid: true, message: 'Logged out.' });
}));

app.get('/api/fastest', asyncHandler(async (req, res) => {
  const auth = await getAuthContext(req);
  const mode = normalizeMode(req.query.mode);
  let global = null;
  let personal = { fastest: null, attempts: 0 };

  if (mode === 'multiple') {
    global = await get(
      `WITH completed_runs AS (
         SELECT run_id, SUM(reaction_time) AS run_score, COUNT(*) AS run_count, MAX(run_total) AS run_total
         FROM scores
         WHERE mode = 'multiple' AND run_id IS NOT NULL
         GROUP BY run_id
         HAVING run_count = run_total
       )
       SELECT MIN(run_score) AS fastest, COUNT(*) AS attempts
       FROM completed_runs`
    );

    if (auth) {
      personal = await get(
        `WITH completed_runs AS (
           SELECT run_id, SUM(reaction_time) AS run_score, COUNT(*) AS run_count, MAX(run_total) AS run_total
           FROM scores
           WHERE mode = 'multiple' AND user_id = ? AND run_id IS NOT NULL
           GROUP BY run_id
           HAVING run_count = run_total
         )
         SELECT MIN(run_score) AS fastest, COUNT(*) AS attempts
         FROM completed_runs`,
        [auth.user.id]
      ) || personal;
    }
  } else {
    global = await get("SELECT MIN(reaction_time) AS fastest, COUNT(*) AS attempts FROM scores WHERE mode = 'class'");
    if (auth) {
      personal = await get(
        "SELECT MIN(reaction_time) AS fastest, COUNT(*) AS attempts FROM scores WHERE user_id = ? AND mode = 'class'",
        [auth.user.id]
      ) || personal;
    }
  }

  return res.json({
    mode,
    global_fastest: global?.fastest ?? null,
    global_attempts: global?.attempts ?? 0,
    personal_fastest: personal?.fastest ?? null,
    personal_attempts: personal?.attempts ?? 0
  });
}));

app.get('/api/leaderboard', asyncHandler(async (req, res) => {
  const auth = await getAuthContext(req);
  const mode = normalizeMode(req.query.mode);
  const payload = await getLeaderboardPayload(mode, auth?.user?.id ?? null);
  return res.json(payload);
}));

app.get('/api/history', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const mode = normalizeMode(req.query.mode);
  let rows = [];
  if (mode === 'multiple') {
    rows = await all(
      `WITH completed_runs AS (
         SELECT run_id, SUM(reaction_time) AS reaction_time, MAX(created_at) AS created_at, COUNT(*) AS run_count, MAX(run_total) AS run_total
         FROM scores
         WHERE user_id = ? AND mode = 'multiple' AND run_id IS NOT NULL
         GROUP BY run_id
         HAVING run_count = run_total
       )
       SELECT reaction_time, created_at
       FROM completed_runs
       ORDER BY created_at DESC
       LIMIT 5`,
      [req.auth.user.id]
    );
  } else {
    rows = await all(
      `SELECT reaction_time, created_at
       FROM scores
       WHERE user_id = ? AND mode = 'class'
       ORDER BY created_at DESC
       LIMIT 5`,
      [req.auth.user.id]
    );
  }

  return res.json({
    mode,
    attempts: rows
  });
}));

app.post('/api/start', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const now = Date.now();
  const clientKey = getClientKey(req);
  const limiterKey = `${req.auth.user.id}:${clientKey}`;

  const retryAfterMs = checkRateLimit(rateLimit.start, limiterKey, now, RATE_LIMIT_MS);
  if (retryAfterMs > 0) {
    return res.status(429).json({
      valid: false,
      message: 'Too many starts. Please wait before starting again.',
      retry_after_ms: retryAfterMs
    });
  }

  const waitMs = 1200 + Math.floor(Math.random() * 2000);
  const sessionId = crypto.randomUUID();

  await run(
    `INSERT INTO test_sessions (id, user_id, start_time, trigger_time, status, client_key)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    [sessionId, req.auth.user.id, now, now + waitMs, clientKey]
  );

  await writeAudit({
    eventType: 'start',
    userId: req.auth.user.id,
    testSessionId: sessionId,
    clientKey,
    details: `wait_ms=${waitMs}`
  });

  return res.json({
    session_id: sessionId,
    wait_ms: waitMs
  });
}));

app.post('/api/submit', asyncHandler(requireAuth), asyncHandler(async (req, res) => {
  const now = Date.now();
  const clientKey = getClientKey(req);
  const limiterKey = `${req.auth.user.id}:${clientKey}`;

  const retryAfterMs = checkRateLimit(rateLimit.submit, limiterKey, now, RATE_LIMIT_MS);
  if (retryAfterMs > 0) {
    return res.status(429).json({
      valid: false,
      message: 'Submissions are rate-limited. Please wait before trying again.',
      retry_after_ms: retryAfterMs
    });
  }

  const {
    session_id: sessionId,
    reaction_time: clientReactionTime,
    mode: inputMode,
    run_id: runIdInput,
    run_total: runTotalInput
  } = req.body || {};
  if (typeof sessionId !== 'string') {
    return res.status(400).json({ valid: false, message: 'Invalid payload. session_id is required.' });
  }
  const mode = normalizeMode(inputMode);
  const runId = typeof runIdInput === 'string' && runIdInput.trim() ? runIdInput.trim() : null;
  const runTotal = Number.isInteger(runTotalInput) && runTotalInput > 0 ? runTotalInput : 1;
  if (mode === 'multiple' && (!runId || runTotal < 2)) {
    return res.status(400).json({ valid: false, message: 'Multiple mode requires run_id and run_total >= 2.' });
  }

  const testSession = await get(
    `SELECT id, user_id, start_time, trigger_time, status, client_key
     FROM test_sessions
     WHERE id = ? AND user_id = ?`,
    [sessionId, req.auth.user.id]
  );

  if (!testSession) {
    return res.status(400).json({ valid: false, message: 'Unknown session.' });
  }

  if (testSession.client_key !== clientKey) {
    return res.status(403).json({ valid: false, message: 'Session ownership validation failed.' });
  }

  if (testSession.status !== 'active') {
    return res.status(400).json({ valid: false, message: 'Session is not active or has already been used.' });
  }

  if (now - testSession.start_time > TEST_SESSION_TTL_MS) {
    await run('UPDATE test_sessions SET status = ? WHERE id = ?', ['expired', sessionId]);
    return res.status(400).json({ valid: false, message: 'Session expired. Start a new round.' });
  }

  if (now < testSession.trigger_time) {
    await run(
      `UPDATE test_sessions
       SET status = 'rejected', submit_time = ?, client_reaction_time = ?, server_reaction_time = ?
       WHERE id = ?`,
      [now, Number.isFinite(clientReactionTime) ? Math.round(clientReactionTime) : null, now - testSession.trigger_time, sessionId]
    );

    await writeAudit({
      eventType: 'premature_submit',
      userId: req.auth.user.id,
      testSessionId: sessionId,
      clientKey,
      details: 'Submitted before trigger time.'
    });

    return res.status(400).json({ valid: false, message: 'Too soon. Click only after the trigger.' });
  }

  const serverReaction = now - testSession.trigger_time;
  const roundedClient = Number.isFinite(clientReactionTime) ? Math.round(clientReactionTime) : null;

  if (serverReaction < MIN_REACTION_MS || serverReaction > MAX_REACTION_MS) {
    await run(
      `UPDATE test_sessions
       SET status = 'rejected', submit_time = ?, client_reaction_time = ?, server_reaction_time = ?
       WHERE id = ?`,
      [now, roundedClient, serverReaction, sessionId]
    );

    await writeAudit({
      eventType: 'failed_validation',
      userId: req.auth.user.id,
      testSessionId: sessionId,
      clientKey,
      details: `server_reaction=${serverReaction}`
    });

    return res.status(400).json({ valid: false, message: 'Reaction time failed validation.' });
  }

  await run(
    `UPDATE test_sessions
     SET status = 'submitted', submit_time = ?, client_reaction_time = ?, server_reaction_time = ?
     WHERE id = ?`,
    [now, roundedClient, serverReaction, sessionId]
  );

  await run(
    `INSERT INTO scores (user_id, test_session_id, reaction_time, mode, run_id, run_total, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.auth.user.id, sessionId, serverReaction, mode, runId, runTotal, now]
  );

  let personal = { fastest: null, attempts: 0 };
  let global = { fastest: null, attempts: 0 };
  if (mode === 'multiple') {
    personal = await get(
      `WITH completed_runs AS (
         SELECT run_id, SUM(reaction_time) AS run_score, COUNT(*) AS run_count, MAX(run_total) AS run_total
         FROM scores
         WHERE mode = 'multiple' AND user_id = ? AND run_id IS NOT NULL
         GROUP BY run_id
         HAVING run_count = run_total
       )
       SELECT MIN(run_score) AS fastest, COUNT(*) AS attempts
       FROM completed_runs`,
      [req.auth.user.id]
    ) || personal;

    global = await get(
      `WITH completed_runs AS (
         SELECT run_id, SUM(reaction_time) AS run_score, COUNT(*) AS run_count, MAX(run_total) AS run_total
         FROM scores
         WHERE mode = 'multiple' AND run_id IS NOT NULL
         GROUP BY run_id
         HAVING run_count = run_total
       )
       SELECT MIN(run_score) AS fastest, COUNT(*) AS attempts
       FROM completed_runs`
    ) || global;
  } else {
    personal = await get(
      "SELECT MIN(reaction_time) AS fastest, COUNT(*) AS attempts FROM scores WHERE user_id = ? AND mode = 'class'",
      [req.auth.user.id]
    ) || personal;
    global = await get(
      "SELECT MIN(reaction_time) AS fastest, COUNT(*) AS attempts FROM scores WHERE mode = 'class'"
    ) || global;
  }
  const rankings = await getLeaderboardPayload(mode, req.auth.user.id);

  await writeAudit({
    eventType: 'submit',
    userId: req.auth.user.id,
    testSessionId: sessionId,
    clientKey,
    details: `mode=${mode};run_id=${runId};run_total=${runTotal};server_reaction=${serverReaction};client_reaction=${roundedClient}`
  });

  return res.json({
    valid: true,
    message: 'Reaction time recorded.',
    mode,
    reaction_time: serverReaction,
    personal_fastest: personal?.fastest ?? null,
    personal_attempts: personal?.attempts ?? 0,
    global_fastest: global?.fastest ?? null,
    global_attempts: global?.attempts ?? 0,
    leaderboard: rankings.leaderboard,
    personal_ranking: rankings.personal_ranking
  });
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ valid: false, message: 'Internal server error.' });
});

initializeDb()
  .then(() => {
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Reaction Timer server is running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
