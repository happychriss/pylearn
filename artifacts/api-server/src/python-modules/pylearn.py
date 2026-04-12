"""
PyLearn universal output library.

Provides a single `show()` function that renders rich output (Plotly charts,
Pandas DataFrames, HTML, images) in the PyLearn Output Panel via duck-typing.

Also provides a Turtle class for simple drawing and adventure helpers
(scene, say, ask, show_sprite, move_sprite, show_text, clear_text) for the visual-novel system.

Protocol: writes \x00PYLEARN_DISPLAY\x00{json}\x00 to stdout.
The PyLearn server intercepts these markers and routes them to the browser.
"""

import sys
import json
import math

# ---------------------------------------------------------------------------
# Core display protocol
# ---------------------------------------------------------------------------

_START = "\x00PYLEARN_DISPLAY\x00"
_END = "\x00"


def _emit(mime, data, display_id=None, append=False):
    """Send a display message through the PyLearn protocol."""
    msg = {"mime": mime, "data": data}
    if display_id is not None:
        msg["id"] = str(display_id)
    if append:
        msg["append"] = True
    sys.stdout.write(_START + json.dumps(msg, default=str) + _END)
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Universal show() — duck-typing detection
# ---------------------------------------------------------------------------

def show(obj):
    """Display any supported object in the Output Panel.

    Supported types (detected by duck-typing):
    - Plotly figures (has .to_plotly_json)
    - Pandas DataFrames/Series (has ._repr_html_)
    - Strings → rendered as HTML
    - Everything else → text/plain
    """
    if hasattr(obj, "to_plotly_json"):
        # Plotly figure
        _emit("application/vnd.plotly+json", obj.to_plotly_json())
    elif hasattr(obj, "_repr_html_"):
        # Pandas DataFrame, Styler, etc.
        _emit("text/html", obj._repr_html_())
    elif isinstance(obj, str):
        _emit("text/html", obj)
    else:
        _emit("text/plain", str(obj))


def display(data, mime="text/html"):
    """Send raw data with an explicit MIME type."""
    _emit(mime, data)


def display_image(filepath):
    """Read an image file and display it as base64 PNG."""
    import base64
    with open(filepath, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("ascii")
    # Detect mime from extension
    ext = filepath.rsplit(".", 1)[-1].lower() if "." in filepath else "png"
    mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "gif": "image/gif", "svg": "image/svg+xml", "webp": "image/webp"}
    mime = mime_map.get(ext, "image/png")
    _emit(mime, encoded)


# ---------------------------------------------------------------------------
# Turtle graphics
# ---------------------------------------------------------------------------

