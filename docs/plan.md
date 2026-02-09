# Technical Plan: Reaction Timer Application (Iteration 2)

## Overview
This plan updates the architecture based on Loop 1 evaluation outcomes. The key changes are:
- Add account-based access with login/logout.
- Move persistence from memory to SQLite.
- Harden fairness by shifting timing authority to the server.

### Project Statement Lock
- The `Project Statement` is immutable across project documentation.
- Planning updates must never alter the canonical statement text.

---

## 1. Goals for This Iteration

### Functional Goals
- Require authentication before a user can play.
- Support register, login, logout, and authenticated session restore.
- Persist all users, sessions, scores, and audit logs in SQLite.
- Display personal fastest, global fastest, and recent attempt history.

### Security & Fairness Goals
- Reduce trust in client-reported reaction times.
- Keep anti-spam/rate-limit protections.
- Enforce single-use test sessions and strict ownership.

---

## 2. Updated Architecture

### Technology Stack
- Backend: Node.js + Express
- Frontend: Vanilla HTML/CSS/JS (SPA)
- Database: SQLite (`sqlite3`)
- Auth Transport: HTTP-only cookie session token

### Project Structure
```
/
├── server.js              # Express app + DB-backed API
├── data/
│   └── reaction_timer.db  # SQLite database (runtime file)
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── docs/
│   ├── prompt.md
│   ├── evaluators.md
│   ├── plan.md
│   └── evaluation.md
└── README.md
```

---

## 3. Database Design (SQLite)

### `users`
- `id` (PK)
- `username` (UNIQUE)
- `password_salt`
- `password_hash`
- `created_at`

### `auth_sessions`
- `id` (PK)
- `user_id` (FK -> users)
- `token_hash` (UNIQUE)
- `created_at`
- `expires_at`

### `test_sessions`
- `id` (PK)
- `user_id` (FK -> users)
- `start_time`
- `trigger_time` (server-generated)
- `submit_time`
- `status` (`active|submitted|rejected|expired`)
- `client_key`
- `client_reaction_time`
- `server_reaction_time`

### `scores`
- `id` (PK)
- `user_id` (FK -> users)
- `test_session_id` (UNIQUE FK -> test_sessions)
- `reaction_time`
- `created_at`

### `audit_logs`
- `id` (PK)
- `event_type`
- `user_id`
- `test_session_id`
- `client_key`
- `details`
- `created_at`

---

## 4. API Design (Iteration 2)

### Auth Endpoints
- `POST /api/register`
  - Body: `{ username, password }`
- `POST /api/login`
  - Body: `{ username, password }`
  - Sets session cookie
- `POST /api/logout`
  - Clears session cookie and DB session row
- `GET /api/me`
  - Returns auth state and current user

### Gameplay Endpoints
- `POST /api/start` (auth required)
  - Creates a DB-backed test session
  - Server decides `wait_ms` and `trigger_time`
- `POST /api/submit` (auth required)
  - Body: `{ session_id, reaction_time }`
  - Uses server clock as authority for accepted score
  - Stores validated score in SQLite
- `GET /api/fastest`
  - Returns global fastest and personal fastest (if authenticated)
- `GET /api/history` (auth required)
  - Returns recent attempts for logged-in user

---

## 5. Fairness & Anti-Cheat Strategy (Updated)

### Server-Timed Validation
- `trigger_time` is generated server-side during `/api/start`.
- On `/api/submit`, accepted reaction is `server_now - trigger_time`.
- Client-reported time is stored only for audit comparison.

### Session Integrity
- A test session belongs to one authenticated user.
- Session can be submitted only once.
- Session expires after short TTL.

### Rate Limiting
- Enforce minimum interval between starts and submissions.
- Rate limit key combines user + client source.

### Auditability
- Persist start/login/submit/reject events with timestamps.
- Keep enough detail to inspect suspicious behavior.

---

## 6. Frontend Flow (Updated)

1. User registers/logs in.
2. Client calls `/api/me`, `/api/fastest`, and `/api/history`.
3. Start click calls `/api/start` and receives `wait_ms`.
4. UI shows trigger after `wait_ms`.
5. Click submit calls `/api/submit`.
6. UI displays server-validated reaction time, fastest stats, and recent history.

---

## 7. Testing Plan

### Functional
- Register/login/logout works.
- Auth-gated endpoints reject unauthenticated access.
- Scores persist across server restarts.

### Anti-Cheat
- Premature submit rejected.
- Duplicate submit rejected.
- Rapid start/submit calls are rate limited.

### Data Integrity
- One score per valid test session.
- Personal/global fastest queries return consistent values.

---

## 8. Next Evaluation Targets
- Architect: verify stable startup with DB init and no runtime regressions.
- Referee: confirm reduced trust in client timing and persistent audit trails.
- Performance: check Lighthouse after auth UI + DB API flow.
- Gamer: measure engagement impact from account identity and score history.
