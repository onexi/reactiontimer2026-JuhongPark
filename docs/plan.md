# Technical Plan: Reaction Timer Application (Iteration 5)

## Overview
This iteration follows Loop 5 evaluation by hardening guest-mode fairness and improving verification quality:
- Add anti-abuse controls for guest session creation.
- Preserve server-authoritative timing and validate trigger-sync behavior.
- Prepare measurable quality gates for API integrity and performance.

### Project Statement Lock
- The `Project Statement` is immutable across project documentation.
- Planning updates must never alter the canonical statement text.

---

## 1. Goals for This Iteration

### Functional Goals
- Keep account and guest gameplay flows available.
- Keep global leaderboard always visible.
- Keep personal ranking visible for authenticated users (including guests).
- Preserve mode support (`Single`, `Multiple`) without layout shift.

### Security & Fairness Goals
- Keep server-authoritative reaction validation on `/api/submit`.
- Keep premature-click rejection and session ownership checks.
- Add guest abuse controls to reduce disposable account spam:
  - short-window guest creation rate limit per client key
  - daily guest creation cap per client key based on audit trail

### Quality Goals
- Define API checks for guest lifecycle and trigger-sync invariants.
- Keep UI theme/course identity updates without regressing responsiveness.

---

## 2. Architecture Update

### Technology Stack
- Backend: Node.js + Express + SQLite
- Frontend: Vanilla HTML/CSS/JS SPA

### API Surface (Iteration 5)
- `POST /api/register`
- `POST /api/login`
- `POST /api/guest`
- `POST /api/logout`
- `GET /api/me`
- `POST /api/start` (auth required)
- `POST /api/submit` (auth required)
- `GET /api/fastest`
- `GET /api/history` (auth required)
- `GET /api/leaderboard`

---

## 3. Implementation Plan

### 3.1 Guest Abuse Mitigation (Primary)
- Add guest-creation cooldown using in-memory limiter keyed by client key.
- Enforce 24-hour guest creation cap using `audit_logs` (`guest_login` events).
- Audit blocked guest creation attempts for reviewability.

### 3.2 Timing Integrity Safeguard
- Preserve `/api/start` authoritative `wait_ms` response.
- Ensure client trigger UI uses server-returned `wait_ms`.

### 3.3 Verification Hooks
- Add/define test scenarios for:
  - `/api/guest` success path and cookie session creation
  - repeated `/api/guest` calls within cooldown window -> `429`
  - over daily cap -> `429`
  - `/api/start` `wait_ms` and `/api/submit` premature/valid boundaries

---

## 4. Validation Targets

### Functional
- Guest mode starts gameplay without manual login.
- Existing login/logout behavior remains stable.
- Single/Multiple mode flows remain unchanged.

### Integrity
- Premature submit is still rejected server-side.
- Guest creation is constrained by cooldown and daily cap.
- Score persistence and ranking remain server-authoritative.

### UX/Performance
- Course-themed UI remains responsive on desktop/mobile.
- No additional heavy frontend assets are introduced.
- Lighthouse/INP/LCP capture is queued for runnable measurement environment.
