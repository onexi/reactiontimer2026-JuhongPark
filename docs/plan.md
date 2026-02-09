# Technical Plan: Reaction Timer Application (Iteration 4)

## Overview
This iteration improves entertainment without sacrificing fairness:
- Add `Single` mode and `Multiple` mode with distinct pacing.
- Add progression systems (combo, points, level).
- Add session challenges to motivate repeated play.

### Project Statement Lock
- The `Project Statement` is immutable across project documentation.
- Planning updates must never alter the canonical statement text.

---

## 1. Goals for This Iteration

### Functional Goals
- Keep authenticated gameplay and SQLite-backed score integrity.
- Keep global leaderboard always visible.
- Keep personal ranking visible when authenticated.
- Split score and ranking views by mode (`Single`, `Multiple`).
- Add selectable modes:
  - `Single`: one reaction per run
  - `Multiple`: several reactions per run and sum-based scoring/ranking

### Engagement Goals
- Add progression metrics: combo, points, and level.
- Add live challenge objectives shown in UI.
- Provide immediate reward feedback after each valid round.

### Security & Fairness Goals
- Preserve server-authoritative reaction validation via `/api/submit`.
- Preserve anti-cheat controls: session ownership, single-use sessions, rate limiting.

---

## 2. Architecture Update

### Technology Stack
- Backend: Node.js + Express + SQLite
- Frontend: Vanilla HTML/CSS/JS SPA

### API Surface (unchanged in Iteration 4)
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `POST /api/start` (auth required)
- `POST /api/submit` (auth required)
- `GET /api/fastest`
- `GET /api/history` (auth required)
- `GET /api/leaderboard`

---

## 3. Gameplay Layer Design

### Modes
- `Single`: single reaction run with balanced pacing.
- `Multiple`: 3 sequential reactions in one run; run score is sum of attempts.

### Progression
- Combo increments on valid round, resets on failed round.
- Points are awarded from server-validated reaction time + mode multiplier + combo bonus.
- Level is derived from total points and displayed continuously.

### Challenges (Session Scoped)
- Land 3 rounds under 260 ms.
- Reach combo 5.
- Complete 10 valid rounds.

---

## 4. Frontend Flow (Iteration 4)

1. User logs in and chooses a mode.
2. User starts a round; client requests `/api/start`.
3. Trigger appears after mode-tuned delay.
4. Click submits to `/api/submit`.
5. On success:
   - update fastest data and rankings
   - update combo/points/level/challenges
   - refresh recent attempts
6. On failure:
   - reset combo and show clear feedback

---

## 5. Validation Targets

### Functional
- Mode switching changes pacing and labels.
- Progression metrics update after each successful round.
- Challenge status updates correctly.

### Integrity
- Leaderboard and personal rank still reflect server-validated scores only.
- Multiple-mode ranking is computed from completed run sums (not per-attempt averages).
- Client-only gamification does not alter persisted score fairness.

### UX
- Game HUD remains readable on desktop/mobile.
- Round feedback is immediate and understandable.
