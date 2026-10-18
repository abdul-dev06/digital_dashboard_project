#!/usr/bin/env python3
"""Build the Qt version (qt/cluster.js + assets) from the web prototype (web/index.html).

The design lives in one place: web/index.html. Run this after any design change:
    python3 tools/port_qt.py
It copies the drawing code, swaps the few browser-only calls for Qt-safe helpers
(see tools/qt_prelude.js), and writes qt/cluster.js, qt/texture.png and qt/fonts/.
"""
import os, re, shutil, struct, zlib, sys

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
sub(r"const FONT = '[^']*';", 'const FONT = "DejaVu Sans";')
for fam in ("Rajdhani", "Quicksand", "Michroma"):
    sub(r"family: \"'%s'[^\"]*\"" % fam, 'family: "%s"' % fam)
# canvas calls that differ between the browser and Qt
sub(r"\bctx\.drawImage\(", "__drawImage(ctx, ")
sub(r"\bctx\.ellipse\(", "__ellipse(ctx, ")
sub("texPattern = texPattern || ctx.createPattern(texTile, \"repeat\");",
    "texPattern = texPattern || __pattern(ctx); if (!texPattern) return;", regex=False)

prelude = open(os.path.join(ROOT, "tools", "qt_prelude.js"), encoding="utf-8").read()
os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "cluster.js"), "w", encoding="utf-8") as f:
    f.write(prelude + "\n" + js)

# carbon texture tile: same seeded pattern as the web version, saved as a PNG
def texture_png(path, n=24):
    seed = 1337
    def rnd():
        nonlocal seed
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
    import math
    rows = []
    for yy in range(n):
        row = bytearray([0])
        for xx in range(n):
            cell = ((xx // 6) + (yy // 6)) % 2
            along = (xx % 6) if cell else (yy % 6)
            shade = 0.5 + 0.5 * math.sin((along / 6) * math.pi)
            v = 255 * (0.35 + 0.45 * shade) + (rnd() - 0.5) * 40
            v = int(max(0, min(255, v)))
            row += bytes([v, v, v, 255])
        rows.append(bytes(row))
    raw = b"".join(rows)
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", n, n, 8, 6, 0, 0, 0)) \
        + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)
texture_png(os.path.join(OUT, "texture.png"))

# fonts
fd = os.path.join(OUT, "fonts"); os.makedirs(fd, exist_ok=True)
for name in os.listdir(os.path.join(ROOT, "fonts")):
    if name.lower().endswith(".ttf"):
        shutil.copy(os.path.join(ROOT, "fonts", name), fd)
print("port_qt: wrote qt/cluster.js (%d KB), qt/texture.png, qt/fonts/" % (os.path.getsize(os.path.join(OUT, "cluster.js")) // 1024))
