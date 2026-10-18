# Elantra Digital Cluster: Design & Data Reference

Quick-context file for anyone (human or AI) picking this project up. Read this first.
Keep it updated with every design or data change (see the change log at the bottom).

- **Car:** 2007 Hyundai Elantra. Stock cluster stays in place; this is a supplementary display.
- **Hardware:** Pine64 Rock64 (4 GB, RK3328, Mali-450 GPU). HDMI screen, 1280×480 design canvas. OBD2 via ELM327-type adapter (use a USB one on the Rock64, see §5).
- **Car network:** ISO 15765-4 CAN, 11-bit, 500 kbps (confirmed 2026-10-15). Responding modules: 7E8 (engine), 7E9 (transmission). Calibration ID H7NCMC0A.
- **Source of truth for the design:** `web/index.html` (single-file canvas prototype, also published as the "Elantra Cluster" artifact).
- **Qt app (`qt/`):** GENERATED from `web/index.html` by `tools/port_qt.py`. Never edit `qt/cluster.js` by hand: change the web prototype, then run `python3 tools/port_qt.py`. Only `qt/main.qml` (layers, frame loop, keys) and `tools/qt_prelude.js` (browser stand-ins) are hand-written. The first Qt version (C++/QML) is in `archive/`, outdated.

---

## 1. Architecture (web prototype → Qt)

Everything is drawn on one canvas in a fixed 1280×480 coordinate space, scaled to the screen.

**Layers, back to front (in `draw()`):**
1. **Background layer:** dark gradient (the carbon texture was removed 2026-10-18). Cached image, mode-independent (`backgroundLayer()`).
2. **Sport redline wash:** red gradient over the top half when Sport is at redline. Sits behind all UI.
3. **Chrome layer:** everything static for the current mode: panels, strip, accent lines, trip card shape, Sport tracks/ticks/numbers/road edges. Cached one image per mode (`chromeFor(mode)`), cross-faded on mode change.
4. **Live content** (inside the enlarged group, see below): gauges, needles, fills, rings, car, road motion, text values, turn arrows, mode-switch ripple.
5. **Bottom strip contents:** wire floor (cached in chrome, `drawFloor`), warning lamps standing on it (`drawLamps`, icons pre-rendered per colour by `iconImg`), mode pill, clock, outside temp.
6. **Alert note** (full screen), then the **power-on logo**.

**Enlarged group:** everything above the strip is drawn at `GS = 1.08` via `enterGroup()` (translate/scale), so the slim strip's freed space is used. Layout coordinates in the code are *content coordinates* (pre-scale). The strip uses screen coordinates.

**Performance rules (Rock64-safe, keep these):**
- No blur (`shadowBlur`) anywhere. Glows use `glowStroke()`: two wide translucent strokes under a sharp one.
- Anything static goes into a cached layer (background, chrome per mode, car images per mode, Sport rear-view car, tinted logos).
- Live drawing is limited to simple strokes, fills, text and cached images. Target draw time stays ~0.3–0.6 ms/frame on desktop.
- Render loop only runs while something animates (`looping` flags); otherwise the frame is static.

