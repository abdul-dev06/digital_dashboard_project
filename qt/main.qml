// Elantra cluster: Qt Quick shell for the Rock64 (EGLFS, GPU).
// The drawing code is shared with the web prototype: qt/cluster.js is generated from
// web/index.html by tools/port_qt.py. This file only sets up the GPU layers, the frame
// loop and the keyboard.
//
// Layers, bottom to top (static ones are painted once, then only moved/faded by the GPU):
//   background -> redline wash -> chrome pieces (per mode, clipped) -> sections -> live canvas -> its text
//   -> overlay canvas (warning popup, start-up logo; only repainted while showing) -> its text
// Text on the live layers is shown with native Text items (see __applyTexts in cluster.js):
// Qt's canvas draws text slowly, and the strings rarely change between frames.
// Sections (gauge faces, gauge needles, trips, rings, vehicle, lamps...) have their own canvas + text and are only
// repainted when their inputs change (see section() in web/index.html, __secHook in cluster.js).
//
// Mode changes (1/2/3) are a plain fade on the Rock64: the screen dips to black, the new mode is
// switched in at once while it's dark (its one heavy repaint hidden), and it fades back in.
// Only the GPU works during the fade. The web version keeps the full animation.
//
// Keys: K key on, E start/stop engine, Space rev, arrows shift, 1/2/3 modes,
//       C cold, H overheat, M check engine, F filled up, I icy, L OBD lost, Esc quit.
import QtQuick
import QtQuick.Window
import "cluster.js" as C

