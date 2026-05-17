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

NOTE: Turtle and Adventure Scenes cannot be used in the same program — they use separate renderers.

\`\`\`python
t = pylearn.Turtle(width=600, height=400)  # canvas size (default 600×400)

# COORDINATE SYSTEM — critical, differs from standard Python turtle:
#   Origin (0, 0) is the TOP-LEFT corner.
#   x increases to the RIGHT, y increases DOWNWARD.
#   Canvas range: x: 0–width (0–600), y: 0–height (0–400).
#   Turtle starts at the CENTER: (300, 200) for the default 600×400 canvas.
#   NEVER use negative coordinates — they land off-screen.
#   Safe drawing area: x 20–580, y 20–380.
#
# Example — smiley face centred on a 600×400 canvas:
#   t.bgcolor("#00ff00")
#   t.penup(); t.goto(300, 250); t.pendown()   # bottom of face circle
#   t.fillcolor("#ff69b4"); t.begin_fill(); t.circle(80); t.end_fill()
#   t.penup(); t.goto(265, 195); t.pendown()
#   t.dot(16, "#000000")                        # left eye
#   t.penup(); t.goto(335, 195); t.pendown()
#   t.dot(16, "#000000")                        # right eye
#   t.done()

# Movement
t.forward(distance)       # move forward (pixels) — alias: t.fd(distance)
t.backward(distance)      # move backward        — alias: t.bk(distance)
t.right(angle)            # turn right (degrees)  — alias: t.rt(angle)
t.left(angle)             # turn left (degrees)   — alias: t.lt(angle)
t.setheading(angle)       # set absolute heading (0=right, 90=down, 180=left, 270=up) — alias: t.seth(angle)
t.goto(x, y)              # jump to absolute pixel position (top-left origin, y-down)

# Pen control
t.penup()                 # lift pen — move without drawing  — alias: t.pu()
t.pendown()               # lower pen — draw as you move     — alias: t.pd()
t.pensize(width)          # line width in pixels (default 2)
t.pencolor("#ff0000")     # pen color — hex or name
t.fillcolor("#00ff00")    # fill color used by begin_fill/end_fill
t.color("#ff0000")              # set pen color only
t.color("#ff0000", "#00ff00")   # set pen + fill color
t.bgcolor("#0f172a")      # canvas background color

# Shapes
t.dot(size=5, color=None)       # filled dot at current position
t.circle(radius)                # full circle
t.circle(radius, extent=120)    # arc — extent is the angle swept in degrees (120 = one-third circle)
t.write("hello", font_size=16)  # text at current position

# Fill — use begin_fill / end_fill to fill any closed shape
t.fillcolor("yellow")
t.begin_fill()
t.circle(100)       # draw the shape
t.end_fill()        # fills the enclosed area with fillcolor

# State
t.position()              # returns (x, y)  — alias: t.pos()
t.heading()               # returns current angle in degrees
t.clear()                 # erase all drawn commands
t.done()                  # ← REQUIRED: sends the drawing to the Output Panel
\`\`\`

IMPORTANT — only use the methods listed above. Do NOT use: speed(), stamp(), pencolor() with two args, xcor(), ycor(), towards(), distance(), undo(), tracer(), hideturtle(), showturtle(), shape(), screen(), Screen(), turtlesize(), shapesize(), or any other standard Python turtle module method not listed here.

---

## Adventure Scenes

NOTE: Adventure Scenes and Turtle cannot be used in the same program — they use separate renderers.

\`\`\`python
from pylearn import scene, say, ask, show_sprite, move_sprite, hide_sprite, show_text, clear_text

scene("forest")            # set background — built-in names: forest, cave, village, dungeon
                           # custom: upload an image file (without extension) in the Images panel

# Sprites — coordinates are in virtual 0–500 space (top-left origin), scaled to panel size
show_sprite("hero", x=50, y=80)            # place a sprite
show_sprite("hero", x=50, y=80, size=120)  # override sprite width (aspect ratio preserved)
move_sprite("hero", x=200, y=80)           # instant move
move_sprite("hero", x=200, y=80, duration=0.5)  # animated move over 0.5 seconds
hide_sprite("hero")                        # remove a sprite from the scene

# NOTE: scene() automatically clears all sprites — each scene starts with a fresh cast.
# Text labels (show_text) are NOT cleared by scene() — they act as persistent HUD overlays.

# Text labels (HUD / score / overlay) — same 0–500 coordinate space
show_text("score", "Score: 10", x=10, y=10)             # place or update a label (x,y optional: kept from prev call)
show_text("score", "Score: 99")                          # update text only — x/y/size/color preserved
show_text("score", "Score: 10", x=10, y=10, size=28, color="yellow")  # with style
show_text("score", "Score: 10", x=10, y=10, background="#000000")     # opaque background
clear_text("score")        # remove one label by name
clear_text()               # remove all labels

say("Story text shown in the scene overlay.")
say("Bold warning!", color="yellow", size=22)
say("Highlighted message", color="white", size=18, background="#cc0000")

answer = ask("A question the player types an answer to?")
answer = ask("Your name?", color="cyan", size=20)
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

---

## Multi-file Programs

A workspace can contain several \`.py\` files. When you press **Run**, all files are written to the same temp directory, so you can split code into modules and import normally.

**Rule:** the file **active in the editor** when Run is pressed is the entry point.

### Example — two-file adventure

\`\`\`python
# forest.py  — helper module
def enter(name: str, score: int = 0):
    """Return (story_text: str, new_score: int)."""
    return f"{name} steps into the forest.", score + 10

def fight(health: int, damage: int = 5) -> int:
    """Reduce health by damage, minimum 0."""
    return max(0, health - damage)

def is_alive(health: int) -> bool:
    return health > 0
\`\`\`

\`\`\`python
# main.py  — entry point (active when Run is pressed)
import forest                               # works because forest.py is in the same workspace

name = input("Your name? ")                 # str
text, score = forest.enter(name, score=0)   # returns (str, int)
print(text)

health: int = 30
health = forest.fight(health, damage=12)    # int, int  → int
alive: bool = forest.is_alive(health)       # int       → bool

print(f"Score: {score}   Health: {health}   Alive: {alive}")
\`\`\`

### Parameter types

| Type | Example value | Parameter syntax |
|------|--------------|-----------------|
| \`str\`   | \`"Alice"\`       | \`name: str\` |
| \`int\`   | \`42\`            | \`score: int = 0\` |
| \`float\` | \`3.14\`          | \`speed: float = 1.0\` |
| \`bool\`  | \`True\` / \`False\` | \`alive: bool = True\` |
| \`list\`  | \`[1, 2, 3]\`     | \`items: list = []\` |

### Tips

- Import by filename without \`.py\`: file \`forest.py\` → \`import forest\`
- Guard entry-point code so it doesn't run on import:
  \`\`\`python
  if __name__ == "__main__":
      main()
  \`\`\`
- Return multiple values with a tuple: \`return score, health\` → unpack as \`score, health = func()\`
- \`.prompt\` files are ignored — they are AI prompt templates, never executed
`.trim();
