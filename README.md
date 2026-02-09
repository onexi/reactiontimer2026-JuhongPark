# reactionTimer2026

## Project Statement
> "You need to develop a reaction timer app to test reaction times and record the fastest. You will need a server that serves up a web page. Think through how the timer is fair. Consider how to deal with someone who rapidly keeps clicking, or uses some other mechanism to cheat your system."

## Technical Framework
- Runtime & Server: Node.js + Express
- Architecture: Single Page Application (SPA) with vanilla HTML/CSS/JS

## Features Implemented
- Visual reaction timer with random trigger delay.
- Fastest score tracking served by the backend.
- Anti-cheat and fairness controls:
  - server-side sessions via `POST /api/start`
  - single-use session submission via `POST /api/submit`
  - per-client rate limiting (2 seconds) for starts/submissions
  - session ownership check (session tied to requesting client)
  - server timestamp audit logging of starts/submits
  - reaction-time validation range checks

## Project Structure
- `server.js`: Express server and API endpoints.
- `public/index.html`: SPA markup.
- `public/styles.css`: UI styling.
- `public/app.js`: Client-side timer flow and API calls.
- `docs/`: Prompt, plan, and evaluation documents.

## API Endpoints
- `POST /api/start`: Create a test session and return `{ session_id }`.
- `POST /api/submit`: Submit `{ session_id, reaction_time }` and receive validation result + fastest score.
- `GET /api/fastest`: Fetch `{ fastest, attempts }`.

## Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open:
   ```
   http://localhost:3000
   ```

## Notes
- Score data is stored in memory for this iteration and resets when the server restarts.
- Designed for iterative improvement toward persistence and richer anti-cheat in future iterations.