class Turtle:
    """Simple turtle graphics — collects draw commands, renders on done().

    Usage:
        t = Turtle()
        t.forward(100)
        t.right(90)
        t.forward(50)
        t.done()
    """

    def __init__(self, width=600, height=400):
        self._width = width
        self._height = height
        self._x = width / 2
        self._y = height / 2
        self._heading = 0  # degrees, 0 = right (east)
        self._pen = True
        self._color = "#000000"
        self._fill_color = None
        self._line_width = 2
        self._commands = []
        self._speed = 0  # not used for animation, reserved for future
        self._fill_mode = False
        self._fill_path = []
        self._fill_start_idx = 0  # where to insert the polygon so it renders under the stroke

    # -- Movement --

    def forward(self, distance):
        """Move forward by distance pixels."""
        rad = math.radians(self._heading)
        new_x = self._x + distance * math.cos(rad)
        new_y = self._y + distance * math.sin(rad)
        if self._pen:
            self._commands.append({
                "cmd": "line",
                "x1": round(self._x, 2), "y1": round(self._y, 2),
                "x2": round(new_x, 2), "y2": round(new_y, 2),
                "color": self._color, "width": self._line_width
            })
        self._x, self._y = new_x, new_y
        if self._fill_mode:
            self._fill_path.append((self._x, self._y))

    def backward(self, distance):
        """Move backward by distance pixels."""
        self.forward(-distance)

    def right(self, angle):
        """Turn right by angle degrees."""
        self._heading = (self._heading + angle) % 360

    def left(self, angle):
        """Turn left by angle degrees."""
        self._heading = (self._heading - angle) % 360

    def setheading(self, angle):
        """Set the turtle's heading to an absolute angle (0=right/east, 90=down, 180=left, 270=up)."""
        self._heading = angle % 360

    def goto(self, x, y):
        """Move to absolute position (x, y). Draws if pen is down."""
        if self._pen:
            self._commands.append({
                "cmd": "line",
                "x1": round(self._x, 2), "y1": round(self._y, 2),
                "x2": round(x, 2), "y2": round(y, 2),
                "color": self._color, "width": self._line_width
            })
        self._x, self._y = x, y
        if self._fill_mode:
            self._fill_path.append((x, y))

    # -- Fill --

    def begin_fill(self):
        """Start recording a fill region. Call end_fill() to close and fill it."""
        self._fill_mode = True
        self._fill_start_idx = len(self._commands)  # fill polygon inserted here (renders under stroke)
        self._fill_path = [(self._x, self._y)]

    def end_fill(self):
        """Fill the region drawn since begin_fill() using the current fill color."""
        if self._fill_mode and len(self._fill_path) > 2:
            self._commands.insert(self._fill_start_idx, {
                "cmd": "polygon",
                "points": [{"x": round(x, 2), "y": round(y, 2)} for x, y in self._fill_path],
                "color": self._fill_color or self._color,
            })
        self._fill_mode = False
        self._fill_path = []

    # -- Pen control --

    def penup(self):
        self._pen = False

    def pendown(self):
        self._pen = True

    def pensize(self, width):
        self._line_width = width

    def pencolor(self, color):
        self._color = color

    def fillcolor(self, color):
        self._fill_color = color

    # Aliases
    def color(self, pen_color, fill_color=None):
        self._color = pen_color
        if fill_color is not None:
            self._fill_color = fill_color

    # -- Drawing shapes --

    def dot(self, size=5, color=None):
        """Draw a dot at current position."""
        self._commands.append({
            "cmd": "circle",
            "cx": round(self._x, 2), "cy": round(self._y, 2),
            "r": size / 2,
            "color": color or self._color, "fill": True
        })

    def circle(self, radius, extent=360, steps=None):
        """Draw a circle or arc.
        radius: size of circle. Negative = opposite direction.
        extent: arc angle in degrees (default 360 = full circle, 180 = semicircle).
        steps: number of line segments (auto-calculated from extent if omitted).
        """
        if steps is None:
            steps = max(int(abs(extent) / 5), 4)
        angle_step = extent / steps
        step_dist = 2 * math.pi * abs(radius) * abs(extent) / 360 / steps
        for _ in range(steps):
            self.forward(step_dist)
            if radius >= 0:
                self.right(angle_step)
            else:
                self.left(angle_step)

    def write(self, text, font_size=16):
        """Write text at current position."""
        self._commands.append({
            "cmd": "text",
            "x": round(self._x, 2), "y": round(self._y, 2),
            "text": str(text), "color": self._color, "size": font_size
        })

    # -- State queries --

    def position(self):
        return (self._x, self._y)

    def heading(self):
        return self._heading

    # -- Standard turtle aliases --
    fd  = forward
    bk  = backward
    rt  = right
    lt  = left
    seth = setheading
    pu  = penup
    pd  = pendown
    pos = position

    # -- Canvas control --

    def clear(self):
        """Clear all drawn commands."""
        self._commands = []

    def bgcolor(self, color):
        """Set background color."""
        self._commands.insert(0, {"cmd": "bgcolor", "color": color})

    def done(self):
        """Send all drawing commands to the Output Panel."""
        _emit("application/vnd.pylearn.canvas+json", {
            "commands": self._commands,
            "width": self._width,
            "height": self._height,
        })


