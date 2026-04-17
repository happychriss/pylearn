# PyLearn

A browser-based Python learning platform for 11–14-year-olds — built to teach not just how to code, but how to think about code and AI.

---

## What This Is

PyLearn is a classroom platform for small groups of motivated young learners who want to understand how digital systems actually work. The goal is not to cover as much syntax as possible. It is to build a mental model: **how does software produce behavior, and how is that different from what AI does?**

The course runs in 3–4 focused sessions and is deliberately compact. The target audience is motivated and self-selected — students who showed up because they wanted to, not because they had to.

---

## The Core Idea

Two thinking models are taught side by side and kept deliberately separate:

**Programming**
> The student defines the rules. Behavior is explicit, traceable, and deterministic. If something goes wrong, there is a reason — and the student can find it.

**AI**
> Suggestions are plausible, often useful, but not guaranteed to be correct. The AI does not "know" anything — it predicts what looks right based on patterns.

The decisive skill is learning to tell the difference, and to evaluate which tool to reach for.

---

## Didactic Structure

The course builds in four steps:

1. **Pure Python in the terminal**
   Logic, conditions, cause and effect — no shortcuts, no magic. Students see exactly what the computer does and why.

2. **AI as a debugging assistant, not a solver**
   AI is introduced early, but only to *explain* errors. Students fix the code themselves. This prevents the habit of delegating thinking to the AI.

3. **Interactive systems — the Adventure module**
   Students build text-and-image adventure games. Logic becomes visual and tangible. The program has state. Choices have consequences.

4. **Own solution vs. AI suggestion**
   Students compare what they built with what the AI would produce. They evaluate: Is the AI's version correct? Is it better? What did it miss?

One rule runs throughout: **students never start from a blank editor.** Every exercise begins with working code that they modify. This keeps the focus on understanding behavior, not on fighting syntax from scratch.

---

## The Platform

PyLearn is a web application — no installation required for students. They open a URL and start writing Python immediately.

### Student Workspace

- **Monaco editor** — the same editor that powers VS Code
- **Integrated terminal** — real Python 3 running server-side via a PTY
- **Output panel** — renders charts, drawings, and adventure scenes in real time alongside the terminal

### Output Types

Python code can produce rich visual output via the `pylearn` library:

| Output | How |
|--------|-----|
| Interactive charts | Plotly figures or raw JSON |
| Turtle graphics | `pylearn.Turtle()` — a draw-as-you-go canvas |
| Adventure scenes | Backgrounds, sprites, dialogue, player input |
| HTML / images | Inline display in the output panel |

### Teacher Dashboard

- Create and manage student accounts (PIN-based login for young learners)
- Monitor any student's current workspace in real time
- Configure AI behavior per classroom
- Upload images and backgrounds for adventure scenes
- View the built-in `pylearn` library reference

---

## The `pylearn` Library

A single-file Python module on `PYTHONPATH`. No pip install. No dependencies beyond the standard library.

```python
import pylearn

# Display a chart (no plotly installation needed)
pylearn.display({
    "data": [{"type": "bar", "x": ["A", "B", "C"], "y": [3, 1, 2]}],
    "layout": {"title": "My First Chart"}
}, mime="application/vnd.plotly+json")

# Draw with a turtle
t = pylearn.Turtle()
t.pencolor("#3b82f6")
for _ in range(4):
    t.forward(100)
    t.right(90)
t.done()  # required — sends the drawing to the output panel

# Build an adventure scene
from pylearn import scene, show_sprite, say, ask

scene("forest")
show_sprite("hero", x=50, y=300)
say("You stand at the edge of the forest.")
answer = ask("Do you enter? (yes/no)")
if answer.lower() == "yes":
    scene("cave")
    say("It is dark inside.")
```

---

## AI Integration

The AI assistant has three clearly separated roles, configurable by the teacher per classroom:

| Mode | What it does | Can change code? |
|------|-------------|-----------------|
| **Chat** | Explains concepts, answers questions | No |
| **Suggestion** | Offers hints and improvement ideas | No |
| **Agent** | Proposes a concrete code change, shown as a diff | Yes — student must accept |

When the Agent proposes a change, students see exactly what would be added or removed before accepting. The AI is never a black box that silently rewrites student work.

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Monaco Editor, xterm.js, Tailwind CSS v4 |
| Backend | Express 5, WebSocket, node-pty |
| Database | PostgreSQL + Drizzle ORM |
| AI providers | Anthropic Claude, Google Gemini (configurable) |
| Deployment | Fly.io (single machine, auto-stop when idle) |
| Auth | Google OAuth (production) or `LOCAL_AUTH` mode (development) |

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r run build

# Start with local auth (no Google OAuth needed)
LOCAL_AUTH=true \
DATABASE_URL=postgresql://user:pass@localhost/pylearn \
PORT=8080 \
SESSION_SECRET=local-dev-secret \
node artifacts/api-server/dist/index.cjs
```

Visit `http://localhost:8080/api/login` to create a local teacher session.

---

## Deploying to Fly.io

```bash
fly deploy
```

Required secrets: `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `DATABASE_URL`.

The first user to log in is automatically promoted to teacher/admin.

---

## Learning Outcomes

By the end of the course, students can:

- Explain how a program produces behavior step by step
- Read and modify code they did not write
- Build a small interactive system from scratch
- Recognize when AI output is plausible but wrong
- Make a reasoned judgment about when to use AI as a tool — and when not to

That last point — **critically evaluating AI** — is treated as a first-class learning goal, not an afterthought.

---

## Status

Active classroom use. Built for a group of ~14 students, 11–14 years old.
