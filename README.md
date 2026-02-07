[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/PnB7ONEH)
# reactionTimer2026

## Project Statement
> "You need to develop a reaction timer app to test reaction times and record the fastest. You will need a server that serves up a web page. Think through how the timer is “fair”. Consider how to deal with someone who rapidly keeps clicking, or uses some other mechanism to “cheat” your system."

## Technical Framework
* **Runtime & Server:** Node.js and Express
* **Architecture:** Single Page Application (SPA) utilizing HTML, CSS, and JavaScript.

## Project Structure
The documentation and source files are organized as follows:

* **docs/**
    * `prompt.md`: The Master Prompt governing the AI’s architectural role and constraints.
    * `evaluators.md`: Defined criteria for the four persona-based reviews.
    * `plan.md`: Technical blueprints and logic design for each development cycle.
    * `evaluation.md`: Audit log containing scores and feedback from each loop.
* **public/**: Static assets for the SPA (Frontend).
* **server.js**: Express server logic (Backend).
* **README.md**: Project overview, technical framework details, and instructions on how to run the application.

## Development Methodology
This project utilizes a structured **Master Prompt** and specific **Evaluator personas** to drive a rigorous, iterative lifecycle:

1. **Plan:** Designing the technical logic and anti-cheat mechanisms to ensure fairness.
2. **Implement:** Writing and executing the code for the server and SPA interface.
3. **Evaluate:** Conducting a multi-perspective review using four distinct personas (Architect, Referee, Performance Lead, and Gamer) to score the build and identify refinements.