Window {
    id: win
    visible: true
    visibility: Window.FullScreen
    width: 1280; height: 480
    color: "black"
    title: "Elantra Cluster"

    readonly property var api: C.__API
    property int frameNo: 0
    property real fps: 0
    property real jsMs: 0          // time spent in the live layer's drawing code (for the P readout)
    property real jsShown: 0
    property bool showFps: false
    property bool topWas: false
    property string pendingMode: ""   // mode to switch to at the dark point of the fade
    // start-up: every layer is drawn once behind a black cover before the intro (logo) starts
    property bool ready: false
    property int staticLeft: 1 + api.chromePieces().length   // background + chrome pieces still to be painted
    property real warmT0: 0

    FontLoader { source: "fonts/DejaVuSans.ttf" }
    FontLoader { source: "fonts/DejaVuSans-Bold.ttf" }
    FontLoader { source: "fonts/Rajdhani-SemiBold.ttf" }
    FontLoader { source: "fonts/Rajdhani-Bold.ttf" }
    FontLoader { source: "fonts/Quicksand[wght].ttf" }
    FontLoader { source: "fonts/Michroma-Regular.ttf" }

    Component.onCompleted: {
        api.setLayered(true);
        api.setSectionHook(C.__secHook);
        for (var si = 0; si < sections.count; si++) {
            var sec = sections.itemAt(si), items = [];
            for (var ti = 0; ti < sec.texts.count; ti++) items.push(sec.texts.itemAt(ti));
            C.__secRegister(sec.name, sec.canvas, sec); C.__setPool(sec.name, items);
        }
        var a = [], b = [];
        for (var i = 0; i < textsA.count; i++) a.push(textsA.itemAt(i));
        for (var j = 0; j < textsB.count; j++) b.push(textsB.itemAt(j));
        C.__setPool("A", a); C.__setPool("B", b);
    }

    // The design is 1280x480; scale it to fit whatever screen is attached.
    // (view is what fades on a mode change)
    Item {
        id: view
        width: 1280; height: 480
        anchors.centerIn: parent
        scale: Math.min(win.width / 1280, win.height / 480)
        Item {
            id: stage
            width: 1280; height: 480
            focus: true

            // ---- background (painted once) ----
            Canvas {
                id: bg
                anchors.fill: parent
                opacity: { win.frameNo; return api.dash(); }
                property bool done: false
                Component.onCompleted: requestPaint()
                onPaint: { var c = getContext("2d"); C.__setMeasureCtx(c); api.paintBackgroundTo(c); }
                onPainted: if (!done) { done = true; win.staticLeft--; }
            }

            // ---- Sport redline wash: top half pulses red behind the UI ----
            Rectangle {
                width: 1280; height: 240
                opacity: { win.frameNo; return api.washAlpha(); }
                visible: opacity > 0.001
                gradient: Gradient {
                    GradientStop { position: 0; color: "#ff1e32" }
                    GradientStop { position: 1; color: "transparent" }
                }
            }

            // ---- chrome: each mode's static layer, cut into pieces that can fade/slide/zoom on their own ----
            Repeater {
                model: api.chromePieces()
                delegate: Item {
                    id: piece
                    required property var modelData
                    readonly property var st: { win.frameNo; return api.pieceState(modelData.mode, modelData.piece); }
                    x: modelData.x; y: modelData.y; width: modelData.w; height: modelData.h
                    clip: true
                    z: st.z
                    opacity: st.opacity               // (kept visible at 0 so it's painted at start-up; the GPU skips it)
                    Canvas {
                        property bool done: false
                        onPainted: if (!done) { done = true; win.staticLeft--; }
                        x: -piece.modelData.x; y: -piece.modelData.y
                        width: 1280; height: 480
                        transform: [
                            Scale { origin.x: piece.st.ox; origin.y: piece.st.oy; xScale: piece.st.s; yScale: piece.st.s },
                            Translate { x: piece.st.tx }
                        ]
                        Component.onCompleted: requestPaint()
                        onPaint: {
                            var c = getContext("2d"); C.__setMeasureCtx(c);
                            var m = piece.modelData;
                            api.paintChromeTo(c, m.mode, [m.x, m.y, m.w, m.h]);
                        }
                    }
                }
            }

            // ---- sections: each repainted only when what it shows changes ----
            Repeater {
                id: sections
                // r: the screen area each one can reach in any mode (x, y, w, h). Canvases are only as big
                // as that, and hidden while empty, so the GPU paints as few pixels as possible.
                model: [ { name: "speedFace", z: 2.5, r: [0, 0, 1280, 480] },   { name: "speed", z: 3, r: [0, 0, 1280, 480] },
                         { name: "trips",     z: 4,   r: [0, 0, 420, 445] },    { name: "economy", z: 4, r: [170, 0, 320, 445] },
                         { name: "car",       z: 4,   r: [720, 0, 440, 445] },  { name: "vehicle", z: 4, r: [740, 0, 440, 445] },
                         { name: "rings",     z: 4,   r: [880, 0, 400, 445] },  { name: "tachFace", z: 4.5, r: [180, 0, 920, 480] },
                         { name: "tach",      z: 5,   r: [180, 0, 920, 480] },  { name: "lamps", z: 6, r: [0, 420, 1280, 60] },
                         { name: "sportL",    z: 5.5, r: [0, 0, 560, 445] },    { name: "sportR", z: 5.5, r: [720, 0, 560, 445] },
                         { name: "sportM",    z: 5.6, r: [400, 0, 480, 445] } ]
                delegate: Item {
                    required property var modelData
                    readonly property string name: modelData.name
                    property alias canvas: cv
                    property alias texts: tx
                    property bool on: false            // set after each paint: false = nothing drawn, so hide it
                    property alias xf: dxf.matrix       // GPU move while the section's position animates
                    transform: Matrix4x4 { id: dxf }
                    opacity: 0                          // the section's fade, set from cluster.js
                    anchors.fill: parent
                    // the speedometer goes on top of the tach once Eco is past halfway
                    z: (name === "speed" || name === "speedFace") ? (win.frameNo, modelData.z + (api.speedOnTop() ? 4 : 0)) : modelData.z
                    Canvas {
                        id: cv
                        x: modelData.r[0]; y: modelData.r[1]; width: modelData.r[2]; height: modelData.r[3]
                        opacity: parent.on ? 1 : 0
                        renderStrategy: Canvas.Threaded
                        onPaint: {
                            var t0 = Date.now(), c = getContext("2d");
                            C.__setMeasureCtx(c);
                            parent.on = C.__secPaint(parent.name, c, api, x, y, width, height);
                            win.jsMs += Date.now() - t0;
                        }
                        onPainted: C.__secDone(parent.name)
                    }
                    Repeater { id: tx; model: 40; delegate: liveText }
                }
            }

            // ---- live layer: everything else that moves (redrawn every frame) ----
            Canvas {
                id: live
                anchors.fill: parent
                z: 10
                renderStrategy: Canvas.Threaded
                property real busy: 0          // time of the last requestPaint until Qt has rendered it
                property var sig: null         // liveSig() at the last paint
                onPainted: busy = 0
                onPaint: {
                    var c = getContext("2d");
                    C.__setMeasureCtx(c);
                    api.setCtx(c);
                    var t0 = Date.now();
                    C.__beginLive(c);
                    api.draw();
                    C.__applyTexts("A", C.__endLive());
                    C.__secEndFrame();
                    win.jsMs += Date.now() - t0;
                }
            }
            Item {
                z: 11; anchors.fill: parent
                Repeater { id: textsA; model: 160; delegate: liveText }
            }

            // ---- overlays: warning popup and start-up logo ----
            Canvas {
                id: top
                anchors.fill: parent
                z: 12
                opacity: win.topWas ? 1 : 0          // hidden (not painted by the GPU) while there's no popup/logo
                renderStrategy: Canvas.Threaded
                onPaint: {
                    var c = getContext("2d");
                    c.clearRect(0, 0, 1280, 480);
                    C.__setMeasureCtx(c);
                    api.setCtx(c);
                    C.__beginLive(c);
                    api.drawTop();
                    C.__applyTexts("B", C.__endLive());
                }
            }
            Item {
                z: 13; anchors.fill: parent
                Repeater { id: textsB; model: 24; delegate: liveText }
            }
            Component {
                id: liveText
                Text {
                    property alias mx: m.matrix
                    visible: false
                    width: 0
                    textFormat: Text.PlainText
                    transform: Matrix4x4 { id: m }
                }
            }

            Text {
                z: 20; visible: win.showFps
                x: 8; y: 4; color: "#7d8996"; font.pixelSize: 12
                text: win.fps.toFixed(0) + " fps  ·  " + win.jsShown.toFixed(1) + " ms code"
            }

            // ---- keyboard: same key codes as the browser version ----
            function codeOf(e) {
                if (e.key === Qt.Key_Space) return "Space";
                if (e.key === Qt.Key_Up) return "ArrowUp";
                if (e.key === Qt.Key_Down) return "ArrowDown";
                if (e.key === Qt.Key_Left) return "ArrowLeft";
                if (e.key === Qt.Key_Right) return "ArrowRight";
                if (e.key >= Qt.Key_0 && e.key <= Qt.Key_9) return "Digit" + (e.key - Qt.Key_0);
                if (e.key >= Qt.Key_A && e.key <= Qt.Key_Z) return "Key" + String.fromCharCode(e.key);
                return "";
            }
            Keys.onPressed: (e) => {
                if (e.key === Qt.Key_Escape) { Qt.quit(); return; }
                var modes = { 49: "eco", 50: "normal", 51: "sport" };          // Qt.Key_1 / 2 / 3
                if (modes[e.key] !== undefined) {
                    e.accepted = true;
                    if (e.isAutoRepeat || modes[e.key] === api.mode()) return;
                    win.pendingMode = modes[e.key];
                    modeFade.restart();                // (pressed again mid-fade: carries on from where it is)
                    return;
                }
                if (e.key === Qt.Key_P && !e.isAutoRepeat) { win.showFps = !win.showFps; e.accepted = true; return; }
                var code = codeOf(e);
                if (code) { C.__key("keydown", code, e.isAutoRepeat); e.accepted = true; }
            }
            Keys.onReleased: (e) => {
                if (e.isAutoRepeat) return;
                var code = codeOf(e);
                if (code) { C.__key("keyup", code, false); e.accepted = true; }
            }
        }
    }
    Rectangle {                                    // start-up cover (see win.ready)
        anchors.fill: parent; color: "black"; z: 100
        visible: !win.ready
    }
    SequentialAnimation {
        id: modeFade
        NumberAnimation { target: view; property: "opacity"; to: 0; duration: 160; easing.type: Easing.InQuad }
        ScriptAction { script: { if (win.pendingMode) api.setMode(win.pendingMode, true); win.pendingMode = ""; } }
        PauseAnimation { duration: 60 }                       // the new mode's first paint lands while dark
        NumberAnimation { target: view; property: "opacity"; to: 1; duration: 220; easing.type: Easing.OutQuad }
    }

    // ---- frame loop: update the state, then repaint the live layer ----
    property real fpsT: 0
    property int fpsN: 0
    FrameAnimation {
        running: true
        onTriggered: {
            if (!win.ready) {
                // draw every section as it looks at the end of the intro, under the black cover,
                // until all layers have been painted once (or 3 s, just in case); then start the intro
                if (!win.warmT0) win.warmT0 = Date.now();
                api.warm(true); C.__drawSectionsOnly(api); api.warm(false);
                if ((win.staticLeft <= 0 && C.__secAllIdle() && Date.now() - win.warmT0 > 150) || Date.now() - win.warmT0 > 3000) {
                    win.ready = true;
                    C.__drawSectionsOnly(api);         // back to the intro's start state (all hidden) before uncovering
                }
                return;
            }
            api.step(C.performance.now());
            win.frameNo++;
            // Repaint the live layer only when what it shows changed, and never queue a paint
            // behind one Qt hasn't rendered yet (queued paints made the picture lag behind the keys).
            // Otherwise draw() still runs against a do-nothing context so the sections get updated.
            var sig = api.liveSig(), free = !live.busy || Date.now() - live.busy > 300;
            if (free && !C.__same(sig, live.sig)) {
                live.sig = sig; live.busy = Date.now(); live.requestPaint();
            } else {
                var t0 = Date.now(); C.__drawSectionsOnly(api); win.jsMs += Date.now() - t0;
            }
            var t = api.topActive();
            if (t || win.topWas) top.requestPaint();     // one last paint clears it
            win.topWas = t;
            win.fpsN++;
            var now = Date.now();
            if (now - win.fpsT >= 1000) {
                win.fps = win.fpsN * 1000 / (now - win.fpsT); win.jsShown = win.jsMs / Math.max(1, win.fpsN);
                if (win.showFps) console.log(win.fps.toFixed(1) + " fps, " + win.jsShown.toFixed(1) + " ms code per frame");
                win.fpsN = 0; win.jsMs = 0; win.fpsT = now;
            }
        }
    }
}
