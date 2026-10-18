// ===== Qt prelude (generated build, do not edit cluster.js by hand) =====
// The cluster's drawing code is shared with the web prototype (web/index.html).
// tools/port_qt.py copies that code here and puts this prelude in front of it.
// The prelude supplies the few browser things the code expects (document, window, timers,
// storage, offscreen canvases) so the same code runs inside Qt's Canvas.

var __t0 = Date.now();
var performance = { now: function () { return Date.now() - __t0; } };
var location = { search: "" };
var localStorage = { _m: {}, getItem: function (k) { return k in this._m ? this._m[k] : null; }, setItem: function (k, v) { this._m[k] = String(v); } };
function setTimeout() { return 0; }
function clearTimeout() {}
function requestAnimationFrame() { return 0; }   // Qt drives frames (FrameAnimation in main.qml)
function Audio(src) { this.src = src; this.currentTime = 0; this.play = function () { return null; }; }
function Image() { this.complete = false; }

// ---- minimal DOM stand-ins: buttons keep their click listeners so keyboard shortcuts still work ----
function __El(id) {
  this.id = id; this.textContent = ""; this.dataset = {}; this._l = {};
  this.classList = { add: function () {}, remove: function () {}, toggle: function () {} };
  this.style = {};
}
__El.prototype.addEventListener = function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); };
__El.prototype.setAttribute = function () {};
__El.prototype.setPointerCapture = function () {};
__El.prototype.click = function () { var l = this._l.click || []; for (var i = 0; i < l.length; i++) l[i]({ preventDefault: function () {}, target: this }); };
__El.prototype.getContext = function () { return new __RecCtx(this); };
var __els = {};
var __modeEls = ["eco", "normal", "sport"].map(function (m) { var e = new __El("mode-" + m); e.dataset.mode = m; return e; });
var __cv = new __El("cluster"); __cv.width = 1280; __cv.height = 480; __cv.clientWidth = 1280;
var document = {
  documentElement: new __El("html"),
  getElementById: function (id) { if (id === "cluster") return __cv; return __els[id] || (__els[id] = new __El(id)); },
  querySelectorAll: function (sel) { return sel === "[data-mode]" ? __modeEls : []; },
  querySelector: function (sel) {
    var m = /^\[data-mode="(\w+)"\]$/.exec(sel); if (m) return __modeEls.filter(function (e) { return e.dataset.mode === m[1]; })[0] || null;
    if (sel.charAt(0) === "#") return this.getElementById(sel.slice(1));
    return null;
  },
  createElement: function () { var c = new __El("canvas"); c.width = 0; c.height = 0; c._ops = []; return c; }
};
var window = {
  devicePixelRatio: 1, _l: {},
  addEventListener: function (t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
};
// called from main.qml for key presses: same event shape as the browser
function __key(type, code, repeat) {
  var l = window._l[type] || [];
  for (var i = 0; i < l.length; i++) l[i]({ code: code, repeat: !!repeat, preventDefault: function () {} });
}

// ---- recording "offscreen canvas": small cached drawings (car, icons) are recorded once and replayed ----
var __measureCtx = null;           // a real context, for measureText while recording
function __RecGrad(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
__RecGrad.prototype.addColorStop = function (o, c) { this.stops.push([o, c]); };
function __RecCtx(canvas) { this.canvas = canvas; this._st = { globalAlpha: 1 }; this._stack = []; }
["beginPath", "moveTo", "lineTo", "arc", "arcTo", "quadraticCurveTo", "bezierCurveTo", "closePath", "rect",
 "fill", "stroke", "fillRect", "strokeRect", "clearRect", "translate", "scale", "rotate", "clip", "fillText", "setLineDash"].forEach(function (n) {
  __RecCtx.prototype[n] = function () { this.canvas._ops.push([n, Array.prototype.slice.call(arguments)]); };
});
__RecCtx.prototype.save = function () { this._stack.push(Object.assign({}, this._st)); this.canvas._ops.push(["save", []]); };
__RecCtx.prototype.restore = function () { if (this._stack.length) this._st = this._stack.pop(); this.canvas._ops.push(["restore", []]); };
__RecCtx.prototype.setTransform = function () {};
__RecCtx.prototype.ellipse = function () { this.canvas._ops.push(["ellipse", Array.prototype.slice.call(arguments)]); };
__RecCtx.prototype.drawImage = function () { this.canvas._ops.push(["drawImage", Array.prototype.slice.call(arguments)]); };
__RecCtx.prototype.createLinearGradient = function () { return new __RecGrad("linear", Array.prototype.slice.call(arguments)); };
__RecCtx.prototype.createRadialGradient = function () { return new __RecGrad("radial", Array.prototype.slice.call(arguments)); };
__RecCtx.prototype.createPattern = function () { return null; };
__RecCtx.prototype.createImageData = function (w, h) { return { width: w, height: h, data: new Array(w * h * 4) }; };
__RecCtx.prototype.getImageData = function (x, y, w, h) { return this.createImageData(w, h); };
__RecCtx.prototype.putImageData = function () {};
__RecCtx.prototype.measureText = function (s) { if (__measureCtx) { __measureCtx.font = this._st.font || "10px sans-serif"; return __measureCtx.measureText(s); } return { width: String(s).length * 6 }; };
["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin", "globalAlpha", "font", "textAlign", "textBaseline",
 "globalCompositeOperation", "lineDashOffset", "miterLimit"].forEach(function (n) {
  Object.defineProperty(__RecCtx.prototype, n, {
    get: function () { return this._st[n]; },
    set: function (v) { this._st[n] = v; this.canvas._ops.push(["=" + n, [v]]); }
  });
});
function __realStyle(c, v) {
  if (!(v instanceof __RecGrad)) return v;
  var g = v.kind === "linear" ? c.createLinearGradient.apply(c, v.args) : c.createRadialGradient.apply(c, v.args);
  for (var i = 0; i < v.stops.length; i++) g.addColorStop(v.stops[i][0], v.stops[i][1]);
  return g;
}
function __replay(c, rec) {
  var base = c.globalAlpha;
  for (var i = 0; i < rec._ops.length; i++) {
    var op = rec._ops[i], n = op[0], a = op[1];
    if (n.charAt(0) === "=") {
      var p = n.slice(1);
      if (p === "globalAlpha") c.globalAlpha = base * a[0];
      else if (p === "fillStyle" || p === "strokeStyle") c[p] = __realStyle(c, a[0]);
      else c[p] = a[0];
    } else if (n === "ellipse") __ellipse(c, a[0], a[1], a[2], a[3]);
    else if (n === "drawImage") __drawImage.apply(null, [c].concat(a));
    else c[n].apply(c, a);
  }
}
// drawImage that also accepts recorded canvases (replayed, scaled into the target box)
function __drawImage(c, img, x, y, w, h) {
  if (img && img._ops) {
    var sw = img.width || 1, sh = img.height || 1;
    if (w === undefined) { w = sw; h = sh; }
    c.save(); c.translate(x, y); c.scale(w / sw, h / sh); __replay(c, img); c.restore();
    return;
  }
  if (img) c.drawImage(img, x, y, w, h);
}
// full ellipse (all calls in the code are full, unrotated ellipses)
function __ellipse(c, x, y, rx, ry) {
  if (c instanceof __RecCtx) { c.ellipse(x, y, rx, ry); return; }
  c.ellipse(x - rx, y - ry, rx * 2, ry * 2);
}
// ---- live layers: transforms are tracked and text is handed to native Qt Text items ----
// Qt's canvas turns every fillText into a path (slow on the Rock64), and the text barely
// changes between frames, so on the live layers text() only records each string with the
// transform and opacity it would have been drawn with. main.qml shows them with Text items,
// which the GPU draws from a glyph cache and which are only touched when a string changes.
var __L = null, __m = [1, 0, 0, 1, 0, 0], __ms = [], __T = [];
function __beginLive(c) { __L = c; __m = [1, 0, 0, 1, 0, 0]; __ms = []; __T = []; }
function __endLive() { __L = null; return __T; }
function __M_save(c) { if (c === __L) __ms.push(__m.slice()); c.save(); }
function __M_restore(c) { if (c === __L && __ms.length) __m = __ms.pop(); c.restore(); }
function __M_translate(c, x, y) {
  if (c === __L) { __m[4] += __m[0] * x + __m[2] * y; __m[5] += __m[1] * x + __m[3] * y; }
  c.translate(x, y);
}
function __M_scale(c, sx, sy) {
  if (c === __L) { __m[0] *= sx; __m[1] *= sx; __m[2] *= sy; __m[3] *= sy; }
  c.scale(sx, sy);
}
function __M_rotate(c, a) {
  if (c === __L) {
    var cs = Math.cos(a), sn = Math.sin(a), m = __m;
    __m = [m[0] * cs + m[2] * sn, m[1] * cs + m[3] * sn, m[2] * cs - m[0] * sn, m[3] * cs - m[1] * sn, m[4], m[5]];
  }
  c.rotate(a);
}
function __M_setTransform(c, a, b, cc, d, e, f) { if (c === __L) __m = [a, b, cc, d, e, f]; c.setTransform(a, b, cc, d, e, f); }
function __text(c, s, x, y, size, color, weight, family, align, base, ls) {
  if (c !== __L) {      // static layers and recorded images: draw it on the canvas as usual
    c.font = weight + " " + size + "px " + family; c.fillStyle = color;
    c.textAlign = align; c.textBaseline = base; c.fillText(s, x, y);
    return;
  }
  var a = c.globalAlpha;
  if (a <= 0.003 || s === "") return;
  __T.push([s, x, y, size, color, weight, family, align, base, ls, a, __m[0], __m[1], __m[2], __m[3], __m[4], __m[5]]);
}
function __measure(c, s, size, weight, ls, family) {
  c.font = weight + " " + size + "px " + family;
  return c.measureText(s).width + ls * s.length;     // letter spacing is drawn by the Text items
}
var __colors = {}, __fonts = {};
function __qcolor(v) {
  if (typeof v !== "string") return "#ffffff";
  var c = __colors[v];
  if (c !== undefined) return c;
  var m = /^rgba?\(([^)]*)\)$/.exec(v.replace(/\s+/g, ""));
  if (m) { var p = m[1].split(","); c = Qt.rgba(p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? +p[3] : 1); }
  else c = v;
  return (__colors[v] = c);
}
// Show a frame's strings on a pool of Text items (each item only changes when its string does).
// Text items have width 0, so left/centre/right alignment happens around the anchor point.
var __pools = {};
function __setPool(id, items) { var k = []; for (var i = 0; i < items.length; i++) k.push(""); __pools[id] = { items: items, keys: k }; }
function __applyTexts(id, list) {
  if (!__pools[id]) return;
  var pool = __pools[id].items, keys = __pools[id].keys;
  var n = Math.min(list.length, pool.length);
  for (var i = 0; i < n; i++) {
    var r = list[i], it = pool[i], key = r.join("|");
    if (keys[i] === key) continue;
    keys[i] = key;
    var size = r[3], px = Math.max(1, Math.round(size)), k = size / px;
    var fam = r[6].replace(/['"]/g, ""), fk = fam + "|" + px + "|" + r[5] + "|" + r[9];
    var f = __fonts[fk] || (__fonts[fk] = Qt.font({ family: fam, pixelSize: px, weight: r[5], letterSpacing: r[9] }));
    it.font = f; it.text = r[0]; it.color = __qcolor(r[4]); it.opacity = r[10];
    it.horizontalAlignment = r[7] === "center" ? 4 : (r[7] === "right" || r[7] === "end") ? 2 : 1;   // AlignHCenter / AlignRight / AlignLeft
    var b = r[8], h = it.implicitHeight;
    var dy = (b === "top" || b === "hanging") ? 0 : b === "alphabetic" ? -it.baselineOffset : b === "middle" ? -h / 2 : -h;
    var x = r[1], y = r[2] + k * dy;
    it.mx = Qt.matrix4x4(r[11] * k, r[13] * k, 0, r[11] * x + r[13] * y + r[15],
                         r[12] * k, r[14] * k, 0, r[12] * x + r[14] * y + r[16],
                         0, 0, 1, 0, 0, 0, 0, 1);
    it.visible = true;
  }
  for (var j = n; j < pool.length; j++) if (keys[j] !== "") { keys[j] = ""; pool[j].visible = false; }
}

// ---- sections: live parts on their own canvases, repainted only when their inputs change ----
// draw() calls the hook instead of drawing a section. The hook compares the section's deps, the
// frame's theme state and where/how faded the section would be drawn with last time; only on a
// change does it keep the drawing function and ask that section's canvas to repaint
// (main.qml then calls __secPaint, in the same frame).
var __secs = {}, __secFrame = 0;
function __secRegister(name, canvas) { __secs[name] = { canvas: canvas, deps: null, fn: null, m: null, a: 1, seen: -1, shown: false, busy: 0 }; }
// A canvas is "busy" from requestPaint until Qt has rendered it (its painted signal -> __secDone).
// While busy, changes wait for the next frame instead of queueing up: queued paints made the
// picture lag behind the keys. (Safety: a paint that never reports back frees it after 300 ms.)
function __busy(s) { return s.busy && Date.now() - s.busy < 300; }
function __secDone(name) { var s = __secs[name]; if (s) s.busy = 0; }
function __secRequest(s) { s.busy = Date.now(); s.canvas.requestPaint(); }
function __same(a, b) {
  if (!b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function __secHook(name, deps, fn, c, frameSig, bounds) {
  var s = __secs[name];
  if (!s || c !== __L) { fn(); return; }           // no canvas for it, or not on the live layer: draw in place
  var a = c.globalAlpha, full = deps.concat(frameSig || [], __m, [a]);
  s.seen = __secFrame;
  if (s.shown && __same(full, s.deps)) return;
  if (__busy(s)) return;                            // still drawing the last change: try again next frame
  s.deps = full; s.fn = fn; s.m = __m.slice(); s.a = a; s.shown = true;
  if (bounds) __secFit(s.canvas, bounds);
  __secRequest(s);
}
// move/resize a section's canvas to the on-screen box around its local bounds (whole pixels, on the stage)
function __secFit(cv, b) {
  var xs = [b[0], b[0] + b[2]], ys = [b[1], b[1] + b[3]], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, m = __m;
  for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
    var X = m[0] * xs[i] + m[2] * ys[j] + m[4], Y = m[1] * xs[i] + m[3] * ys[j] + m[5];
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1);
  x1 = Math.min(1280, Math.ceil(x1) + 1); y1 = Math.min(480, Math.ceil(y1) + 1);
  var w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  if (cv.x !== x0) cv.x = x0;
  if (cv.y !== y0) cv.y = y0;
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
}
function __secEndFrame() {          // sections not drawn this frame (faded out, other mode) get cleared once
  for (var k in __secs) {
    var s = __secs[k];
    if (s.seen !== __secFrame && s.shown && !__busy(s)) { s.shown = false; s.fn = null; s.deps = null; __secRequest(s); }
  }
  __secFrame++;
}
function __secPaint(name, c, api, ox, oy, w, h) {   // the canvas covers (ox, oy, w, h) of the screen
  var s = __secs[name], drew = false;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.clearRect(0, 0, w, h);
  __beginLive(c);
  if (s && s.fn) {
    api.setCtx(c);
    var m = s.m;
    __M_save(c);
    c.setTransform(m[0], m[1], m[2], m[3], m[4] - ox, m[5] - oy);   // canvas is offset; the text positions are not
    __m = m.slice();
    c.globalAlpha = s.a;
    s.fn();
    __M_restore(c);
    drew = true;
  }
  __applyTexts(name, __endLive());
  return drew;
}

function __setMeasureCtx(c) { __measureCtx = c; }
// A do-nothing 2D context: when the live layer itself hasn't changed, draw() still runs against
// this so the sections are checked, but nothing is painted or uploaded.
var __nullCtx = (function () {
  var c = { globalAlpha: 1, font: "", fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
            textAlign: "left", textBaseline: "top", globalCompositeOperation: "source-over", lineDashOffset: 0, miterLimit: 10 };
  var _st = [];
  var grad = { addColorStop: function () {} };
  ["beginPath", "moveTo", "lineTo", "arc", "arcTo", "quadraticCurveTo", "bezierCurveTo", "closePath", "rect", "fill", "stroke",
   "fillRect", "strokeRect", "clearRect", "translate", "scale", "rotate", "clip", "fillText", "setLineDash", "setTransform",
   "ellipse", "drawImage"].forEach(function (n) { c[n] = function () {}; });
  c.save = function () { _st.push(c.globalAlpha); };
  c.restore = function () { if (_st.length) c.globalAlpha = _st.pop(); };
  c.createLinearGradient = c.createRadialGradient = function () { return grad; };
  c.createPattern = function () { return null; };
  c.measureText = function (s) { if (__measureCtx) { __measureCtx.font = c.font; return __measureCtx.measureText(s); } return { width: String(s).length * 6 }; };
  c.reset = function () { _st = []; c.globalAlpha = 1; };
  return c;
})();
function __drawSectionsOnly(api) {
  __nullCtx.reset(); api.setCtx(__nullCtx); __beginLive(__nullCtx);
  api.draw();
  __endLive(); __secEndFrame();
}
var __API = null;
function __exportCluster(api) { __API = api; }
// ===== end of prelude: shared cluster code follows =====
