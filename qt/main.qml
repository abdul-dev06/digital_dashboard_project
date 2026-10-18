// Elantra cluster: Qt Quick shell for the Rock64 (EGLFS, GPU).
// The drawing code is shared with the web prototype: qt/cluster.js is generated from
// web/index.html by tools/port_qt.py. This file only sets up the GPU layers, the frame
// loop and the keyboard.
//
// Layers, bottom to top (static ones are painted once, then only moved/faded by the GPU):
//   background  -> redline wash -> chrome pieces (per mode, clipped) -> live canvas
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
    property bool showFps: false

    FontLoader { source: "fonts/DejaVuSans.ttf" }
    FontLoader { source: "fonts/DejaVuSans-Bold.ttf" }
    FontLoader { source: "fonts/Rajdhani-SemiBold.ttf" }
    FontLoader { source: "fonts/Rajdhani-Bold.ttf" }
    FontLoader { source: "fonts/Quicksand[wght].ttf" }
    FontLoader { source: "fonts/Michroma-Regular.ttf" }

    Component.onCompleted: {
        C.__setTexUrl(Qt.resolvedUrl("texture.png").toString());
        api.setLayered(true);
    }

    // The design is 1280x480; scale it to fit whatever screen is attached.
    Item {
        id: stage
        width: 1280; height: 480
        anchors.centerIn: parent
        scale: Math.min(win.width / 1280, win.height / 480)
        focus: true

        // ---- background (painted once) ----
        Canvas {
            id: bg
            anchors.fill: parent
            opacity: { win.frameNo; return api.dash(); }
            Component.onCompleted: loadImage(Qt.resolvedUrl("texture.png"))
            onImageLoaded: requestPaint()
            onPaint: { var c = getContext("2d"); C.__setMeasureCtx(c); api.paintBackgroundTo(c); }
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
                opacity: st.opacity
                visible: opacity > 0.002
                Canvas {
                    x: -piece.modelData.x; y: -piece.modelData.y
                    width: 1280; height: 480
                    transform: [
                        Scale { origin.x: piece.st.ox; origin.y: piece.st.oy; xScale: piece.st.s; yScale: piece.st.s },
                        Translate { x: piece.st.tx }
                    ]
                    Component.onCompleted: loadImage(Qt.resolvedUrl("texture.png"))
                    onImageLoaded: requestPaint()
                    onPaint: {
                        var c = getContext("2d"); C.__setMeasureCtx(c);
                        var m = piece.modelData;
                        api.paintChromeTo(c, m.mode, [m.x, m.y, m.w, m.h]);
                    }
                }
            }
        }

        // ---- live layer: gauges, needles, text, engine, lamps (redrawn every frame) ----
        Canvas {
            id: live
            anchors.fill: parent
            z: 10
            renderStrategy: Canvas.Threaded
            onPaint: {
                var c = getContext("2d");
                C.__setMeasureCtx(c);
                api.setCtx(c);
                api.draw();
            }
        }

        Text {
            z: 20; visible: win.showFps
            x: 8; y: 4; color: "#7d8996"; font.pixelSize: 12
            text: win.fps.toFixed(0) + " fps"
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

    // ---- frame loop: update the state, then repaint the live layer ----
    property real fpsT: 0
    property int fpsN: 0
    FrameAnimation {
        running: true
        onTriggered: {
            api.step(C.performance.now());
            win.frameNo++;
            live.requestPaint();
            win.fpsN++;
            var now = Date.now();
            if (now - win.fpsT >= 1000) { win.fps = win.fpsN * 1000 / (now - win.fpsT); win.fpsN = 0; win.fpsT = now; }
        }
    }
}
