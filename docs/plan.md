# Technical Plan: Reaction Timer Application

## Overview
This document outlines the technical architecture, anti-cheat mechanisms, and implementation strategy for the Reaction Timer application.

---

## 1. Project Goals & Requirements

### Functional Requirements
- Build a Single Page Application (SPA) using vanilla HTML, CSS, and JavaScript.
- Serve the SPA via an Express.js server running on Node.js.
- Measure user reaction time from a visual trigger (e.g., color change) to a click.
- Record and display the fastest reaction time.
- Allow the user to play multiple times.

### Anti-Cheat Requirements
- **Automated Inputs:** Prevent scripts, bots, or automated tools from gaming the system.
- **Score Manipulation:** Secure the score submission and storage to prevent tampering.

---

## 2. Architecture Overview

### Technology Stack
- **Backend:** Node.js with Express.js
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (no frameworks)
- **Communication:** HTTP requests (fetch API or XMLHttpRequest)

### Project Structure
```
/
├── server.js              # Express server & API endpoints
├── public/
│   ├── index.html         # Main SPA template
│   ├── styles.css         # Styling
│   └── app.js             # Client-side logic
├── docs/
│   ├── prompt.md          # Master prompt
│   ├── evaluators.md      # Evaluation criteria
│   ├── plan.md            # This file
│   └── evaluation.md      # Evaluation log
└── README.md              # Project overview
```

---

## 3. Fairness Mechanism

### Core Logic
1. **Visual Trigger:** A visual change (e.g., background color change from red to green) signals the start of the reaction measurement.
2. **Reaction Measurement:** The client records the timestamp of the user's click and calculates the difference from the trigger time.
3. **Score Submission:** The client sends the reaction time to the server to record the score.


---

## 4. Anti-Cheat Mechanisms

### 4.1 Protecting Against Automated Inputs
- **Rate Limiting:** Implement rate limiting on the server to prevent rapid-fire requests (e.g., max 1 test per 2 seconds).
- **User Agent / Session Validation:** Track sessions and detect anomalous patterns (e.g., multiple tests in rapid succession).

### 4.2 Securing Score Submission
- **No Client-Side Score Storage:** Do NOT store the "fastest score" solely on the client. It can be easily modified via DevTools.
- **Server-Side Leaderboard:** Store all scores on the server in memory or a simple data structure.
- **Validation on Submission:** Apply anti-cheat checks before recording the score.
- **Session-Based Tracking:** Associate scores with a session ID to prevent spoofing.
- **Timestamp Auditing:** Log all score submissions with server-side timestamps for audit purposes.

---

## 5. Backend (Express Server) Design

### Endpoints

#### `GET /`
- Serves the `index.html` file (SPA entry point).

#### `POST /api/start`
- Initiates a new reaction timer test.
- **Request:** Empty body (or minimal metadata).
- **Response:** 
  ```json
  {
    "session_id": "unique-session-or-sequence-id"
  }
  ```
- **Purpose:** Create a session for the reaction timer test.

#### `POST /api/submit`
- Submits a reaction time for validation.
- **Request:**
  ```json
  {
    "session_id": "...",
    "reaction_time": 350
  }
  ```
- **Response:**
  ```json
  {
    "valid": true,
    "message": "Reaction time recorded.",
    "fastest": 340
  }
  ```
  or
  ```json
  {
    "valid": false,
    "message": "Score submission failed validation."
  }
  ```
- **Validation Logic:** Check for rate limiting and session validity.

#### `GET /api/fastest`
- Retrieves the current fastest recorded reaction time.
- **Response:**
  ```json
  {
    "fastest": 340,
    "attempts": 12
  }
  ```

### In-Memory Data Structure
For Iteration 1, store data in memory:
```javascript
{
  "sessions": {
    "session-id-1": {
      "start_time": 1707340000000,
      "status": "active"
    }
  },
  "scores": [
    { "reaction_time": 340, "timestamp": 1707340003000, "session_id": "session-id-1" },
    { "reaction_time": 380, "timestamp": 1707340005000, "session_id": "session-id-2" }
  ]
}
```

---

## 6. Frontend (Client-Side) Design

### State Management
```javascript
const appState = {
  isTesting: false,
  triggerTime: null,
  fastest: null,
  currentTest: null
};
```

### Flow
1. **User clicks "Start":** Call `POST /api/start` → receive `session_id`.
2. **Visual Trigger:** Immediately display the visual trigger (e.g., background color change).
3. **Accept Click:** Capture the timestamp of the user's click.
4. **Calculate & Submit:** `reaction_time = click_time - trigger_time`. Send to `/api/submit`.
5. **Display Result:** Show the reaction time and the current fastest.

### HTML Structure
- Button: "Start Test"
- Display Area: Shows the visual trigger (color change).
- Results Area: Shows current reaction time and fastest time.

### CSS Styling
- Simple, clean design.
- Smooth color transitions for the visual trigger.
- Responsive feedback (e.g., button states).

### JavaScript Logic
- Event listeners for clicks and button presses.
- Timestamp tracking using `performance.now()` or `Date.now()`.
- Fetch API calls to the backend.
- DOM manipulation to display results.

---

## 7. Security & Validation Strategy

### Submission Tracking (Server-Side)
1. Record server timestamp when `/api/start` is called.
2. Record server timestamp when `/api/submit` is called.
3. Track submissions for rate limiting and session management.

### Rate Limiting
- Allow 1 submission per 2 seconds per session.
- Track submission timestamps and enforce this limit.

### Session Isolation
- Each test gets a unique `session_id`.
- A session can only submit ONCE.
- Prevents double-submission of the same test.

---

## 8. Deployment & Testing Strategy

### Local Testing
1. Start the Express server: `node server.js`.
2. Open the app in a browser.
3. Manually test the reaction timer.
4. Test anti-cheat by:
   - Rapid-clicking (should be rate-limited).

### Code Quality
- Clean, modular code structure.
- Comments for clarity.
- Error handling for edge cases.

---

## 9. Future Enhancements (Not in Iteration 1)
- Persistent storage (database) for scores.
- User authentication and accounts.
- Global leaderboards.
- Sound effects and animations.
- Mobile optimization.

---

## 10. Success Criteria (Evaluation Points)

### The Architect ✓
- Server starts without errors.
- Static files served correctly.
- Code is clean and organized.
- No crashes during normal operation.

### The Referee ✓
- Automated inputs (rapid submissions) are throttled/rejected.
- Score submission is validated server-side.

### The Performance Lead ✓
- Page loads quickly (LCP < 2.5s).
- UI is responsive without lag.
- Assets are minimal and optimized.

### The Gamer ✓
- Visual feedback is clear (color change for trigger).
- Clicking feels responsive.
- Results are displayed immediately and clearly.
- Easy to play multiple times.

---

## 11. Implementation Phases

### Phase 1: Core Infrastructure
- Set up Express server.
- Create basic HTML, CSS, and JavaScript files.
- Implement `/` and `/api/start` endpoints.

### Phase 2: Reaction Logic
- Implement visual trigger on the client.
- Implement click detection and timestamp calculation.
- Implement `/api/submit` endpoint with basic validation.

### Phase 3: Anti-Cheat & Polish
- Add server-side validation logic.
- Implement rate limiting.
- Add session management.
- Polish UI/UX for responsiveness and clarity.

### Phase 4: Testing & Optimization
- Manual testing across all personas.
- Identify and fix issues.
- Optimize performance.

---

## Next Steps
Once this plan is approved, proceed with **Phase 1: Core Infrastructure** implementation.
