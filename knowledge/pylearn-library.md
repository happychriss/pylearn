# PyLearn Cheat Sheet

```python
import pylearn
# or cherry-pick:
from pylearn import scene, say, ask, show_sprite, move_sprite, show_text, clear_text
```

---

## Available libraries

Student code runs in a sandbox with **only the Python standard library** (`math`, `random`, `time`, `statistics`, …) plus the **`pylearn`** module. No third-party packages are installed — `numpy`, `pandas`, `matplotlib`, `plotly`, etc. all raise `ModuleNotFoundError`. To chart, use `pylearn.Figure`; compute values with `math` in normal loops.

## Output / Display

| Call | What it does |
|------|-------------|
| `pylearn.show(fig)` | A `pylearn.Figure` → interactive chart |
| `pylearn.show("<b>hi</b>")` | String → HTML |
| `pylearn.show(anything)` | Fallback → plain text |
| `pylearn.display(data, mime="text/html")` | Raw data with explicit MIME type |
| `pylearn.display_image("photo.png")` | Read file, send as base64 image |

Supported MIME types for `display()`: `text/html`, `text/plain`, `image/png`, `image/jpeg`, `image/gif`, `image/svg+xml`, `image/webp`, `application/vnd.plotly+json`

## Charts — `pylearn.Figure`

Build a chart, add one or more series, then show it. No third-party package needed — values are plain Python lists:

```python
import pylearn, math

xs = [i / 10 for i in range(0, 63)]      # 0 .. ~6.2

fig = pylearn.Figure(title="Sine and Cosine")
fig.line(xs, [math.sin(x) for x in xs], name="sin(x)")
fig.line(xs, [math.cos(x) for x in xs], name="cos(x)")
pylearn.show(fig)
```

| Method | What it adds |
|--------|-------------|
| `pylearn.Figure(title="", height=300)` | A new chart |
| `.line(x, y, name=None)` | A connected curve |
| `.points(x, y, name=None)` | Separate dots (scatter) |
| `.bar(x, y, name=None)` | Bars |

### Advanced: raw Plotly JSON

For trace types `Figure` doesn't wrap (pie, histogram, box, …), send raw Plotly JSON directly:

```python
pylearn.display({
    "data": [
        {"type": "pie",       "labels": ["X","Y"], "values": [60, 40]},
        {"type": "histogram", "x": [1, 1, 2, 3, 3, 3]},
    ],
    "layout": {"title": "My Chart", "height": 300}
}, mime="application/vnd.plotly+json")
```

---

## Turtle Graphics

```python
t = pylearn.Turtle()              # default canvas 600×400
t = pylearn.Turtle(width=800, height=600)
```

> **Restriction: Turtle and Adventure cannot be mixed in the same program.**
> They use separate renderers and appear in different output areas. Use one or the other per program.

### Movement

```python
t.forward(100)        # fd(100)  — move forward N pixels
t.backward(50)        # bk(50)   — move backward N pixels
t.right(90)           # rt(90)   — turn right N degrees
t.left(45)            # lt(45)   — turn left N degrees
t.setheading(180)     # seth(180) — set absolute heading (0=right, 90=down, 180=left, 270=up)
t.goto(x, y)          # jump to absolute position (draws if pen is down)
```

### Pen

```python
t.penup()             # pu() — lift pen — move without drawing
t.pendown()           # pd() — lower pen — draw as you move
t.pensize(3)          # line width in pixels (default 2)
t.pencolor("#ff0000") # pen colour — hex string or name
t.fillcolor("#00ff00")# fill colour used by begin_fill/end_fill
t.color("#ff0000")            # set pen colour only
t.color("#ff0000", "#00ff00") # set pen + fill colour
t.bgcolor("#0f172a")  # canvas background colour
```

### Shapes & Fill

```python
t.dot()               # filled dot at current position (default size 5)
t.dot(10)             # dot with explicit size
t.dot(10, "#ff0000")  # dot with size + colour
t.circle(50)          # full circle, radius 50 (negative = opposite direction)
t.circle(50, extent=120)  # arc — 120° sweep (one-third of a circle)
t.write("hello")      # text at current position, default font_size=16
t.write("hi", font_size=24)

# Fill any closed shape:
t.fillcolor("yellow")
t.begin_fill()
t.circle(100)         # draw shape while in fill mode
t.end_fill()          # closes and fills with fillcolor
```

### State & Canvas

```python
x, y = t.position()   # pos() — returns (x, y) tuple
angle = t.heading()   # returns current heading in degrees
t.clear()             # erase all drawn commands (keeps position/heading)
t.done()              # ← REQUIRED: sends drawing to Output Panel
```

> **Only use the methods listed above.** Do not use standard Python `turtle` module methods that are not listed here — they do not exist in pylearn's Turtle class (`begin_poly`, `stamp`, `speed`, `tracer`, `Screen`, etc.).

---

## Adventure Scenes

All coordinates are in the **virtual 0–500 space** (top-left origin), scaled to the actual panel size.

> **Restriction: Adventure and Turtle cannot be mixed in the same program.** Use one or the other.

### Background

```python
scene("forest")       # built-in: forest, cave, village, dungeon
scene("myimage")      # custom: upload myimage.png via the Images panel
```

### Sprites

```python
show_sprite("hero", x=50, y=80)          # place sprite at (50, 80)
show_sprite("hero", x=50, y=80, size=120)# override sprite width (aspect preserved)
move_sprite("hero", x=200, y=80)         # instant move
move_sprite("hero", x=200, y=80, duration=0.5)  # animated move over 0.5 s
hide_sprite("hero")                      # remove a sprite from the scene
```

Sprites are PNG/JPG images uploaded via the Images panel, referenced by name without extension.

> **Animation limitation — do not use rapid `move_sprite` loops.**
> Each `move_sprite` call is a WebSocket round-trip: Python → server → browser → React → CSS transition.
> Locally this adds ~20 ms of overhead per step; on a cloud-hosted server (e.g. Fly.io) network latency
> adds another 50–150 ms, making rapid loops completely unusable.
> `ease-in-out` per-segment easing also produces visible jitter when steps overlap.
>
> **Use `move_sprite` for discrete story-beat transitions** (walk to position, pause, react) — not for
> frame-by-frame animation. A future `animate_path` command will handle smooth continuous motion
> by sending the full path to the browser in one event and running the animation loop client-side.

### Text Labels (HUD / score / overlay)

```python
show_text("score", "Score: 10", x=10, y=10)
show_text("score", "Score: 20", x=10, y=10)        # update existing label
show_text("label", "Hi!", x=200, y=50, size=28, color="yellow")
show_text("label", "Hi!", x=200, y=50, background="#000000")  # opaque bg
clear_text("score")   # remove one label by name
clear_text()          # remove all labels
```

Defaults: `size=20`, `color="white"`, `background=None` (transparent).

### Dialogue

```python
say("Text shown in the story overlay.")
say("Bold warning!", color="yellow", size=22)
say("Highlighted message", color="white", size=18, background="#cc0000")

answer = ask("What do you do next?")       # waits for player input, returns string
answer = ask("Your name?", color="cyan", size=20)
```

Defaults: `color="white"` (say) / `color` light-blue (ask), `size=16`, `background=None` (transparent).

---

## Raw Protocol (no import needed)

```python
import json, sys
msg = {"mime": "text/html", "data": "<h1>Hello</h1>"}
sys.stdout.write("\x00PYLEARN_DISPLAY\x00" + json.dumps(msg) + "\x00")
sys.stdout.flush()
```
