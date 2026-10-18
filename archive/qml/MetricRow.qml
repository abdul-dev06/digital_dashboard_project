import QtQuick

// One line of the vehicle-status list: label, value, and a thin level bar.
Item {
    id: m
    property string label: ""
    property string value: "--"
    property string unit: ""
    property real ratio: 0          // 0..1 bar fill
    property bool warn: false

    width: 200; height: 44

    Text {
        y: 0
        text: m.label
        color: "#7d8996"
        font.family: "DejaVu Sans"; font.pixelSize: 11; font.letterSpacing: 1.5
    }
    Row {
        anchors.right: parent.right
        y: -3
        spacing: 3
        Text {
            text: m.value
            color: m.warn ? "#ff2d3f" : "#f2f4f7"
            font.family: "DejaVu Sans"; font.pixelSize: 19
        }
        Text {
            text: m.unit
            color: "#7d8996"
            font.family: "DejaVu Sans"; font.pixelSize: 12
            anchors.baseline: parent.children[0].baseline
        }
    }
    Rectangle {
        y: 26; width: parent.width; height: 4; radius: 2
        color: "#1a2028"
        Rectangle {
            width: parent.width * Math.max(0, Math.min(1, m.ratio))
            height: parent.height; radius: 2
            color: m.warn ? "#ff2d3f" : "#c9d2dc"
        }
    }
}