**Qt build (how the port works):**
- The same drawing code runs inside Qt Quick `Canvas` items (Context2D, the same API as the browser canvas). No C++, no compiling. It runs with the stock `qml` runtime (`/usr/lib/qt6/bin/qml`, Qt 6.8 on the Rock64).
- `tools/port_qt.py` makes four kinds of change:
  - it puts `tools/qt_prelude.js` in front of the code;
  - it swaps `ctx.drawImage(` → `__drawImage(ctx, ` (so recorded offscreen canvases can be replayed) and `ctx.ellipse(` → `__ellipse(ctx, ` (Qt's ellipse takes a bounding box);
  - it simplifies font family strings to single names, and quotes `'DejaVu Sans'` (Qt 6.8 drops the space from an unquoted multi-word family, can't find it, keeps the previous font and logs a warning on every call);
  - it rewrites `text()` / `measure()` to call `__text` / `__measure`, and `ctx.translate/scale/rotate/save/restore/setTransform(` to `__M_*(ctx, …)` so the live layer's transform is tracked;
- **Prelude stand-ins:**
  - `document`/`window` elements are stubs that keep their click listeners, so keyboard shortcuts work unchanged;
  - `performance.now`, timers, `localStorage` (in memory for now) and `Audio` (silent for now);
  - offscreen canvases become recording canvases (car images, lamp icons), replayed into the real context.
- **Layers in `qt/main.qml`** (the web draws them itself; `LAYERED = true` makes `draw()` skip them):
  1. background Canvas, painted once;
  2. redline wash `Rectangle`, opacity = `washAlpha()`;
  3. chrome: each mode's static layer is cut into clipped pieces (`chromePieces()`: Normal/Eco = upper + floor; Sport = floor, two left, two right and the middle engine piece). Each piece is painted once, clipped, and gets per-frame opacity/translate/scale from `pieceState(mode, piece)`, the same maths as the web blits. Mode switches therefore cost only GPU transforms;
  4. **sections**: parts of the live layer wrapped in `section(name, deps, fn)` in `draw()` (gauge faces `speedFace`/`tachFace`, gauge live parts `speed`/`tach`, `trips`, `economy`, `car`, `vehicle`, `rings`, `lamps`, Sport `sportL`/`sportR`/`sportM`; each must also be listed in the `sections` model in `main.qml`, or it is drawn on the live layer and goes stale). The web just calls `fn`. Qt gives each its own Canvas + Text pool and repaints it only when its `deps`, the frame's theme state (`modeK`, `ecoA`, `sportA`, theme colours) or its position/opacity change (`__secHook` in the prelude). **Rule:** `deps` must list everything the section reads, rounded to what is visible; state that the section animates itself (e.g. `econShown`, `leafK`) goes in too. A parked car with a steady idle repaints almost nothing. Each section canvas only covers the screen area it can reach in any mode (`r` in `main.qml`) and is hidden (opacity 0, so the GPU skips it) while empty; the overlay canvas is hidden while there's no popup/logo;
  5. live Canvas (`renderStrategy: Canvas.Threaded`) for everything not in a section, **without its text**. It is repainted only when `liveSig()` changes (theme, intro state `A`, Sport-switch state `SPX`, mode-switch time, engine-start light, turn signals, clock minute, outside temp). Otherwise `draw()` runs against a do-nothing context (`__drawSectionsOnly`) just to update the sections. **Rule:** anything new drawn on the live layer outside a section must add its inputs to `liveSig()`;
  - **no queued paints:** each canvas is "busy" from `requestPaint` until its `painted` signal; changes wait for the next frame instead of queueing behind it (queued paints made Sport lag behind the keys while still looking smooth). 300 ms safety timeout;
  6. live text: a pool of 160 native `Text` items. On the live layers `text()` only records each string with its transform, opacity, font, colour, alignment and letter spacing; `__applyTexts` puts them on the pool and only touches an item when its string changed. Reason: Qt's canvas turns every `fillText` into a path (about 45 µs per string on a fast PC, roughly ten times that on the Rock64, about 50 strings per frame). Text items are drawn by the GPU from a glyph cache, and they now show the letter spacing the web version has;
  7. overlays: `drawTop()` (warning popup and start-up logo) is called at the end of `draw()`, and its parts are sections too (`alertDim`, `alert`, `logo`, above the live layer). They are drawn once; their fade, slide and zoom are GPU work. A full-screen overlay canvas repainted every frame made alerts slow everything down.
  - **Logos on live layers are native `Image` items** (mipmapped, from a 512 px source), listed by `__drawImage` like text and placed by `__applyImages`. Canvas-drawn logos looked rough when scaled down.
- `FrameAnimation` calls `step(t)` (state update, split out of `frame()`), then requests the live repaint.
- Keys map to the browser key codes and go through `__key()` to the same handlers. Esc quits, P toggles a readout of fps and the live layer's code time per frame.
- Test against the Rock64's Qt: `pip install PySide6-Essentials==6.8.2`, render offscreen with an empty fontconfig (the Rock64 has no system fonts) so font problems show up. Moving text to Text items cut the live layer's code time per frame from about 14 ms to about 2 ms (PC, Normal mode, engine running).
- Gauges are split into a face (`drawSpeedFace`, `drawDialFace`: shade, unlit ticks, numbers, hub) and a live part (`drawSpeedLive`, `drawDialLive`: lit ticks drawn over the unlit ones, needle, readout). Ticks and ring segments are stroked in batches, one stroke per width and colour (`strokeBatch`).
- **Sections move and fade on the GPU:** a section's opacity is its item's opacity (never a repaint), and when only its position/size changes (e.g. the intro's gauge move) the existing picture is moved by a GPU transform and repainted sharp once it stops moving. Sections that aren't drawn in a frame are hidden, not cleared, so they come back without a repaint. Their canvases only resize when the content no longer fits.
- **Start-up:** before the intro, every layer is drawn once behind a black cover: background, all chrome pieces (kept visible at opacity 0 so they paint), and every section as it looks at the end of the intro (`warm(true)` sets the intro state `A` to its end values). When all have reported `painted` (3 s cap), the cover goes and the intro (logo) starts, so nothing pops in late.
- **Logos and sounds** live in `assets/`:

  | File | Use |
  |---|---|
  | `logo.png` | start-up and Sport |
  | `logo-redline.png` | Sport at redline |
  | `start.mp3` | power-on chime, with the logo; also on K |
  | `alert.mp3` | every warning |

  - `port_qt.py` prepares them into `qt/assets/`, the same way the web's `prepareLogo` does: 360 px on the long side, and the dark background keyed out unless the file is already transparent. It also makes a red silhouette for the redline flash, because Qt's canvas can't tint offscreen. It writes a manifest into the prelude (`__ASSETS`).
  - In the Qt build, `logoImg`/`logoRedImg` come from `__logo()`, and `tinted()` returns the pre-made red version.
  - Sounds play through `qt/Sounds.qml` (QtMultimedia `MediaPlayer`). It is loaded by a `Loader`, so a Rock64 without the sound module runs silently instead of failing.
  - The web prototype still takes logos and sounds through its own pickers. The published prototype carries no brand logos.
- **Mode changes on the Rock64 are a plain fade** (`modeFade` in `main.qml`): the view dips to black (160 ms), `setMode(m, true)` switches instantly while dark (the one heavy repaint is hidden), then it fades back in (220 ms). Only the GPU works during it. The morph (theme blend, Eco pose slide, Sport slide/zoom, light ring, numeral cross-fade) made every layer repaint every frame for 0.6–0.85 s, about 3–5x the normal cost. The web prototype keeps the full animation; the start-up animation is the same on both. Anything a section's drawing eases over time must be advanced in `step()` (e.g. `econUpdate`), not inside the drawing, or it freezes when the section stops repainting.
- Code time per frame on a PC, Qt 6.8.2: parked at idle 0.4 ms (was 14 ms at the start of the day), driving about 1.2 ms, the first moments of a mode switch about 2.5 ms (everything repaints while it moves).
- **GPU fill rate is the other limit** (Mali-450): every visible layer is a transparent texture the GPU paints over the whole output. On a 4K TV every mode ran at the same low fps whatever the code time, so `qt/run.sh` forces the HDMI output to 1280x720 through `QT_QPA_EGLFS_KMS_CONFIG` (`CLUSTER_MODE` overrides it) and sets `QT_SCALE_FACTOR=0.75` (`CLUSTER_SCALE`): the 1280x480 layout is rendered at 960x360 real pixels (canvases and text render at the device pixel ratio). Tried on the Rock64: 1920x720 (1.5x) was too heavy, 1280x480 (1x) good, 0.75x is the default for headroom.
- Gauge sections pass their bounds (`SPEED_BOX`, `TACH_BOX`), and Qt sizes their canvases to that box on screen in the current pose (`__secFit`), instead of whole-screen canvases.
- Qt's JavaScript ignores `toLocaleString` options, so numbers are formatted with `fmtNum()`.
- Stale-layer check (headless test): each frame, record the live layer's own drawing with sections skipped; if it differs from the last painted one while `liveSig()` didn't change, an input is missing from `liveSig()`. Ran clean through key on, start, all modes, revving, driving and every test key; removing one input from `liveSig()` is caught.
- To capture transitions in the headless test, slow the prelude clock (`performance.now() * 0.2` in a scratch copy): the offscreen renderer drops frames.

---

## 2. Shared skeleton (all modes)

- **Always powers on in Normal.**
- **Key on (`T` timings):** black → logo fades in/out → both dials fade in side by side and sweep (1.4 s) → dials glide into place as the dash fades in → **bulb check: every lamp lights** (`T.lamps`) → small rings sweep and settle. Needles settle at **0 rpm** because the engine is not running yet. Startup sound plays with the logo. ~6.9 s total.
- **Engine state (`ENGINE`, `updateEngine`)** is worked out from rpm only, so it works the same on the real OBD2 feed: rpm < `offRpm` (50) = key on / engine off; `offRpm`…`runRpm` (400) = cranking; above = running (a dip below 400 while running stays "running" until < 50). Key-on-engine-off: check-engine + battery lamps lit (as on the real cluster), 0 rpm, not charging, pulleys still. When the engine catches, a light runs out from the centre along the floor's far edge (`ENGINE.runFx`), the lamps go out, idle flares then settles (toy: higher idle while cold). Key off (in the car) = ECU stops answering.
- **Bottom strip:** a perspective wire floor (`FLOOR`: far edge y 438, near edge 480, vanishing point y 415, 64 px line spacing, 5 depth rows spaced in 1/distance) in the mode accent, fading at the sides, with a glowing far-edge line like the accent lines up top. Lamps stand on it at `LAMP_BASE` (467), 22 px; a lit lamp casts a pool of light (two flat ellipses) and every lamp has a squashed reflection. Unlit lamps show dim (`LAMP_OFF`). Centre-left: mode pill "<MODE> MODE". Centre: clock, outside temp.
- **Lamps (`LAMPS`) — only what the car gives over OBD2** (oil pressure, ABS, airbag, brake, belt, doors, lights and signals are not on the diagnostic bus for this car):

| Lamp | Colour | On when | Source |
|---|---|---|---|
| Check engine | amber | MIL reported, or engine not running (key on) | PID 01 |
| Battery | red | engine not running, or < `lowVolts` for 5 s while running (also an alert) | PID 42 / AT RV + engine state |
| Coolant | blue / red | blue below `coldLampOff` (50 °C), red above overheat | PID 05 |
| Low fuel | amber | ≤ `lowFuel` (12 %) | calculated tank |
| Ice | light blue | outside ≤ `iceTemp` (3 °C) | PID 46 |
| OBD link | amber | adapter / ECU stopped answering | connection |
- **Turn arrows:** inside the top of the side panels in Normal/Eco; glide beside the logo in Sport.
- **Mode switch:** colours/fonts cross-fade and a ring of accent light rolls out from the centre in every switch.
  - **Normal ↔ Eco (0.6 s):** shared pieces move between their two positions (speedo glides to the centre and grows, rings re-arrange, car changes), chrome images cross-fade.
  - **To / from Sport (`SPORT_SWITCH`, 0.85 s):** the outgoing layout leaves while the incoming one arrives, overlapping in the middle (out over 0–65 %, in over 25–100 %). Normal/Eco keep their own shape and zoom slightly toward you (+8 %) as they leave / settle back from +8 % as they arrive. Sport arrives with its brackets sliding in from the sides (90 px) and the engine growing from 82 %, and leaves the reverse way (leaving accelerates, arriving decelerates). The floor strip just cross-fades so the ground never dims. `SPX` holds the per-frame alphas/offsets (`sportTransition()`); while a switch runs, Normal/Eco stay at their own layout (`ecoA` fixed) instead of morphing.
  - **Cost:** only transforms + alpha on the cached chrome images. The Sport chrome is blitted as three clipped parts (left bracket / engine / right bracket; above `SW_TOP` the split is at screen centre so the bracket ends stay whole) and the Sport live layer is split the same way (`drawSportLeft/Middle/Right`). Measured worst ~2.6 ms per frame during a switch in the browser, ~0.5 ms steady. In Qt: draw the cached QImages with `QPainter::setClipRect` + `translate/scale` and `setOpacity`.
  - `withAlpha()` now multiplies the current alpha, so nested fades combine correctly.
- **Alerts:** calm note card over everything: static triangle icon (red or amber), headline, body. Dims the dash slightly. Stays `alertSeconds` (7), plays the alert sound once (max every 4 s per alert). Priority order in `ALERTS`:
  1. Engine overheating (coolant > operating + margin), red
  2. Check engine, amber
  3. Engine still cold (coolant < operating temp and rpm > coldRevFraction × redline), amber
- **User uploads (web: kept in browser storage; Qt: files in `/opt/cluster/`):** main logo (`logo.png`), redline logo (`logo-redline.png`), startup sound, alert sound. Dark backgrounds are keyed out of logos automatically.

---

## 3. Modes

Theme colours per mode in `THEMES`; numeral fonts per mode in `NUMFONTS`.

| | Normal | Eco | Sport |
|---|---|---|---|
| Accent | red `#ff2d3f` | mint `#2fe0a6` | orange `#ff5a1f` |
| Numeral font | Rajdhani | Quicksand | Michroma |
| Centre | Tach (needle, lit ticks) | Big speedometer | Top-down engine bay + exhaust schematic driven by sensors |
| Left | Trip card + small speedo hanging off tach | Wide trip card + vertical economy bar | RPM bracket gauge (fills) + vehicle info |
| Right | Vehicle status: perspective road with rear-view car + rings in a column | Top-view mint car with airflow lines + rings in a chevron | Speed bracket gauge (moving marker) + big digital speed |

**Normal:** tach centre (redline zone, lit ticks, red needle). Small 270° speedo (0 at 6 o'clock) tucked under the tach's left edge. Crescent trip card wraps the speedo. Right panel: the Sport road scene, smaller (`NROAD`), with the rear-view car (blue outline); road static parts live in the Normal chrome. Under the title: charging row, then Warming up / Engine hot. Engine temp shows as a glow under the car (blue cold, pulsing red hot). Rings stacked in a column at the right edge.

**Eco:** speedo glides to centre and grows (`ECO_POSE`), tach fades out. Economy bar = live rpm ÷ redline, mint ≤ `ecoBand[1]`, amber ≤ `ecoHeavy`, red above; doubles as the tach: rpm scale beside it (mark every 500, numbered 1–6 in thousands, follows `REDLINE`), big readout = rpm rounded to the hundred while moving, exact rpm when stopped (speed < 1); a green leaf (`drawLeaf`, fades via `leafK`) sits beside the state word while in the efficient range; live L/100 km (L/h when stopped), state word. Shift-early band on the tach when visible.

**Sport (40/20/40):**
- Left: bracket track (`SPT.verts`, rounded corners) fills orange → amber (last 10% before redline) → red past redline. Ticks every 500 rpm, numbers per 1000. Inside: coolant, fuel est, range, charging.
- Middle: logo drawn big (`CFG.logoScale` 1.6) centred over the engine; hidden until `CFG.logoShowBelow` (1000) rpm below redline, eases to full at `logoFullAt` × redline, swaps to redline logo or flashes red at redline; a dark radial veil (alpha follows the logo) sits behind it so it reads boldly over the engine. Underneath, a **realistic engine, end view from the passenger side** (`ENG`), exterior only, same see-through wireframe look as the Eco car (outline in `THEMES.sport.car`, translucent tint). Front of car to the right. No exhaust or cats. Drawn around (cx, 230) and placed by `ENG.pose` (y 244, scale 1.15) to fill the column.
  - Static (cached in Sport chrome, `drawBayStatic`): oil pan with drain plug, block with ribs, head + gasket line, valve cover with oil cap and coil pack, thermostat housing + upper hose, engine mount on the timing end, timing-belt cover with two cam-sprocket bulges ("DOHC 16V"), intake plenum + runner + throttle body on the back, accessory bodies (alternator with vents, P/S pump + line, A/C compressor), tensioner arm, serpentine belt (`BELT`: outer tangents + wraps around alt → tensioner → A/C → crank → P/S).
  - Live (`drawBayLive`): head, block and timing cover heat toward red as rpm nears redline (`engHeat`, eased ~1.5 s in `bayUpdate`) with an outline glow; all pulleys spin at crank speed × diameter ratio (crank has a balancer ring, alternator goes green while charging). No cylinder firing (engine-agnostic).
  - Readouts: left IAT; right LOAD, ADV; shift flash below them. Cost: 5 pulleys + a few fills per frame; no extra OBD polling. Cat temps and λ are no longer shown in Sport (still polled for fuel calc: λ).
- Sport gauges: each bracket has a subtle accent tint filling its inside (closed track inner edge, linear gradient 0.24 → 0.09 → 0 running from the outer corner perpendicular to the open edge, reaching 0 exactly on it), cached in the chrome.
- Right: mirrored track with white marker + short trail. Ticks every 10 km/h, labels every 20. Big digital speed centred inside.
- At redline: top half of the background pulses red (behind UI). Sport rev-blip on entering.

**Shared road scene:** `drawRoadStatic(R)` (cached) and `drawRoadLive(R, carMode, heat)` (dashes, cross lines, rear-view car per mode colour, tail lights). Motion and brake/charging fades advance once per frame in `roadUpdate(dt)`.

**Top-view car (right panel, Eco only now):** one cached image per mode (Normal blue, Eco mint, Sport orange with stripes). Hood glows blue when cold, pulsing red when overheating. Lane lines scroll with speed. Status rows under the car: charging state, then Warming up / Engine hot when relevant.

---

## 4. Config (`CFG`), everything derives from these

| Key | Value | Meaning |
|---|---|---|
| redline | 6500 | rpm. Dial max = redline rounded up + 1000 |
| idle | 760 | rpm |
| speedMax | 220 | km/h end of speed scales |
| ecoBand | [0.185, 0.40] | Eco shift band (fraction of redline) |
| ecoHeavy | 0.60 | Eco bar red above this fraction |
| logoFullAt | 0.96 | Sport logo fully visible at this fraction of redline |
| logoShowBelow | 1000 | Sport logo hidden until this many rpm below redline |
| logoScale | 1.6 | Sport logo size over the engine |
| limiterOver | 200 | toy rev limiter above redline |
| offRpm / runRpm | 50 / 400 | engine state thresholds: off / cranking / running |
| coldLampOff | 50 | blue coolant lamp off above this °C |
| lowVolts | 12.2 | running below this for 5 s = charging fault |
| lowFuel | 0.12 | low fuel lamp |
| iceTemp | 3 | ice lamp at/below this outside °C |
| chargeVolts | 13.2 | ≥ this battery voltage = charging |
| tankLitres | 55 | tank size for fuel estimate |
| afr | 14.7 | air/fuel ratio for fuel calc |
| fuelDensity | 745 | g/L petrol |
| defaultL100 | 8.6 | used for range until trip has an average |
| operatingTemp | 88 | °C; cold below this |
| overheatMargin | 5 | overheating above operatingTemp + this |
| coldRevFraction | 0.55 | cold-rev warning above this fraction of redline |
| alertSeconds | 7 | alert note duration |
| roadPxPerKmh | 1.6 | top-view lane line speed |
| traceSeconds | 24 | Sport rev trace history |
| traceHz | 10 | trace + shift detection sample rate |
| shiftStep | 0.18 | ratio step that counts as a shift |
| shiftMinSpeed | 10 | km/h below which shifts aren't detected |

Derived constants: `MAXRPM`, `LIMIT`, `OP_TEMP`, `HOT_TEMP`, `COLD_REV`, `COOLANT_MIN/MAX`.

---

## 5. Data: what the car provides and how it's used

Confirmed on this car with Torque + ELM327 (2026-10-15). Protocol: **CAN 11/500**.

**Adapter speed:** the current adapter (Bluetooth clone) benchmarked only ~6.5 PIDs/s. On CAN a decent **USB** adapter does ~80–100 PIDs/s (Torque benchmark: generic USB clone ~85, OBDLink USB ~100). Use a USB adapter on the Rock64.
**Speed trick for the data service:** because two modules (7E8, 7E9) are on the bus, send requests with an expected-response count (e.g. `010C1`) or address the engine directly (`AT SH 7E0`) so the adapter doesn't wait for a timeout after each reply. Also `AT AT2` (adaptive timing).

**Supported PIDs reported by the engine ECU:** 01, 03, 04, 05, 06, 07, 0C, 0D, 0E, 0F, 10, 11, 13, 15, 1C, 1F, 21, 24 (O2 S1 equiv. ratio), 2E, 2F, 30, 31, 32, 33, 3C, 3D, 41, 42, 43, 44, 45, 46, 4D, 4E.

### From the car (OBD2 mode 01 PIDs)
| Field (`S.`) | PID | Poll | Used for |
|---|---|---|---|
| rpm | 0C | every cycle | tach, Sport fill, economy bar, alerts |
| speed | 0D | every cycle | speedos, road/lane motion, trips, L/100 km |
| coolant | 05 | ~2 s | coolant ring, hood glow, cold/overheat alerts |
| intakeTemp | 0F | ~5 s | intake ring |
| outsideTemp | 46 (ambient air) | ~10 s | strip, beside clock |
| maf | 10 (g/s) | ~2 Hz | fuel consumption → fuel %, range, L/100 km (not displayed) |
| engineLoad | 04 | ~2 s | Sport engine bay "LOAD" |
| throttle | 11 | optional | not displayed yet |
| run time | 1F | ~5 s | drive time (engine run time) |
| checkEngine | 01 (MIL bit + DTC count) | ~5 s | CHECK lamp + alert |
| (fuel level) | 2F | ~10 s | listed as supported but read 0% with fuel in the tank. Re-check with engine running; if it stays 0, ignore it and use the calculated estimate |
| lambda | 44 (commanded equivalence ratio) | ~2 s | fuel calc (AFR = afr × λ), λ readout at O2 sensor 1 in Sport |
| timing | 0E | ~1 s | Sport engine bay "ADV" |
| cat1 / cat2 | 3C / 3D | not polled (no longer displayed) | was Sport cat temps; re-enable if shown again |

Also available but unused: absolute load (43), relative throttle (45), barometric pressure (33), evap pressure (32), fuel trims (06/07), distance/time since codes cleared (31/4E), warm-ups since clear (30). Transmission module 7E9 answers but standard PIDs don't give gear; gear would need Hyundai-specific requests (future).

**Not available from this car:** usable fuel level (2F reads 0%), oil temp, transmission temp (standard PIDs). Phone-only items in Torque (accelerometer, GPS speed, phone barometer) do not exist on the Rock64.

### From the adapter (no ECU bandwidth)
| Field | Command | Poll | Used for |
|---|---|---|---|
| batteryVolts | PID 42 (control module voltage), or `AT RV` from the adapter | ~3 s | charging status (≥ chargeVolts) |

### Calculated on the device (`updateDerived()`)
- **Fuel flow:** L/s = (MAF ÷ AFR) ÷ fuelDensity, AFR = afr × commanded equivalence ratio (PID 44) when available, else afr. L/h = × 3600.
- **Fuel left (estimate):** starts full on "Filled up", minus integrated fuel flow. Saved every 10 s and on fill-up. `S.fuel` = litres ÷ tankLitres. Shown as "FUEL EST". Expect ±5–10%.
- **Instant economy:** L/100 km = L/h ÷ speed × 100 (only when moving > 3 km/h; smoothed). Stopped: show L/h.
- **Trip average economy:** trip fuel ÷ trip distance × 100 (after 0.5 km).
- **Range:** litres left ÷ (trip average or defaultL100) × 100.
- **Trips A/B, this drive:** speed integrated over time. A/B persist (save on shutdown/periodically). Drive time = engine run time. Avg speed = this drive ÷ drive time.
- **Economy bar:** rpm ÷ redline.
- **Decel (brake lights on the rear-view car):** speed drop > 3 km/h per second.
- **Toy values (web only):** λ 0.86 under hard load else 1.00; timing rises with rpm; cat temps chase 360 + load×4 + rpm/18 (cat 2 lags, ~70° cooler).
- **Shift detection (`detectShift`):** sample rpm + speed at `traceHz`. Ratio = rpm ÷ speed. A shift = ratio changes by more than `shiftStep` (18%) versus 0.6 s earlier, both samples above `shiftMinSpeed`, rpm above idle + 250, and the new ratio steady (±5%) for 0.2 s. Max one per second. Ratio drop = upshift, rise = downshift/kickdown. Needs ~10 Hz rpm+speed (CAN + USB adapter). Future: learn the 4 gear ratios over a few drives to label gears.

**Polling plan (CAN + USB adapter ≈ 80+ replies/s):** rpm + speed every cycle (~20 Hz each); MAF ~2 Hz; commanded λ ~1 Hz; coolant, voltage, MIL, run time ~1 Hz; intake/ambient every few seconds. Needles still ease between readings.

---

## 6. Test controls (web prototype only)

Key on (replays the key-on sequence, engine off), Start engine / Stop engine (toy cranks ~0.9 s at ~230 rpm with a voltage dip, then idles), logo/sound uploads, Eco/Normal/Sport, toy 5-speed (hold to rev / Space — only with the engine running, shift buttons / arrow keys), Tests: Cold start, Overheat, Check engine, Filled up, Icy outside, OBD lost. Keyboard shortcuts for all of it: K key on, E start/stop engine, Space rev, arrows shift, 1/2/3 Eco/Normal/Sport, C cold, H overheat, M check engine, F filled up, I icy, L OBD lost. Add `?kiosk` to the address for a controls-free, full-screen view (used on the Rock64 via `rock64/run-web.sh`: cage + Chromium). Rock64 setup steps that worked: see `SETUP.md`. Draw-time readout. The toy drivetrain fakes MAF, voltage, load and throttle so derived values behave.

---

## 7. Open items

- Get a USB OBD2 adapter for the Rock64 (current Bluetooth one: ~6.5 PIDs/s).
- Re-check fuel level PID 2F with the engine running.
- Qt port of the current design, with a swappable data source (toy vs OBD2 service).
- Temporary in-car setup: 12 V USB (≥3 A) power from switched socket, USB ELM327, Rock64 + screen loose for a few test drives.
- Later: wired turn signals/high beam via GPIO optocouplers; button for mode / trip A-B; silent boot; read-only root fs.

---

## Change log

- **2026-10-14:** First Qt app (round tach + speedo, simulator). Web prototype started: curved panels, power-on sequence, drive modes, toy test drive, alerts + sounds, logo uploads, Rock64 optimisations (no blur, cached layers).
- **2026-10-15:** Drive-mode car images; per-mode fonts with cross-fade; Eco layout (centre speedo, economy bar, wide trip card); Sport rebuilt as 40/20/40 bracket gauges + road; mode names removed from gauge centre; slim bottom strip + 8% larger graphic; turn arrows moved into panels; Sport redline background wash. Data: real sensor list from Torque; calculated fuel (MAF-based) with Filled up; voltage-based charging; outside temp beside clock; average economy on trip card; Eco live L/100 km; this file created. Protocol confirmed CAN 11/500; supported PID list recorded; voltage via PID 42; polling plan updated. Normal right panel reworked: road scene + rear-view car replaces the top-view car (kept for Eco); rings in a column; shared charging row. Sport middle: road replaced by a top-down engine bay + exhaust schematic (cat temps, λ, MAF, IAT, coolant, load, timing, charging, shift flash). Fuel calc now uses commanded λ. Exhaust redrawn realistically (header, flex, O2 bosses, heat-shielded cats, hanger, muffler, tip); MAF readout removed (still polled at 2 Hz for fuel). Bay + exhaust restyled in the Eco/top-view-car wireframe theme; animated exhaust gas pulses driven by rpm. Then compacted into an x-ray top-view car: cylinder firing removed (engine-agnostic), block heats to red toward redline, gas as small translucent flowing particles, readouts moved outside the car. Then replaced by a see-through side-view inline-4: moving pistons, firing order glow, heat to red, downward exhaust manifold with gas puffs. Then replaced by a realistic exterior end view: accessory drive in real positions with serpentine belt, timing cover, intake, heat-shielded manifold, no firing. Tailpipe smoke added. Then exhaust and cats removed (engine only, enlarged); subtle inner gradient in both Sport gauges (then made bolder). Sport logo moved over the engine, enlarged, hidden until 1000 rpm below redline (`logoShowBelow`, `logoScale`). Eco economy bar now shows rpm (scale + rpm readout) instead of % of redline; rpm in hundreds while moving, exact at idle; green leaf when efficient. Bottom-strip mode pill reads "<MODE> MODE". Bottom strip rebuilt as a wire floor with OBD lamps standing on it (check engine, battery, coolant, low fuel, ice, OBD link), bulb check at key on; key on and engine start separated (engine state from rpm, crank/flare in the toy, battery-not-charging alert). Sport switches reworked: overlapping leave/arrive choreography (zoom for Normal/Eco, sliding brackets + scaling engine for Sport) using only transforms on cached images.
- **2026-10-18:** Rock64 brought up (see `SETUP.md`): Armbian Trixie minimal, Qt 6.8 + Mali-450 GPU confirmed (EGLFS). Kiosk view (`?kiosk`) + keyboard shortcuts for every control. **Qt port:** `tools/port_qt.py` generates `qt/` from `web/index.html` (shared drawing code in Qt Canvas, GPU layers for background/wash/chrome pieces, threaded live canvas). Web code gained `paintBackgroundTo`, `paintChromeTo(c, mode, clip)`, `washAlpha`, `chromePieces`, `pieceState`, `step` (split from `frame`) and `LAYERED`. Old C++/QML moved to `archive/`. First run on the Rock64 (TV over HDMI): 30 fps at key on, 3 fps with the engine running, and labels in the wrong font. Fixed the quoted font name, moved live text to native Text items, split `drawTop()` (popup + logo) out of `draw()` for its own layer. Then sections (repaint only on change), gauge face/live split and batched tick strokes; `fmtNum()` replaces `toLocaleString`.
