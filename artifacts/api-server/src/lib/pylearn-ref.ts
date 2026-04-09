/**
 * PyLearn Library Reference
 *
 * SINGLE SOURCE OF TRUTH for the pylearn API.
 *
 * This file is used in two ways:
 *   1. Injected automatically into all AI system prompts (suggest + agent mode)
 *      so the AI knows the correct imports and function signatures.
 *   2. Exposed via GET /api/admin/ai-library-ref for the admin "Library" tab
 *      — readable documentation for the teacher.
 *
 * MAINTENANCE: keep this in sync with python-modules/pylearn.py.
 * Whenever you add or change a function in pylearn.py, update this file.
 * Both the AI and the teacher docs update automatically.
 */

export const PYLEARN_LIBRARY_REFERENCE = `
# PyLearn Library Reference

Students always import from **pylearn**:

\`\`\`python
import pylearn
# or cherry-pick: from pylearn import scene, say, ask
\`\`\`

---

## Charts — Plotly

\`\`\`python
# show() detects the object type automatically (duck-typing)
import plotly.express as px
fig = px.bar(x=["A","B","C"], y=[1,3,2])
pylearn.show(fig)           # Plotly figure  → interactive chart
pylearn.show(df)            # Pandas DataFrame → HTML table
pylearn.show("<b>hi</b>")   # String          → HTML

# display() sends raw Plotly JSON directly (no plotly install needed)
pylearn.display({
    "data": [
        {"type": "bar",     "x": [...], "y": [...]},
        {"type": "scatter", "x": [...], "y": [...], "mode": "lines+markers"},
        {"type": "pie",     "labels": [...], "values": [...]},
    ],
    "layout": {"title": "My Chart", "height": 300}
}, mime="application/vnd.plotly+json")
\`\`\`

Supported Plotly trace types via raw JSON: bar, scatter, pie, histogram, box, and all standard Plotly types.

---

## Turtle Graphics

\`\`\`python
t = pylearn.Turtle(width=600, height=400)  # canvas size (default 600×400)

# Movement
t.forward(distance)       # move forward (pixels)
t.backward(distance)      # move backward
t.right(angle)            # turn right (degrees)
t.left(angle)             # turn left (degrees)
t.goto(x, y)              # jump to absolute position

# Pen control
t.penup()                 # lift pen — move without drawing
t.pendown()               # lower pen — draw as you move
t.pensize(width)          # line width in pixels (default 2)
t.pencolor("#ff0000")     # pen color — hex or name
t.fillcolor("#00ff00")    # fill color for shapes
t.color("#ff0000")        # set pen color (also: t.color(pen, fill))
t.bgcolor("#0f172a")      # canvas background color

# Shapes
t.dot(size=5, color=None) # filled dot at current position
t.circle(radius)          # draw a circle (can be negative to go the other way)
t.write("hello", font_size=16)  # text at current position

# State
t.position()              # returns (x, y)
t.heading()               # returns current angle in degrees
t.clear()                 # erase all drawn commands
t.done()                  # ← REQUIRED: sends the drawing to the Output Panel
\`\`\`

---

## Adventure Scenes

\`\`\`python
from pylearn import scene, say, ask, show_sprite, move_sprite

scene("forest")            # set background — built-in names: forest, cave, village, dungeon
                           # custom: upload an image file (without extension) in the Images panel

show_sprite("hero", x=50, y=80)   # place a sprite (x/y = pixels from top-left)
move_sprite("hero", x=200, y=80)  # move an existing sprite to a new position

say("Story text shown in the scene overlay.")
answer = ask("A question the player types an answer to?")
\`\`\`

Sprites: upload a PNG/JPG image named e.g. \`hero.png\` via the Images panel, then
reference it by name (without extension): \`show_sprite("hero", 50, 80)\`.

---

## HTML Output

\`\`\`python
pylearn.display("<h1>Hello</h1><p>Any HTML works here.</p>", mime="text/html")
pylearn.show("<b>Shortcut</b>: show() on a string renders it as HTML too")
\`\`\`

---

## Images

\`\`\`python
pylearn.display_image("photo.png")   # reads the file, sends it as base64 to Output Panel
                                     # file must be in the same folder as the script
\`\`\`

---

## Raw Protocol (advanced)

Any Python code can emit rich output without importing pylearn:

\`\`\`python
import json, sys
msg = {"mime": "text/html", "data": "<h1>Hi</h1>"}
sys.stdout.write("\\x00PYLEARN_DISPLAY\\x00" + json.dumps(msg) + "\\x00")
sys.stdout.flush()
\`\`\`
`.trim();
