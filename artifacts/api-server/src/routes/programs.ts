import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, filesTable, programTemplatesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

router.get("/admin/programs", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const programs = await db
    .select()
    .from(programTemplatesTable)
    .orderBy(programTemplatesTable.createdAt);
  res.json(programs);
});

router.post("/admin/programs", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const { filename, content } = req.body;
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "filename is required" });
    return;
  }
  const trimmed = filename.trim();
  if (!trimmed.endsWith(".py")) {
    res.status(400).json({ error: "Only .py files are allowed" });
    return;
  }
  const [program] = await db
    .insert(programTemplatesTable)
    .values({
      filename: trimmed,
      content: typeof content === "string" ? content : "",
      createdByAdminId: req.user.id,
    })
    .returning();
  res.status(201).json(program);
});

// ---------------------------------------------------------------------------
// Demo programs — one per display protocol feature
// ---------------------------------------------------------------------------

const DEMO_PROGRAMS: Array<{ filename: string; content: string }> = [
  {
    filename: "demo_plotly_charts.py",
    content: `"""Plotly Charts Demo — shows all chart types supported by the Output Panel."""
import pylearn

# We build Plotly-compatible dicts directly (no plotly install needed).
# pylearn.display() with the plotly MIME type renders them.

# --- Bar Chart ---
pylearn.display({
    "data": [{"type": "bar", "x": ["Maths", "Science", "English", "Art", "PE"],
              "y": [85, 92, 78, 95, 88],
              "marker": {"color": ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#ddd6fe"]}}],
    "layout": {"title": "My Grades"}
}, mime="application/vnd.plotly+json")

print("Bar chart sent!")

# --- Line Chart ---
pylearn.display({
    "data": [
        {"type": "scatter", "mode": "lines+markers",
         "x": [1, 2, 3, 4, 5, 6, 7], "y": [2, 5, 3, 8, 5, 9, 7],
         "name": "This week", "line": {"color": "#06b6d4"}},
        {"type": "scatter", "mode": "lines+markers",
         "x": [1, 2, 3, 4, 5, 6, 7], "y": [1, 3, 4, 5, 6, 7, 8],
         "name": "Last week", "line": {"color": "#f97316", "dash": "dot"}}
    ],
    "layout": {"title": "Steps Per Day", "xaxis": {"title": "Day"}, "yaxis": {"title": "Steps (thousands)"}}
}, mime="application/vnd.plotly+json")

print("Line chart sent!")

# --- Pie Chart ---
pylearn.display({
    "data": [{"type": "pie",
              "labels": ["Python", "JavaScript", "Scratch", "Other"],
              "values": [45, 30, 15, 10],
              "marker": {"colors": ["#6366f1", "#f59e0b", "#10b981", "#94a3b8"]}}],
    "layout": {"title": "Favourite Languages"}
}, mime="application/vnd.plotly+json")

print("Pie chart sent!")

# --- Scatter Plot ---
import random
random.seed(42)
xs = [random.gauss(50, 15) for _ in range(40)]
ys = [x * 0.6 + random.gauss(0, 10) for x in xs]

pylearn.display({
    "data": [{"type": "scatter", "mode": "markers",
              "x": xs, "y": ys,
              "marker": {"size": 8, "color": "#ec4899", "opacity": 0.7}}],
    "layout": {"title": "Height vs Shoe Size (made up!)",
               "xaxis": {"title": "Height (cm)"}, "yaxis": {"title": "Shoe Size"}}
}, mime="application/vnd.plotly+json")

print("All charts done!")
`,
  },
  {
    filename: "demo_turtle_art.py",
    content: `"""Turtle Graphics Demo — draws shapes using every turtle command."""
import pylearn

t = pylearn.Turtle(600, 400)

# Background colour
t.bgcolor("#0f172a")

# --- Draw a colourful star ---
t.pencolor("#f59e0b")
t.pensize(3)
t.penup()
t.goto(150, 200)
t.pendown()

for i in range(5):
    t.forward(100)
    t.right(144)

# --- Draw a circle ---
t.penup()
t.goto(400, 250)
t.pendown()
t.pencolor("#06b6d4")
t.pensize(2)
t.circle(50)

# --- Draw a filled rectangle ---
t.penup()
t.goto(350, 50)
t.pendown()
t.pencolor("#10b981")
t.fillcolor("#10b981")

# We can draw rect-like shapes with forward/right
for _ in range(2):
    t.forward(120)
    t.right(90)
    t.forward(60)
    t.right(90)

# --- Dots ---
t.penup()
colours = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6"]
for i, c in enumerate(colours):
    t.goto(80 + i * 40, 50)
    t.dot(20, c)

# --- Text ---
t.goto(80, 30)
t.pencolor("#e2e8f0")
t.write("Turtle Graphics!", font_size=20)

# --- Spiral ---
t.penup()
t.goto(450, 140)
t.pendown()
t.pensize(1)
for i in range(60):
    r = i / 60
    t.pencolor(f"hsl({i * 6}, 80%, 60%)")
    t.forward(2 + i * 0.8)
    t.right(25)

t.done()
print("Turtle drawing complete!")
`,
  },
  {
    filename: "demo_adventure.py",
    content: `"""Adventure Scene Demo — interactive visual-novel using the Output Panel."""
from pylearn import scene, say, ask, show_sprite, move_sprite

scene("forest")
show_sprite("hero", 50, 120)
say("You wake up in a mysterious forest.")
say("The trees tower above you, their leaves whispering secrets.")

name = ask("What is your name, brave explorer?")
say(f"Welcome, {name}! Your adventure begins now.")

show_sprite("chest", 250, 150)
say("You spot a glowing chest in the distance!")

choice = ask("Do you open the chest or walk away? (open/walk)")

if choice.lower().startswith("o"):
    move_sprite("hero", 200, 130)
    scene("village")
    say(f"{name} opens the chest and finds a magic key!")
    say("The key teleports you to a friendly village.")
    show_sprite("hero", 100, 120)
    say("The villagers welcome you with a feast!")
    say("THE END — You found the secret village!")
else:
    move_sprite("hero", 50, 80)
    scene("cave")
    say(f"{name} walks deeper into the forest...")
    say("You discover a hidden cave with ancient paintings.")
    show_sprite("hero", 80, 100)
    say("Inside the cave you find a map to buried treasure!")
    say("THE END — A new quest awaits!")
`,
  },
  {
    filename: "demo_html_display.py",
    content: `"""HTML Display Demo — renders styled HTML in the Output Panel."""
import pylearn

# --- Simple styled card ---
pylearn.display("""
<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 24px; border-radius: 12px; color: white; text-align: center;">
  <h2 style="margin: 0 0 8px 0;">Welcome to PyLearn!</h2>
  <p style="margin: 0; opacity: 0.9;">You can render any HTML in the Output Panel.</p>
</div>
""", mime="text/html")

# --- Data table ---
students = [
    ("Alice", 95, "A+"),
    ("Bob", 82, "B+"),
    ("Charlie", 91, "A"),
    ("Diana", 78, "B"),
    ("Eve", 99, "A+"),
]

rows = ""
for name, score, grade in students:
    bar_width = score
    bar_color = "#22c55e" if score >= 90 else "#eab308" if score >= 80 else "#f97316"
    rows += f"""<tr>
      <td>{name}</td>
      <td>{score}</td>
      <td><span style="background:{bar_color}; color:white; padding:2px 8px;
                       border-radius:4px; font-size:12px;">{grade}</span></td>
      <td><div style="background:{bar_color}; height:14px; border-radius:7px;
                      width:{bar_width}%; opacity:0.7;"></div></td>
    </tr>"""

pylearn.display(f"""
<h3 style="margin:0 0 8px 0;">Class Scores</h3>
<table>
  <thead><tr><th>Name</th><th>Score</th><th>Grade</th><th>Progress</th></tr></thead>
  <tbody>{rows}</tbody>
</table>
""", mime="text/html")

# --- Emoji grid ---
emojis = ["🐍", "🎨", "🚀", "🧪", "📊", "🎯", "💡", "⭐"]
cells = "".join(
    f'<div style="font-size:32px; text-align:center; padding:12px;">{e}</div>'
    for e in emojis
)
pylearn.display(f"""
<h3 style="margin:0 0 8px 0;">Fun with HTML</h3>
<div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:4px;">
  {cells}
</div>
<p style="color:#94a3b8; font-size:12px; margin-top:8px;">
  You can render any HTML — cards, tables, grids, even mini-games!
</p>
""", mime="text/html")

print("HTML demos sent!")
`,
  },
  {
    filename: "demo_show_everything.py",
    content: `"""Universal show() Demo — pylearn.show() detects the type automatically."""
import pylearn

# --- show() with a string → renders as HTML ---
pylearn.show("<h2 style='color:#6366f1;'>pylearn.show() can display anything!</h2>")

# --- show() with a dict that looks like Plotly → renders as chart ---
# (Using display() directly for Plotly dicts since show() needs a real Plotly figure object)
pylearn.display({
    "data": [{"type": "bar", "x": ["Mon", "Tue", "Wed", "Thu", "Fri"],
              "y": [3, 7, 2, 9, 5],
              "marker": {"color": "#8b5cf6"}}],
    "layout": {"title": "Cups of Tea This Week", "height": 250}
}, mime="application/vnd.plotly+json")

# --- show() with any object → renders as text ---
class Pet:
    def __init__(self, name, species, age):
        self.name = name
        self.species = species
        self.age = age
    def __str__(self):
        return f"{self.name} the {self.species} (age {self.age})"

pets = [Pet("Whiskers", "cat", 3), Pet("Buddy", "dog", 5), Pet("Goldie", "fish", 1)]
for pet in pets:
    pylearn.show(str(pet))

# --- display_image would work with a real PNG file ---
# pylearn.display_image("my_photo.png")

# --- Raw display with explicit MIME ---
pylearn.display("""
<div style="background:#1e293b; border:1px solid #334155; border-radius:8px;
            padding:16px; margin-top:8px;">
  <p style="color:#94a3b8; margin:0 0 8px 0; font-size:12px;">SUMMARY</p>
  <p style="color:#e2e8f0; margin:0;">
    <strong>pylearn.show(obj)</strong> detects the type:<br>
    • Plotly figure → interactive chart<br>
    • String → HTML<br>
    • Has _repr_html_ → HTML (Pandas DataFrames)<br>
    • Anything else → plain text
  </p>
</div>
""", mime="text/html")

# --- Turtle quick demo via show() ---
t = pylearn.Turtle(300, 200)
t.bgcolor("#1e293b")
t.pencolor("#f97316")
t.pensize(3)
for i in range(4):
    t.forward(60)
    t.right(90)
t.penup()
t.goto(80, 100)
t.pencolor("#e2e8f0")
t.write("Mini turtle!", font_size=14)
t.done()

print("All demos complete!")
`,
  },
];