# ---------------------------------------------------------------------------
# Adventure helpers (visual-novel system)
# ---------------------------------------------------------------------------
# These emit scene events via the display protocol.
# They are compatible with the old `from adventure import scene, say, ask`
# API but route through the unified display system.

def scene(name):
    """Set the adventure background scene."""
    _emit("application/vnd.pylearn.scene+json", {"type": "scene", "name": str(name)})
    print("--- Scene:", str(name), "---")


def show_sprite(sprite, x=0, y=0, size=None):
    """Show a sprite on the adventure scene.
    x, y: position in virtual coordinates (0–500, top-left origin).
    size: sprite width in virtual units (default ~80). Aspect ratio is preserved.
    """
    payload = {"type": "show", "sprite": str(sprite), "x": int(x), "y": int(y)}
    if size is not None:
        payload["size"] = int(size)
    _emit("application/vnd.pylearn.scene+json", payload)


def move_sprite(sprite, x=0, y=0, duration=0):
    """Move a sprite to a new position.
    duration: how long the move takes in seconds (e.g. 0.5 for half a second).
    """
    _emit("application/vnd.pylearn.scene+json", {
        "type": "move", "sprite": str(sprite), "x": int(x), "y": int(y),
        "duration": float(duration),
    })


_SENTINEL = object()

def show_text(name, text, x=_SENTINEL, y=_SENTINEL, *, size=_SENTINEL, color=_SENTINEL, background=_SENTINEL):
    """Place or update a text label on the adventure scene.
    name: unique label id — re-calling with the same name updates it.
    text: the string to display.
    x, y: position in virtual 0–500 space. Kept from previous call if not passed.
    size: font size in px (default 20). Kept from previous call if not passed.
    color: text color — name ('white', 'red') or hex ('#ff0000'). Default 'white'.
    background: background color, or None for transparent. Default None.
    """
    payload = {"type": "show_text", "name": str(name), "text": str(text)}
    if x is not _SENTINEL:
        payload["x"] = int(x)
    if y is not _SENTINEL:
        payload["y"] = int(y)
    if size is not _SENTINEL:
        payload["size"] = int(size)
    if color is not _SENTINEL:
        payload["color"] = str(color)
    if background is not _SENTINEL:
        payload["background"] = str(background) if background is not None else None
    _emit("application/vnd.pylearn.scene+json", payload)


def clear_text(name=None):
    """Remove a text label from the scene.
    clear_text('score') — removes that label.
    clear_text()        — removes all labels.
    """
    payload = {"type": "clear_text"}
    if name is not None:
        payload["name"] = str(name)
    _emit("application/vnd.pylearn.scene+json", payload)


def say(text, *, color=None, size=None, background=None):
    """Display story text in the adventure panel.
    color: text color — name ('white', 'yellow') or hex ('#ff0000'). Default white.
    size: font size in px (e.g. 20). Default 16.
    background: background color string, or None for transparent.
    """
    payload = {"type": "say", "text": str(text)}
    if color is not None:
        payload["color"] = str(color)
    if size is not None:
        payload["size"] = int(size)
    if background is not None:
        payload["background"] = str(background)
    _emit("application/vnd.pylearn.scene+json", payload)
    print(str(text))


def ask(prompt, *, color=None, size=None, background=None):
    """Ask the player a question (waits for input).
    color: question text color. Default light blue.
    size: font size in px. Default 16.
    background: background color for the question box, or None for default.
    """
    payload = {"type": "ask", "prompt": str(prompt)}
    if color is not None:
        payload["color"] = str(color)
    if size is not None:
        payload["size"] = int(size)
    if background is not None:
        payload["background"] = str(background)
    _emit("application/vnd.pylearn.scene+json", payload)
    return input(prompt)
