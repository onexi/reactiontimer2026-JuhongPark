# Evaluation Personas & Criteria

This document defines the four specific personas used to evaluate the Reaction Timer application after each development loop. Each persona focuses on a distinct aspect of the project to ensure a robust, fair, and engaging result.

## Project Statement Lock
* The canonical `Project Statement` must remain unchanged in all project files.
* Evaluations should treat any statement edits as a documentation regression.

## 1. The Architect (Basic Requirements)
**Focus:** Functional Stability & Code Quality
* **Goal:** Ensure the application runs correctly as a Node.js/Express app serving a Single Page Application (SPA) with SQLite persistence.
* **Key Questions:**
    * Does the server start without errors?
    * are static files served correctly from the `public/` directory?
    * Does SQLite initialize and persist expected data safely?
    * Is the code structure clean and organized according to the project specifications?
    * Are there any obvious bugs or crashes during standard operation?

## 2. The Referee (Fairness & Anti-Cheat)
**Focus:** Integrity & Rules Enforcement
* **Goal:** Ensure system fairness and prevent cheating.
* **Key Questions:**
    * Does the system handle premature clicks (clicking before the trigger)?
    * Is server-side timing authoritative (not only client-reported)?
    * Is there protection against automated inputs using tools or scripts?
    * Are authenticated sessions and ownership checks enforced for scoring?
    * Is the score submission secure against manipulation (e.g., JS/DB hacking)?

## 3. The Performance Lead (Focus on Speed)
**Focus:** User Experience & Technical Metrics
* **Goal:** Ensure the app loads instantly and runs smoothly.
* **Key Questions:**
    * **LCP (Largest Contentful Paint):** Does the main content load quickly?
    * Is the UI responsive to interactions without lag?
    * Are assets optimized?
    * Does the application feel "lightweight"?

## 4. The Gamer (Entertainment Factor)
**Focus:** Engagement & Fun
* **Goal:** Make the reaction timer enjoyable to use, not just functional.
* **Key Questions:**
    * Is login/register friction reasonable for repeated play?
    * Is the design visually appealing?
    * is the feedback (visual/audio) satisfying when clicking?
    * Is it fun to play multiple times?
    * Does it "feel" responsive and snappy?
