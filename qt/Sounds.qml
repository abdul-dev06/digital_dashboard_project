// Chimes for the cluster (loaded by main.qml through a Loader, so the cluster still runs when
// Qt's sound module isn't installed: sudo apt install qml6-module-qtmultimedia).
// Files are in qt/assets/ (copied there from assets/ by tools/port_qt.py).
import QtQuick
import QtMultimedia

Item {
    property url base
    function play(name) {
        var p = name === "start" ? startChime : name === "alert" ? alertChime : null;
        if (!p) return;
        p.stop(); p.play();
    }
    MediaPlayer { id: startChime; source: base + "start.mp3"; audioOutput: AudioOutput { volume: 1.0 } }
    MediaPlayer { id: alertChime; source: base + "alert.mp3"; audioOutput: AudioOutput { volume: 1.0 } }
}
