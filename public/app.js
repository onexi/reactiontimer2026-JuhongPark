const state = {
  isTesting: false,
  hasTriggered: false,
  triggerTime: null,
  fastestPersonal: null,
  fastestGlobal: null,
  currentTest: null,
  triggerTimerId: null,
  user: null
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
const historyList = document.getElementById('historyList');

function setArenaState(nextState, label) {
  arena.classList.remove('waiting', 'ready', 'go', 'penalty');
  if (nextState) arena.classList.add(nextState);
  arenaLabel.textContent = label;
}

function resetRound() {
  state.isTesting = false;
  state.hasTriggered = false;
  state.triggerTime = null;
  state.currentTest = null;
  if (state.triggerTimerId) {
    clearTimeout(state.triggerTimerId);
    state.triggerTimerId = null;
  }
  startBtn.disabled = !state.user;
  arena.disabled = !state.user;
  setArenaState(state.user ? 'ready' : null, state.user ? 'Press Start' : 'Login to play');
}

function updateScoreboard(payload) {
  state.fastestGlobal = Number.isFinite(payload?.global_fastest) ? payload.global_fastest : null;
  state.fastestPersonal = Number.isFinite(payload?.personal_fastest) ? payload.personal_fastest : null;

  personalFastestLine.textContent =
    state.fastestPersonal === null
      ? 'Personal Fastest: -'
      : `Personal Fastest: ${state.fastestPersonal} ms`;

  globalFastestLine.textContent =
    state.fastestGlobal === null
      ? 'Global Fastest: -'
      : `Global Fastest: ${state.fastestGlobal} ms`;
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

function setAuthUi() {
  const loggedIn = Boolean(state.user);
  authForms.classList.toggle('hidden', loggedIn);
  userPanel.classList.toggle('hidden', !loggedIn);

  if (loggedIn) {
    userLine.textContent = `Logged in as ${state.user.username}`;
    startBtn.disabled = false;
    arena.disabled = false;
    setArenaState('ready', 'Press Start');
  } else {
    startBtn.disabled = true;
    arena.disabled = true;
    currentLine.textContent = 'Current: -';
    setArenaState(null, 'Login to play');
    renderHistory([]);
  }
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
    const message = payload.message || 'Request failed.';
    throw new Error(message);
  }

  return payload;
}

async function refreshFastest() {
  try {
    const payload = await apiJson('/api/fastest', { method: 'GET' });
    updateScoreboard(payload);
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function refreshHistory() {
  if (!state.user) {
    renderHistory([]);
    return;
  }

  try {
    const payload = await apiJson('/api/history', { method: 'GET' });
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
      await Promise.all([refreshFastest(), refreshHistory()]);
    } else {
      updateScoreboard({});
      statusLine.textContent = 'Status: Please login.';
    }
  } catch (error) {
    state.user = null;
    setAuthUi();
    statusLine.textContent = `Status: ${error.message}`;
  }
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
    await Promise.all([refreshFastest(), refreshHistory()]);
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function onLogout() {
  try {
    await apiJson('/api/logout', { method: 'POST' });
    state.user = null;
    resetRound();
    setAuthUi();
    updateScoreboard({});
    statusLine.textContent = 'Status: Logged out.';
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function startTest() {
  if (!state.user || state.isTesting) return;

  startBtn.disabled = true;
  currentLine.textContent = 'Current: -';
  statusLine.textContent = 'Status: Requesting session...';

  try {
    const payload = await apiJson('/api/start', { method: 'POST' });

    state.currentTest = payload.session_id;
    state.isTesting = true;
    state.hasTriggered = false;
    setArenaState('waiting', 'Wait for green...');
    statusLine.textContent = 'Status: Wait for the trigger.';

    const delayMs = Number.isFinite(payload.wait_ms) ? payload.wait_ms : 1200;
    state.triggerTimerId = setTimeout(() => {
      state.hasTriggered = true;
      state.triggerTime = performance.now();
      setArenaState('go', 'CLICK!');
      statusLine.textContent = 'Status: Click now!';
    }, delayMs);
  } catch (error) {
    startBtn.disabled = false;
    setArenaState('ready', 'Press Start');
    statusLine.textContent = `Status: ${error.message}`;
  }
}

async function submitScore(clientReactionMs) {
  if (!state.currentTest) return;

  statusLine.textContent = 'Status: Submitting score...';
  try {
    const payload = await apiJson('/api/submit', {
      method: 'POST',
      body: JSON.stringify({
        session_id: state.currentTest,
        reaction_time: clientReactionMs
      })
    });

    currentLine.textContent = `Current: ${payload.reaction_time} ms (server)`;
    statusLine.textContent = 'Status: Round recorded.';
    updateScoreboard(payload);
    await refreshHistory();
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

registerBtn.addEventListener('click', onRegister);
loginBtn.addEventListener('click', onLogin);
logoutBtn.addEventListener('click', onLogout);
startBtn.addEventListener('click', startTest);

arena.addEventListener('click', async () => {
  if (!state.user || !state.isTesting) return;

  if (!state.hasTriggered) {
    setArenaState('penalty', 'Too soon! Round failed.');
    statusLine.textContent = 'Status: Premature click. Start again.';
    currentLine.textContent = 'Current: Failed (too soon)';
    resetRound();
    return;
  }

  const reactionMs = Math.round(performance.now() - state.triggerTime);
  setArenaState('ready', `${reactionMs} ms`);
  await submitScore(reactionMs);
  resetRound();
});

setArenaState(null, 'Login to play');
refreshAuth();
