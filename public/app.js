const MODES = {
  class: {
    label: 'Single',
    hint: 'One reaction in one run (single score shown).',
    delayMin: 1200,
    delaySpan: 2000,
    multiplier: 1,
    bonusThreshold: 260,
    attempts: 1,
    interAttemptMs: 0
  },
  multiple: {
    label: 'Multiple',
    hint: 'Three sequential reactions in one run (sum score shown).',
    delayMin: 2100,
    delaySpan: 1400,
    multiplier: 1.2,
    bonusThreshold: 300,
    attempts: 3,
    interAttemptMs: 3000
  }
};

const state = {
  isTesting: false,
  hasTriggered: false,
  triggerTime: null,
  fastestPersonal: null,
  fastestGlobal: null,
  currentTest: null,
  triggerTimerId: null,
  nextAttemptTimerId: null,
  user: null,
  leaderboard: [],
  personalRanking: null,
  mode: 'class',
  sequence: {
    total: 1,
    index: 0,
    reactions: []
  },
  currentRunId: null
};

const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const registerBtn = document.getElementById('registerBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authForms = document.getElementById('authForms');
const userPanel = document.getElementById('userPanel');
const userLine = document.getElementById('userLine');

const startBtn = document.getElementById('startBtn');
const arena = document.getElementById('arena');
const arenaLabel = document.getElementById('arenaLabel');
const statusLine = document.getElementById('statusLine');
const currentLine = document.getElementById('currentLine');
const personalFastestLine = document.getElementById('personalFastestLine');
const globalFastestLine = document.getElementById('globalFastestLine');

const modeSelect = document.getElementById('modeSelect');
const modeHint = document.getElementById('modeHint');

const leaderboardList = document.getElementById('leaderboardList');
const personalRankSection = document.getElementById('personalRankSection');
const personalRankLine = document.getElementById('personalRankLine');
const historyList = document.getElementById('historyList');

function clearTimers() {
  if (state.triggerTimerId) {
    clearTimeout(state.triggerTimerId);
    state.triggerTimerId = null;
  }
  if (state.nextAttemptTimerId) {
    clearTimeout(state.nextAttemptTimerId);
    state.nextAttemptTimerId = null;
  }
}

function setArenaState(nextState, label) {
  arena.classList.remove('waiting', 'ready', 'go', 'penalty', 'nice');
  if (nextState) arena.classList.add(nextState);
  arenaLabel.textContent = label;
}

function updateModeUi() {
  const modeConfig = MODES[state.mode];
  modeHint.textContent = `${modeConfig.label}: ${modeConfig.hint}`;
}

function resetSequence() {
  state.sequence.total = 1;
  state.sequence.index = 0;
  state.sequence.reactions = [];
  state.currentRunId = null;
}

function resetRound() {
  state.isTesting = false;
  state.hasTriggered = false;
  state.triggerTime = null;
  state.currentTest = null;
  clearTimers();
  resetSequence();

  const loggedIn = Boolean(state.user);
  startBtn.disabled = !loggedIn;
  arena.disabled = !loggedIn;
  modeSelect.disabled = false;
  setArenaState(loggedIn ? 'ready' : null, loggedIn ? 'Press Start' : 'Login to play');
}

function updateScoreboard(payload) {
  state.fastestGlobal = Number.isFinite(payload?.global_fastest) ? payload.global_fastest : null;
  state.fastestPersonal = Number.isFinite(payload?.personal_fastest) ? payload.personal_fastest : null;
  const unit = state.mode === 'multiple' ? 'sum ms' : 'ms';

  personalFastestLine.textContent =
    state.fastestPersonal === null
      ? 'Personal Fastest: -'
      : `Personal Fastest: ${state.fastestPersonal} ${unit}`;

  globalFastestLine.textContent =
    state.fastestGlobal === null
      ? 'Global Fastest: -'
      : `Global Fastest: ${state.fastestGlobal} ${unit}`;
}

function renderHistory(attempts) {
  historyList.innerHTML = '';
  if (!attempts || attempts.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No attempts yet.';
    historyList.appendChild(li);
    return;
  }

  attempts.forEach((attempt) => {
    const li = document.createElement('li');
    const date = new Date(attempt.created_at).toLocaleString();
    li.textContent = `${attempt.reaction_time} ms (${date})`;
    historyList.appendChild(li);
  });
}

function renderLeaderboard(entries) {
  leaderboardList.innerHTML = '';
  if (!entries || entries.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No rankings yet.';
    leaderboardList.appendChild(li);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `#${entry.rank} ${entry.username} - ${entry.best_time} ms (${entry.attempts} attempts)`;
    leaderboardList.appendChild(li);
  });
}

