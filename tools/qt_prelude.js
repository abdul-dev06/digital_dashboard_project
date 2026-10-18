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
// carbon texture pattern from texture.png (loaded by the Canvas in main.qml)
var __texUrl = "";
function __pattern(c) {
  if (!__texUrl || c instanceof __RecCtx) return null;
  try { return c.createPattern(__texUrl, "repeat"); } catch (e) { return null; }
}

function __setTexUrl(u) { __texUrl = u; }
function __setMeasureCtx(c) { __measureCtx = c; }
var __API = null;
function __exportCluster(api) { __API = api; }
// ===== end of prelude: shared cluster code follows =====
