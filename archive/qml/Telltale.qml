import QtQuick

// Warning lamp. Dim outline when off, bright colored when on.
Rectangle {
    id: t
    property bool on: false
    property color lampColor: "#ffb020"
    property string label: ""

    width: 84; height: 28
    radius: 5
    color: on ? Qt.rgba(lampColor.r, lampColor.g, lampColor.b, 0.16) : "transparent"
    border.color: on ? lampColor : "#1c232b"
    border.width: 1.5

    Text {
        anchors.centerIn: parent
        text: t.label
        color: t.on ? t.lampColor : "#2a333d"
        font.family: "DejaVu Sans"
        font.bold: true
        font.pixelSize: 12
        font.letterSpacing: 1
    }
}
