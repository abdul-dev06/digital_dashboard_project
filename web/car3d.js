// 3D wireframe car for the web dashboard. No libraries: a small loft model, a perspective camera
// and back-to-front drawing on the cluster's own 2D canvas.
//
// The body is built from a car profile's measurements (profiles.js): length, width, height,
// wheelbase, front overhang, wheel size, track and a body style. The style gives the shape of the
// side silhouette as fractions (where the windshield, roof and rear glass sit, how tall the hood and
// deck are); the measurements scale it to the real car. A new car only needs its numbers.
//
// Coordinates (metres, the car's own frame): x to the right, y up from the ground, z forward.
// The car's centre is at x = 0, z = 0; the front bumper is at z = +length/2.
(function (root) {
  "use strict";
  const DEG = Math.PI / 180;

  // Body styles. Each key station: u = 0 at the rear bumper .. 1 at the front bumper, heights as
  // fractions of the car's height: bot (bottom of the body), sh (shoulder / belt line), top (roof,
  // deck or hood at the centre line), tw (half-width of the top surface, fraction of half-width),
  // hw (half-width of the body at that station). Zones say where the glass is.
  const STYLES = {
    sedan: {
      keys: [
        [0.000, 0.24, 0.53, 0.58, 0.70, 0.90],
        [0.040, 0.18, 0.63, 0.69, 0.80, 0.97],
        [0.160, 0.16, 0.66, 0.72, 0.82, 1.00],
        [0.250, 0.16, 0.66, 0.73, 0.80, 1.00],
        [0.400, 0.15, 0.665, 1.00, 0.64, 1.00],
        [0.530, 0.15, 0.665, 1.00, 0.66, 1.00],
        [0.660, 0.15, 0.665, 0.99, 0.66, 1.00],
        [0.790, 0.16, 0.66, 0.67, 0.80, 0.99],
        [0.900, 0.17, 0.61, 0.62, 0.80, 0.98],
        [0.975, 0.19, 0.53, 0.54, 0.74, 0.95],
        [1.000, 0.22, 0.43, 0.47, 0.62, 0.86],
      ],
      rearGlass: [0.25, 0.40], roof: [0.40, 0.66], windshield: [0.66, 0.79], sideGlass: [0.25, 0.79],
    },
    coupe: {
      keys: [
        [0.000, 0.24, 0.55, 0.60, 0.70, 0.90],
        [0.040, 0.18, 0.66, 0.72, 0.80, 0.97],
        [0.150, 0.16, 0.69, 0.75, 0.82, 1.00],
        [0.220, 0.16, 0.69, 0.76, 0.80, 1.00],
        [0.420, 0.15, 0.69, 1.00, 0.62, 1.00],
        [0.640, 0.15, 0.69, 0.99, 0.64, 1.00],
        [0.790, 0.16, 0.68, 0.69, 0.80, 0.99],
        [0.900, 0.17, 0.63, 0.64, 0.80, 0.98],
        [0.975, 0.19, 0.55, 0.56, 0.74, 0.95],
        [1.000, 0.22, 0.45, 0.49, 0.62, 0.86],
      ],
      rearGlass: [0.22, 0.42], roof: [0.42, 0.64], windshield: [0.64, 0.79], sideGlass: [0.22, 0.79],
    },
    suv: {
      keys: [
        [0.000, 0.26, 0.56, 0.62, 0.78, 0.92],
        [0.030, 0.20, 0.60, 0.88, 0.76, 0.98],
        [0.080, 0.19, 0.60, 0.97, 0.72, 1.00],
        [0.200, 0.18, 0.60, 1.00, 0.70, 1.00],
        [0.530, 0.18, 0.60, 1.00, 0.72, 1.00],
        [0.680, 0.18, 0.60, 0.98, 0.72, 1.00],
        [0.790, 0.19, 0.59, 0.62, 0.82, 0.99],
        [0.900, 0.20, 0.57, 0.585, 0.82, 0.98],
        [0.975, 0.22, 0.52, 0.53, 0.76, 0.95],
        [1.000, 0.25, 0.44, 0.47, 0.64, 0.88],
      ],
      rearGlass: [0.03, 0.08], roof: [0.08, 0.68], windshield: [0.68, 0.79], sideGlass: [0.08, 0.79],
    },
  };
  STYLES.hatch = STYLES.suv;   // close enough for a wire diagram

  function stationAt(keys, u) {
    if (u <= keys[0][0]) return keys[0].slice(1);
    for (let i = 1; i < keys.length; i++) {
      if (u <= keys[i][0]) {
        const a = keys[i - 1], b = keys[i], k = (u - a[0]) / (b[0] - a[0]);
        return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
      }
    }
    return keys[keys.length - 1].slice(1);
  }

  // Build the model: faces (polygons of 3D points, each with a kind) and wheels.
  function build(body) {
    const b = Object.assign({ style: "sedan", length: 4.5, width: 1.78, height: 1.48, wheelbase: 2.65,
      frontOverhang: 0.92, wheelRadius: 0.31, track: 1.53 }, body || {});
    const S = STYLES[b.style] || STYLES.sedan, L = b.length, H = b.height, HW = b.width / 2, r = b.wheelRadius;
    const zOf = u => -L / 2 + u * L, uOf = z => (z + L / 2) / L;
    const zf = L / 2 - b.frontOverhang, zr = zf - b.wheelbase, archR = r * 1.14;
    // stations: the style's keys, a few in between, and the wheel arches
    const us = new Set(S.keys.map(k => k[0]));
    for (const za of [zf, zr]) for (const d of [-1.15, -0.65, 0, 0.65, 1.15]) us.add(uOf(za + d * r));
    // drop stations that crowd each other (less than 9 cm apart): fewer, cleaner lines
    const list = [];
    for (const u of [...us].filter(u => u >= 0 && u <= 1).sort((p, q) => p - q))
      if (!list.length || (u - list[list.length - 1]) * L > 0.09 || u === 1) list.push(u);
    const st = list.map(u => {
      const [bot, sh, top, tw, hw] = stationAt(S.keys, u), z = zOf(u);
      let botY = bot * H;
      for (const za of [zf, zr]) {                     // wheel arch: lift the bottom of the body over the wheel
        const d = z - za;
        if (Math.abs(d) < archR) botY = Math.max(botY, r + Math.sqrt(archR * archR - d * d) * 0.92);
      }
      const shY = sh * H, topY = top * H, w = hw * HW;
      const ring = [                                   // right half, bottom to top
        [w * 0.95, botY], [w, botY + (shY - botY) * 0.45], [w * 0.985, shY],
        [tw * HW, topY - Math.min(0.05, (topY - shY) * 0.3)], [0, topY],
      ];
      return { u, z, ring };
    });
    const faces = [];
    const P = (s, i, side) => [side * s.ring[i][0], s.ring[i][1], s.z];
    const inZone = (zone, u0, u1) => zone && u0 >= zone[0] - 1e-6 && u1 <= zone[1] + 1e-6;
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i], c = st[i + 1];
      for (let band = 0; band < 4; band++) {
        let kind = "body";
        if (band === 2 && inZone(S.sideGlass, a.u, c.u)) kind = "glass";
        if (band === 3) {
          kind = inZone(S.windshield, a.u, c.u) || inZone(S.rearGlass, a.u, c.u) ? "glass"
               : inZone(S.roof, a.u, c.u) ? "roof" : a.u >= S.windshield[1] - 1e-6 ? "hood" : "deck";
        }
        if (i === st.length - 2 && band === 2) kind = "headlight";
        if (i === 0 && band === 1) kind = "taillight";
        for (const side of [1, -1]) {
          const quad = [P(a, band, side), P(c, band, side), P(c, band + 1, side), P(a, band + 1, side)];
          faces.push({ pts: side > 0 ? quad : quad.reverse(), kind, side });
        }
      }
    }
    // front and rear caps
    for (const [s, kind, flip] of [[st[st.length - 1], "front", false], [st[0], "rear", true]]) {
      const loop = s.ring.map((p, i) => P(s, i, 1)).concat(s.ring.slice(0, -1).reverse().map((p, i, arr) => P(s, arr.length - 1 - i, -1)));
      faces.push({ pts: flip ? loop.reverse() : loop, kind });
    }
    // wheels: tyre tread + outer face (the rim and spokes are drawn on it)
    const wheels = [];
    const N = 12, tyreW = 0.2;
    for (const za of [zf, zr]) for (const side of [1, -1]) {
      const xo = side * (b.track / 2 + tyreW / 2), xi = side * (b.track / 2 - tyreW / 2);
      const ringAt = x => Array.from({ length: N }, (_, k) => { const t = k / N * Math.PI * 2; return [x, r + Math.sin(t) * r, za + Math.cos(t) * r]; });
      const ro = ringAt(xo), ri = ringAt(xi);
      for (let k = 0; k < N; k++) {
        const k2 = (k + 1) % N;
        const quad = [ri[k], ri[k2], ro[k2], ro[k]];
        faces.push({ pts: side > 0 ? quad.reverse() : quad, kind: "tyre" });
      }
      const face = { pts: side > 0 ? ro.slice() : ro.slice().reverse(), kind: "wheel", wheel: { x: xo, za, r } };
      faces.push(face);
      wheels.push(face.wheel);
    }
    for (const f of faces) {                          // outward normal + centre, for culling, shading and sorting
      const p = f.pts, c = [0, 0, 0];
      for (const q of p) { c[0] += q[0]; c[1] += q[1]; c[2] += q[2]; }
      c[0] /= p.length; c[1] /= p.length; c[2] /= p.length;
      let n = [0, 0, 0];
      for (let i = 0; i < p.length; i++) {             // Newell's method
        const u = p[i], v = p[(i + 1) % p.length];
        n[0] += (u[1] - v[1]) * (u[2] + v[2]); n[1] += (u[2] - v[2]) * (u[0] + v[0]); n[2] += (u[0] - v[0]) * (u[1] + v[1]);
      }
      const len = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(v => v / len);
      // make it point outwards: away from the body's middle, or from the wheel's axle
      let out;
      if (f.kind === "tyre") out = [0, c[1] - r, c[2] - (Math.abs(c[2] - zf) < Math.abs(c[2] - zr) ? zf : zr)];
      else if (f.kind === "wheel") out = [Math.sign(c[0]), 0, 0];
      else out = [c[0], c[1] - H * 0.45, c[2]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) { n = n.map(v => -v); f.pts.reverse(); }
      f.c = c; f.n = n;
    }
    return { faces, wheels, L, H, HW, r, zf, zr, track: b.track };
  }

  // ---- camera ----
  // view: { cx, cy, F, yaw, pitch, dist, ty, tz } — orbit camera round the point (0, ty, tz).
  // yaw 0 = behind the car, 90 = on its right side, 180 = in front. pitch = degrees above.
  function camera(v) {
    const cy = Math.cos(v.yaw * DEG), sy = Math.sin(v.yaw * DEG), cp = Math.cos(v.pitch * DEG), sp = Math.sin(v.pitch * DEG);
    const ty = v.ty, tz = v.tz || 0;
    const pos = [sy * cp * v.dist, ty + sp * v.dist, tz - cy * cp * v.dist];
    // world -> camera: rotate about y by yaw, then tilt by pitch, then push out by dist
    function toCam(p) {
      const x = p[0], y = p[1] - ty, z = p[2] - tz;
      const x1 = cy * x + sy * z, z1 = -sy * x + cy * z;
      const y2 = cp * y + sp * z1, z2 = -sp * y + cp * z1 + v.dist;
      return [x1, y2, z2];
    }
    function project(p) { const q = toCam(p); return [v.cx + v.F * q[0] / q[2], v.cy - v.F * q[1] / q[2], q[2]]; }
    return { pos, toCam, project };
  }

  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; };
  const mix = (a, b, k) => { const x = hexRgb(a), y = hexRgb(b); return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join(""); };
  const LIGHT = (() => { const l = [-0.35, 0.85, 0.4], n = Math.hypot(...l); return l.map(v => v / n); })();

  // ---- the road under the car: lane lines that scroll with the distance travelled ----
  function drawGround(ctx, cam, s) {
    const near = 0.6, fogFrom = 12, fogTo = 70, a0 = s.groundAlpha;
    if (a0 <= 0.01) return;
    const seg = (p, q, col, alpha, width) => {
      let A = cam.toCam(p), B = cam.toCam(q);
      if (A[2] < near && B[2] < near) return;
      if (A[2] < near) { const k = (near - A[2]) / (B[2] - A[2]); A = A.map((v, i) => v + (B[i] - v) * k); }
      if (B[2] < near) { const k = (near - B[2]) / (A[2] - B[2]); B = B.map((v, i) => v + (A[i] - v) * k); }
      const d = (A[2] + B[2]) / 2, fog = 1 - Math.max(0, Math.min(1, (d - fogFrom) / (fogTo - fogFrom)));
      if (fog <= 0.01) return;
      ctx.beginPath();
      ctx.moveTo(s.view.cx + s.view.F * A[0] / A[2], s.view.cy - s.view.F * A[1] / A[2]);
      ctx.lineTo(s.view.cx + s.view.F * B[0] / B[2], s.view.cy - s.view.F * B[1] / B[2]);
      ctx.strokeStyle = rgba(col, alpha * fog * a0); ctx.lineWidth = width; ctx.stroke();
    };
    const z0 = -14, z1 = 80, off = s.travel;
    // faint cross lines every 4 m: the sense of speed
    for (let z = z0 - (off % 4); z < z1; z += 4) seg([-5.4, 0, z], [5.4, 0, z], s.accent, 0.10, 1);
    // lane lines either side of the car: 3 m dashes, 6 m gaps
    for (const x of [-1.85, 1.85]) for (let z = z0 - (off % 9); z < z1; z += 9) seg([x, 0, z], [x, 0, z + 3], "#e8ecf0", 0.55, 1.6);
    // road edges
    for (const x of [-5.5, 5.5]) for (let z = z0; z < z1; z += 6) seg([x, 0, z], [x, 0, z + 6], s.accent, 0.8, 2);
  }

  // ---- draw the car ----
  // s: { view, line (theme colour), accent, alpha, groundAlpha, travel (m), wheelTurn (rad),
  //      brake 0..1, turnL, turnR (lit now), heat (-1 cold .. +1 hot), bodyPitch (rad, + = nose down) }
  function render(ctx, M, s) {
    if (s.alpha <= 0.01) return;
    const cam = camera(s.view), v = s.view;
    ctx.save();
    ctx.globalAlpha *= s.alpha;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    if (s.parts !== "car") drawGround(ctx, cam, s);       // parts: "ground", "car", or both (default)
    if (s.parts === "ground") { ctx.restore(); return; }

    // shadow on the road, and the engine's heat under the hood
    const ell = (rx, rz, cz, fill) => {
      ctx.beginPath();
      for (let k = 0; k <= 28; k++) {
        const t = k / 28 * Math.PI * 2, q = cam.toCam([Math.cos(t) * rx, 0, cz + Math.sin(t) * rz]);
        if (q[2] < 0.3) return;
        const x = v.cx + v.F * q[0] / q[2], y = v.cy - v.F * q[1] / q[2];
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.fillStyle = fill; ctx.fill();
    };
    ell(M.HW * 1.18, M.L * 0.56, 0, "rgba(0,0,0,0.6)");
    if (Math.abs(s.heat) > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ell(M.HW * 1.3, M.L * 0.3, M.zf, rgba(s.heat > 0 ? "#ff2d3f" : "#3d8bff", 0.28 * Math.abs(s.heat)));
      ctx.restore();
    }

    // body pitch (braking dives the nose, accelerating squats): a small shear of the body, not the wheels
    const pitchK = Math.sin(s.bodyPitch || 0), pivotZ = (M.zf + M.zr) / 2;
    const bodyPt = p => pitchK ? [p[0], p[1] - (p[2] - pivotZ) * pitchK, p[2]] : p;
    const camPos = cam.pos;
    const items = [];
    for (const f of M.faces) {
      const vx = camPos[0] - f.c[0], vy = camPos[1] - f.c[1], vz = camPos[2] - f.c[2];
      const it_facing = (f.n[0] * vx + f.n[1] * vy + f.n[2] * vz) / (Math.hypot(vx, vy, vz) || 1);
      if (it_facing <= 0) continue;                    // back faces: skipped before any projecting
      const body = f.kind !== "tyre" && f.kind !== "wheel";
      const pts = body ? f.pts.map(bodyPt) : f.pts;
      const proj = []; let behind = false, depth = 0;
      for (const p of pts) { const q = cam.project(p); if (q[2] < 0.25) { behind = true; break; } proj.push(q); depth += q[2]; }
      if (behind) continue;
      items.push({ f, proj, depth: depth / proj.length, facing: it_facing });
    }
    items.sort((p, q) => q.depth - p.depth);
    const line = s.line, dark = "#0a0e13";
    const blink = s.blink;
    for (const it of items) {
      const { f, proj, facing } = it;
      ctx.beginPath(); ctx.moveTo(proj[0][0], proj[0][1]);
      for (let i = 1; i < proj.length; i++) ctx.lineTo(proj[i][0], proj[i][1]);
      ctx.closePath();
      if (facing <= 0) continue;                       // far side: hidden behind the near side
      const lam = Math.max(0, f.n[0] * LIGHT[0] + f.n[1] * LIGHT[1] + f.n[2] * LIGHT[2]);
      let fill, edge = rgba(line, 0.35 + 0.5 * facing), lw = 1;
      switch (f.kind) {
        case "glass": fill = mix("#03060a", line, 0.04 + 0.10 * lam); edge = rgba(line, 0.6 + 0.4 * facing); break;
        case "tyre": fill = mix("#07090c", "#1b2027", lam); edge = rgba("#3a434d", 0.6); lw = 0.7; break;
        case "wheel": fill = "#0d1116"; edge = rgba(line, 0.7); break;
        case "headlight": fill = mix("#9fb8d6", "#ffffff", lam); edge = "#ffffff"; break;
        case "taillight": fill = mix("#5a0d16", "#ff2d3f", 0.45 + 0.55 * (s.brake || 0)); edge = "#ff5060"; break;
        case "hood": {
          const hk = Math.abs(s.heat || 0);
          fill = mix(mix(dark, line, 0.08 + 0.2 * lam), s.heat > 0 ? "#ff2d3f" : "#3d8bff", 0.5 * hk); break;
        }
        default: fill = mix(dark, line, 0.10 + (f.kind === "roof" ? 0.30 : 0.24) * lam);
      }
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.stroke();
      if (f.kind === "wheel") drawRim(ctx, cam, f.wheel, s.wheelTurn || 0, line, s.spokes !== false);
    }
    // indicators: amber at the corners while blinking
    if (s.turnL || s.turnR) {
      for (const [on, side] of [[s.turnL, -1], [s.turnR, 1]]) {
        if (!on) continue;
        for (const z of [M.L / 2 - 0.08, -M.L / 2 + 0.1]) {
          const q = cam.project(bodyPt([side * M.HW * 0.9, M.H * 0.5, z]));
          if (q[2] < 0.3) continue;
          const rad = Math.max(3, v.F * 0.12 / q[2]);
          const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], rad * 2.4);
          g.addColorStop(0, "rgba(255,190,60,0.95)"); g.addColorStop(1, "rgba(255,160,40,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(q[0], q[1], rad * 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  function drawRim(ctx, cam, w, turn, line, spokes) {
    const pt = (rho, t) => cam.project([w.x, w.r + Math.sin(t) * rho, w.za + Math.cos(t) * rho]);
    ctx.beginPath();
    for (let k = 0; k <= 20; k++) { const q = pt(w.r * 0.66, k / 20 * Math.PI * 2); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    if (spokes) for (let k = 0; k < 5; k++) {
      const t = turn + k / 5 * Math.PI * 2, a = pt(w.r * 0.14, t), b = pt(w.r * 0.64, t);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.strokeStyle = rgba(line, 0.8); ctx.lineWidth = 1; ctx.stroke();
    if (!spokes) {                                     // spinning fast: a soft blur where the spokes would be
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) { const q = pt(w.r * 0.4, k / 20 * Math.PI * 2); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
      ctx.strokeStyle = rgba(line, 0.25); ctx.lineWidth = Math.max(2, 4); ctx.stroke();
    }
  }

  root.Car3D = { build, render, camera, STYLES };
})(typeof window !== "undefined" ? window : globalThis);
