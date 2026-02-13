# reactionTimer2026

## Project Statement
> "You need to develop a reaction timer app to test reaction times and record the fastest. You will need a server that serves up a web page. Think through how the timer is “fair”. Consider how to deal with someone who rapidly keeps clicking, or uses some other mechanism to “cheat” your system."

## Project Statement Policy
- The `Project Statement` section is immutable.
- Do not edit, paraphrase, shorten, or expand the statement text in any project file.
- If copied to another file, it must remain verbatim.

## Project Statement Alignment
- "develop a reaction timer app to test reaction times and record the fastest":
  - The app measures reaction rounds and stores fastest records in SQLite.
- "You will need a server that serves up a web page":
  - Node.js + Express serves the SPA from `public/` and provides gameplay/auth APIs.
- "Think through how the timer is fair":
  - Timing validation is server-authoritative: trigger window is set on `/api/start`, accepted reaction time is computed on `/api/submit`.
- "deal with someone who rapidly keeps clicking ... or uses some other mechanism to cheat":
  - Anti-cheat controls include rate limiting, single-use test sessions, session ownership checks, and validation/expiry bounds.

## Technical Framework
- Runtime & Server: Node.js + Express
- Architecture: Single Page Application (SPA) with vanilla HTML/CSS/JS
- Data Layer: SQLite (`data/reaction_timer.db`)
- Authentication: Register/Login/Logout with HTTP-only cookie sessions

## Features
- Account or guest gameplay (players can login or start a guest session).
- SQLite persistence for users, auth sessions, test sessions, scores, and audit logs.
- Server-authoritative reaction validation:
  - server sets trigger window on `/api/start`
  - server computes accepted reaction time on `/api/submit`
- Anti-cheat controls:
  - rate limiting for starts/submissions
  - single-use test sessions
  - session ownership checks
  - expiry and validation bounds
- Ranking and score views:
  - mode-separated personal/global fastest
  - global leaderboard (always visible)
  - personal ranking (shown when logged in)
  - mode-separated recent history
  - `Multiple` mode ranking/score is based on sum of attempts in a run
- Fun layer:
  - mode selection (`Single`, `Multiple`)
  - multiple mode runs several reaction attempts in one run
  - combo, points, and level progression
  - live challenge tracker for session goals

## Project Structure
- `server.js`: Express API + SQLite initialization + auth/game logic
- `public/index.html`: SPA markup including auth/game UI
- `public/styles.css`: UI styling
- `public/app.js`: client-side auth and reaction flow
- `data/`: runtime SQLite database directory
- `docs/`: planning/evaluation documents

## API Endpoints
- Auth
  - `POST /api/register`
  - `POST /api/login`
  - `POST /api/guest`
  - `POST /api/logout`
  - `GET /api/me`
- Gameplay
  - `POST /api/start` (auth required)
  - `POST /api/submit` (auth required)
  - `GET /api/fastest?mode=class|multiple`
  - `GET /api/leaderboard?mode=class|multiple`
  - `GET /api/history?mode=class|multiple` (auth required)

## Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start server:
   ```bash
   npm start
   ```
3. Open app:
   ```
   http://localhost:3000
   ```

## Notes
- SQLite DB files are runtime artifacts and are git-ignored.
- Current session cookie is configured for local development (`secure: false`); set secure cookies for HTTPS production.
