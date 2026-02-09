const state = {
  isTesting: false,
  hasTriggered: false,
  triggerTime: null,
  fastest: null,
  currentTest: null,
  triggerTimerId: null
};

const startBtn = document.getElementById('startBtn');
const arena = document.getElementById('arena');
const arenaLabel = document.getElementById('arenaLabel');
const statusLine = document.getElementById('statusLine');
const currentLine = document.getElementById('currentLine');
const fastestLine = document.getElementById('fastestLine');

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
  startBtn.disabled = false;
  setArenaState('ready', 'Press Start');
}

function updateFastest(value) {
  state.fastest = Number.isFinite(value) ? value : null;
  fastestLine.textContent = state.fastest === null ? 'Fastest: -' : `Fastest: ${state.fastest} ms`;
}

async function loadFastest() {
  try {
    const response = await fetch('/api/fastest');
    const payload = await response.json();
    updateFastest(payload.fastest);
  } catch (error) {
    statusLine.textContent = 'Status: Could not load fastest score.';
  }
}

async function startTest() {
  if (state.isTesting) return;
  startBtn.disabled = true;
  currentLine.textContent = 'Current: -';
  statusLine.textContent = 'Status: Requesting session...';

  try {
    const response = await fetch('/api/start', { method: 'POST' });
    const payload = await response.json();
    if (!response.ok || !payload.session_id) {
      throw new Error(payload.message || 'Failed to start test.');
    }

    state.currentTest = payload.session_id;
    state.isTesting = true;
    state.hasTriggered = false;
    setArenaState('waiting', 'Wait for green...');
    statusLine.textContent = 'Status: Wait for the trigger.';

    const delayMs = 1200 + Math.floor(Math.random() * 2000);
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

async function submitScore(reactionMs) {
  if (!state.currentTest) return;
  statusLine.textContent = 'Status: Submitting score...';
  try {
    const response = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: state.currentTest,
        reaction_time: reactionMs
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.valid) {
      throw new Error(payload.message || 'Submission failed.');
    }

    statusLine.textContent = 'Status: Round recorded.';
    updateFastest(payload.fastest);
  } catch (error) {
    statusLine.textContent = `Status: ${error.message}`;
  }
}

startBtn.addEventListener('click', () => {
  startTest();
});

arena.addEventListener('click', async () => {
  if (!state.isTesting) return;

  if (!state.hasTriggered) {
    setArenaState('penalty', 'Too soon! Round failed.');
    statusLine.textContent = 'Status: Premature click. Start again.';
    currentLine.textContent = 'Current: Failed (too soon)';
    resetRound();
    return;
  }

  const reactionMs = Math.round(performance.now() - state.triggerTime);
  currentLine.textContent = `Current: ${reactionMs} ms`;
  setArenaState('ready', `${reactionMs} ms`);
  await submitScore(reactionMs);
  resetRound();
});

setArenaState('ready', 'Press Start');
loadFastest();
