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

# logos and sounds: assets/logo.png (start-up + Sport), assets/logo-redline.png (Sport at redline),
# assets/start.mp3 (power on), assets/alert.mp3 (warnings); any of them may be missing.
# Logos are prepared like the web's prepareLogo() (but 512 px on the long side), dark background keyed
# out unless the file already has a transparent one, plus a red silhouette for the redline flash.
ASSETS_IN = os.path.join(ROOT, "assets")
ASSETS_OUT = os.path.join(OUT, "assets")
if os.path.isdir(ASSETS_OUT): shutil.rmtree(ASSETS_OUT)
os.makedirs(ASSETS_OUT)
manifest = {"logos": {}, "sounds": {}}
def prep_logo(src, name):
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    k = min(1, 512 / max(im.size))          # 512 px: shown mipmapped, so it stays smooth at any size
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    px = im.load()
    if not (px[0, 0][3] < 10 and px[im.width - 1, im.height - 1][3] < 10):
        for yy in range(im.height):
            for xx in range(im.width):
                r, g, b, a = px[xx, yy]
                lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
                px[xx, yy] = (r, g, b, round(a * max(0, min(1, (lum - 18) / 40))))
    im.save(os.path.join(ASSETS_OUT, name + ".png"))
    red = Image.new("RGBA", im.size, (0xff, 0x2d, 0x3f, 255)); red.putalpha(im.getchannel("A"))
    red.save(os.path.join(ASSETS_OUT, name + "-red.png"))
    manifest["logos"][name] = {"file": name + ".png", "w": im.width, "h": im.height, "tint": {"#ff2d3f": name + "-red.png"}}
for name, fn in (("main", "logo.png"), ("red", "logo-redline.png")):
    if os.path.exists(os.path.join(ASSETS_IN, fn)): prep_logo(os.path.join(ASSETS_IN, fn), name)
for name in ("start", "alert"):
    if os.path.exists(os.path.join(ASSETS_IN, name + ".mp3")):
        shutil.copy(os.path.join(ASSETS_IN, name + ".mp3"), ASSETS_OUT)
        manifest["sounds"][name] = name + ".mp3"
import json
# hand them to the shared code: logo slots, red tint lookup, sound slots
sub("  function tinted(pic, color) {", "  function tinted(pic, color) { if (pic && pic.__tint) return pic.__tint[color] || pic;", regex=False)
sub("  const SND = { start: null, alert: null };",
    "  const SND = { start: null, alert: null };\n  for (const k in __ASSETS.sounds) SND[k] = new Audio(k);", regex=False)
sub(r"(  try \{\n    const a = localStorage.getItem\(\"clusterLogo\"\);[^\n]*\n[^\n]*\n  \} catch \(e\) \{\}\n)",
    r"\1  logoImg = __logo('main') || logoImg; logoRedImg = __logo('red') || logoRedImg;\n")

prelude = open(os.path.join(ROOT, "tools", "qt_prelude.js"), encoding="utf-8").read()
prelude = prelude.replace("var __ASSETS = null;", "var __ASSETS = " + json.dumps(manifest) + ";")
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
print("port_qt: wrote qt/cluster.js (%d KB), qt/assets/, qt/fonts/" % (os.path.getsize(os.path.join(OUT, "cluster.js")) // 1024))
