#!/usr/bin/env python3
"""Build the Qt version (qt/cluster.js + assets) from the web prototype (web/index.html).

The design lives in one place: web/index.html. Run this after any design change:
    python3 tools/port_qt.py
It copies the drawing code, swaps the few browser-only calls for Qt-safe helpers
(see tools/qt_prelude.js), and writes qt/cluster.js and qt/fonts/.
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web", "index.html")
OUT = os.path.join(ROOT, "qt")

html = open(WEB, encoding="utf-8").read()
js = html[html.index("<script>") + len("<script>"): html.rindex("</script>")]

def sub(pattern, repl, count_min=1, regex=True):
    global js
    n = len(re.findall(pattern, js)) if regex else js.count(pattern)
    if n < count_min:
        sys.exit(f"port_qt: expected '{pattern}' in web/index.html, found {n}. Update tools/port_qt.py.")
    js = re.sub(pattern, repl, js) if regex else js.replace(pattern, repl)

# fonts: Qt's canvas wants one family name, loaded by FontLoader in main.qml
# (quoted: Qt 6.8 drops the space from an unquoted "DejaVu Sans", can't find "DejaVuSans",
#  and then keeps the previous font, so labels came out in the big gauge-numeral font)
sub(r"const FONT = '[^']*';", 'const FONT = "\'DejaVu Sans\'";')
for fam in ("Rajdhani", "Quicksand", "Michroma"):
    sub(r"family: \"'%s'[^\"]*\"" % fam, 'family: "%s"' % fam)
# canvas calls that differ between the browser and Qt
sub(r"\bctx\.drawImage\(", "__drawImage(ctx, ")
sub(r"\bctx\.ellipse\(", "__ellipse(ctx, ")
# text: on the live layers Qt's canvas text is very slow (each string becomes a path), so text()
# hands strings to __text, which lists them for native Qt Text items (see qt_prelude.js / main.qml)
sub(r"  function text\(str, x, y, size, color, opts = \{\}\) \{\n(?:    .*\n)+?  \}\n",
    "  function text(str, x, y, size, color, opts = {}) {\n"
    "    __text(ctx, String(str), x, y, size, color, opts.weight || 400, opts.family || FONT, opts.align || \"left\", opts.base || \"top\", opts.ls || 0);\n"
    "  }\n")
sub(r"  function measure\(str, size, weight = 400, ls = 0, family = FONT\) \{\n(?:    .*\n)+?  \}\n",
    "  function measure(str, size, weight = 400, ls = 0, family = FONT) { return __measure(ctx, String(str), size, weight, ls, family); }\n")
# transforms on the live layer are tracked so each string knows where it sits
sub(r"\bctx\.(translate|scale|rotate|save|restore|setTransform)\((\)?)",
    lambda m: "__M_%s(ctx%s" % (m.group(1), ")" if m.group(2) else ", "))

prelude = open(os.path.join(ROOT, "tools", "qt_prelude.js"), encoding="utf-8").read()
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "cluster.js"), "w", encoding="utf-8") as f:
    f.write(prelude + "\n" + js)

# (the carbon texture was removed from the design; delete any old copy)
if os.path.exists(os.path.join(OUT, "texture.png")): os.remove(os.path.join(OUT, "texture.png"))

# fonts
fd = os.path.join(OUT, "fonts"); os.makedirs(fd, exist_ok=True)
for name in os.listdir(os.path.join(ROOT, "fonts")):
    if name.lower().endswith(".ttf"):
        shutil.copy(os.path.join(ROOT, "fonts", name), fd)
print("port_qt: wrote qt/cluster.js (%d KB), qt/fonts/" % (os.path.getsize(os.path.join(OUT, "cluster.js")) // 1024))