function renderPersonalRanking(ranking) {
  if (!state.user) {
    personalRankSection.classList.add('hidden');
    personalRankLine.textContent = 'Login to view your ranking.';
    return;
  }

  personalRankSection.classList.remove('hidden');
  if (!ranking) {
    personalRankLine.textContent = 'No ranked score yet. Complete a valid round to enter ranking.';
    return;
  }

  personalRankLine.textContent = `Rank #${ranking.rank} - Best ${ranking.best_time} ms across ${ranking.attempts} attempts`;
}

function setAuthUi() {
  const loggedIn = Boolean(state.user);
  authForms.classList.toggle('hidden', loggedIn);
  userPanel.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    userLine.textContent = `Logged in as ${state.user.username}`;
  } else {
    currentLine.textContent = 'Current: -';
    renderHistory([]);
    renderPersonalRanking(null);
  }

  resetRound();
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

async function refreshFastest() {
  try {
    const payload = await apiJson(`/api/fastest?mode=${encodeURIComponent(state.mode)}`, { method: 'GET' });
    updateScoreboard(payload);
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function refreshLeaderboard() {
  try {
    const payload = await apiJson(`/api/leaderboard?mode=${encodeURIComponent(state.mode)}`, { method: 'GET' });
    state.leaderboard = Array.isArray(payload.leaderboard) ? payload.leaderboard : [];
    state.personalRanking = payload.personal_ranking || null;
    renderLeaderboard(state.leaderboard);
    renderPersonalRanking(state.personalRanking);
  } catch (error) {
    renderLeaderboard([]);
    renderPersonalRanking(null);
  }
}

async function refreshHistory() {
  if (!state.user) {
    renderHistory([]);
    return;
  }

  try {
    const payload = await apiJson(`/api/history?mode=${encodeURIComponent(state.mode)}`, { method: 'GET' });
    renderHistory(payload.attempts);
  } catch (error) {
    renderHistory([]);
  }
}

async function refreshAuth() {
  try {
    const payload = await apiJson('/api/me', { method: 'GET' });
    state.user = payload.authenticated ? payload.user : null;
    setAuthUi();

    if (state.user) {
      statusLine.textContent = `Status: Welcome, ${state.user.username}.`;
      await Promise.all([refreshFastest(), refreshHistory(), refreshLeaderboard()]);
    } else {
      updateScoreboard({});
      statusLine.textContent = 'Status: Please login.';
      await refreshLeaderboard();
    }
  } catch (error) {
    state.user = null;
    setAuthUi();
    statusLine.textContent = `Status: ${error.message}`;
    await refreshLeaderboard();
  }
}

function getRoundDelayMs() {
  const modeConfig = MODES[state.mode];
  return modeConfig.delayMin + Math.floor(Math.random() * modeConfig.delaySpan);
}

function onRoundFailed(message, label) {
  setArenaState('penalty', label || 'Round failed');
  statusLine.textContent = `Status: ${message}`;
  setTimeout(() => {
    resetRound();
  }, 1200);
}

async function onRegister() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const payload = await apiJson('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    statusLine.textContent = `Status: ${payload.message} Now login.`;
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function onLogin() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const payload = await apiJson('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    state.user = payload.user;
    usernameInput.value = '';
    passwordInput.value = '';
    setAuthUi();
    statusLine.textContent = `Status: Logged in as ${state.user.username}.`;
    await Promise.all([refreshFastest(), refreshHistory(), refreshLeaderboard()]);
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function onLogout() {
  try {
    await apiJson('/api/logout', { method: 'POST' });
    state.user = null;
    setAuthUi();
    updateScoreboard({});
    statusLine.textContent = 'Status: Logged out.';
    await refreshLeaderboard();
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function beginAttempt() {
  const modeConfig = MODES[state.mode];
  const attemptNum = state.sequence.index + 1;
  const showAttemptFraction = state.sequence.total > 1;
  const attemptText = showAttemptFraction ? `${attemptNum}/${state.sequence.total}` : '';

  statusLine.textContent = showAttemptFraction
    ? `Status: Preparing attempt ${attemptText}...`
    : 'Status: Preparing round...';

  const payload = await apiJson('/api/start', { method: 'POST' });
  state.currentTest = payload.session_id;
  state.hasTriggered = false;
  state.triggerTime = null;

  setArenaState('waiting', showAttemptFraction ? `${modeConfig.label} ${attemptText}: wait...` : `${modeConfig.label}: wait...`);

  const delayMs = getRoundDelayMs();
  state.triggerTimerId = setTimeout(() => {
    state.hasTriggered = true;
    state.triggerTime = performance.now();
    setArenaState('go', showAttemptFraction ? `Attempt ${attemptText}: CLICK!` : 'CLICK!');
    statusLine.textContent = showAttemptFraction
      ? `Status: Attempt ${attemptText} - click now!`
      : 'Status: Click now!';
  }, delayMs);
}

async function startTest() {
  if (!state.user || state.isTesting) return;

  state.isTesting = true;
  state.sequence.total = MODES[state.mode].attempts;
  state.sequence.index = 0;
  state.sequence.reactions = [];
  state.currentRunId = state.mode === 'multiple' ? crypto.randomUUID() : null;

  startBtn.disabled = true;
  arena.disabled = false;
  modeSelect.disabled = true;
  currentLine.textContent = 'Current: -';

  try {
    await beginAttempt();
  } catch (error) {
    onRoundFailed(error.message, 'Start failed');
  }
}

async function submitScore(clientReactionMs) {
  if (!state.currentTest) return null;

  const payload = await apiJson('/api/submit', {
    method: 'POST',
    body: JSON.stringify({
      session_id: state.currentTest,
      reaction_time: clientReactionMs,
      mode: state.mode,
      run_id: state.currentRunId,
      run_total: state.sequence.total
    })
  });

  updateScoreboard(payload);
  state.leaderboard = Array.isArray(payload.leaderboard) ? payload.leaderboard : state.leaderboard;
  state.personalRanking = payload.personal_ranking || state.personalRanking;
  renderLeaderboard(state.leaderboard);
  renderPersonalRanking(state.personalRanking);

  await refreshHistory();

  statusLine.textContent = 'Status: Attempt recorded.';
  return payload.reaction_time;
}

registerBtn.addEventListener('click', onRegister);
loginBtn.addEventListener('click', onLogin);
logoutBtn.addEventListener('click', onLogout);
startBtn.addEventListener('click', startTest);

modeSelect.addEventListener('change', () => {
  if (!state.isTesting && MODES[modeSelect.value]) {
    state.mode = modeSelect.value;
    updateModeUi();
    if (state.user) {
      Promise.all([refreshFastest(), refreshHistory(), refreshLeaderboard()]);
    } else {
      updateScoreboard({});
      refreshLeaderboard();
    }
  }
});

arena.addEventListener('click', async () => {
  if (!state.user || !state.isTesting) return;

  if (!state.hasTriggered) {
    currentLine.textContent = 'Current: Failed (too soon)';
    onRoundFailed('Premature click. Start again.', 'Too soon!');
    return;
  }

  const reactionMs = Math.round(performance.now() - state.triggerTime);
  state.hasTriggered = false;
  if (state.triggerTimerId) {
    clearTimeout(state.triggerTimerId);
    state.triggerTimerId = null;
  }

  try {
    const serverReaction = await submitScore(reactionMs);
    if (!Number.isFinite(serverReaction)) {
      onRoundFailed('Submission failed.', 'Round failed');
      return;
    }

    state.sequence.reactions.push(serverReaction);
    state.sequence.index += 1;

    if (state.sequence.index >= state.sequence.total) {
      const total = state.sequence.reactions.reduce((sum, value) => sum + value, 0);
      const best = Math.min(...state.sequence.reactions);
      currentLine.textContent =
        state.sequence.total === 1
          ? `Current: ${serverReaction} ms (server)`
          : `Current Set: sum ${total} ms, best ${best} ms`;
      statusLine.textContent = `Status: ${MODES[state.mode].label} run complete.`;
      setArenaState('ready', 'Run complete. Press Start for next run');
      setTimeout(() => {
        resetRound();
      }, 1800);
      return;
    }

    currentLine.textContent = `Current Attempt: ${serverReaction} ms`;
    setArenaState('nice', `Nice. Next attempt ${state.sequence.index + 1}/${state.sequence.total}...`);
    const nextDelay = MODES[state.mode].interAttemptMs;
    state.nextAttemptTimerId = setTimeout(async () => {
      try {
        await beginAttempt();
      } catch (error) {
        onRoundFailed(error.message, 'Next attempt failed');
      }
    }, nextDelay);
  } catch (error) {
    onRoundFailed(error.message, 'Submit failed');
  }
});

updateModeUi();
setArenaState(null, 'Login to play');
refreshAuth();
