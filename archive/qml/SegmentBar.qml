import QtQuick

// Horizontal segmented bar (fuel / coolant temp) with end labels.
Item {
    id: b
    property real ratio: 0.5
    property int segments: 10
    property string leftLabel: "E"
    property string rightLabel: "F"
    property string icon: ""
    property color litColor: "#e8edf2"
    property color warnColor: "#ffb020"
    property int warnLowSegments: 0     // first N segments use warnColor (fuel)
    property int warnHighSegments: 0    // last N segments use red (temp)

    readonly property int litCount: Math.round(Math.max(0, Math.min(1, ratio)) * segments)

    width: 330; height: 34

    Text {
        id: iconText
        anchors.verticalCenter: parent.verticalCenter
        width: 64
        text: b.icon
        color: "#9aa6b2"
        font.family: "DejaVu Sans"
        font.pixelSize: 13
        font.letterSpacing: 1.5
    }
    Text {
        id: lt
        anchors.left: iconText.right
        anchors.verticalCenter: parent.verticalCenter
        text: b.leftLabel
        color: "#7d8996"
        font.family: "DejaVu Sans"; font.bold: true; font.pixelSize: 15
    }
    Row {
        id: row
        anchors.left: lt.right; anchors.leftMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        spacing: 4
        Repeater {
            model: b.segments
            Rectangle {
                readonly property bool lit: index < b.litCount
                width: (b.width - 64 - 50 - (b.segments - 1) * 4) / b.segments
                height: 16
                radius: 2
                color: !lit ? "#1a2028"
                       : (index >= b.segments - b.warnHighSegments) ? "#ff3b4e"
                       : (b.litCount <= b.warnLowSegments) ? b.warnColor
                       : b.litColor
            }
        }
    }
    Text {
        anchors.left: row.right; anchors.leftMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: b.rightLabel
        color: "#7d8996"
        font.family: "DejaVu Sans"; font.bold: true; font.pixelSize: 15
    }
}
