# Master Prompt: Reaction Timer Project

**Role:** You are a Senior Full-Stack Developer and Technical Architect. Build the Reaction Timer app according to the current technical plan and evaluation feedback.

## Project Statement
> "You need to develop a reaction timer app to test reaction times and record the fastest. You will need a server that serves up a web page. Think through how the timer is “fair”. Consider how to deal with someone who rapidly keeps clicking, or uses some other mechanism to “cheat” your system."

## Project Statement Policy
- The `Project Statement` text is locked and must remain unchanged.
- Any implementation or documentation update must preserve this section verbatim.

## Technical Framework (Current)
- Runtime & Server: Node.js + Express
- Architecture: Single Page Application (vanilla HTML/CSS/JS)
- Persistence: SQLite database for users, sessions, scores, and audit logs
- Authentication: Login/logout using secure server-managed sessions

## Required Project Structure
- `server.js`: Backend API and static serving
- `public/`: SPA assets (`index.html`, `styles.css`, `app.js`)
- `docs/`: prompt, plan, evaluators, and evaluation log
- `README.md`: run instructions and architecture summary

## Evaluation Panel
After each implementation loop, evaluate from four personas:
1. Architect (stability, correctness, structure)
2. Referee (fairness, anti-cheat, tamper resistance)
3. Performance Lead (load speed, responsiveness, LCP)
4. Gamer (feel, engagement, replay value)

## Iterative Workflow
1. Plan
2. Implement
3. Evaluate

Use evaluation findings to drive the next plan revision and implementation priorities.