router.post("/admin/programs/seed-demos", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const existing = await db
    .select({ filename: programTemplatesTable.filename })
    .from(programTemplatesTable);
  const existingNames = new Set(existing.map((p) => p.filename));

  const created: string[] = [];
  for (const demo of DEMO_PROGRAMS) {
    if (existingNames.has(demo.filename)) continue;
    await db.insert(programTemplatesTable).values({
      filename: demo.filename,
      content: demo.content,
      createdByAdminId: req.user.id,
    });
    created.push(demo.filename);
  }
  res.json({ created, skipped: DEMO_PROGRAMS.length - created.length });
});

router.delete("/admin/programs/:id", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(programTemplatesTable).where(eq(programTemplatesTable.id, id));
  res.json({ ok: true });
});

router.post("/admin/programs/:id/assign", async (req, res): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const { studentId } = req.body;
  if (isNaN(id) || !studentId || typeof studentId !== "string") {
    res.status(400).json({ error: "id and studentId are required" });
    return;
  }
  const [program] = await db
    .select()
    .from(programTemplatesTable)
    .where(eq(programTemplatesTable.id, id));
  if (!program) {
    res.status(404).json({ error: "Program not found" });
    return;
  }
  const [student] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, studentId));
  if (!student || student.role !== "student") {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  const [file] = await db
    .insert(filesTable)
    .values({
      userId: studentId,
      filename: program.filename,
      content: program.content,
    })
    .returning();
  res.status(201).json(file);
});

export default router;
