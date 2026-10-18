import QtQuick

// Center RPM dial: lit tick ring + radial needle, gear readout inside.
// Built from plain rectangles (no per-frame canvas painting) so it stays
// smooth on the Rock64's Mali-450.
Item {
    id: d
    property real rpm: 0
    property real maxRpm: 8000
    property real redline: 6500
    property string selector: "P"
    property int gear: 1
    property bool lampTest: false

    // Angles: degrees clockwise from 12 o'clock. 0 rpm sits at the bottom
    // and the scale climbs up the left side, over the top, to the right.
    property real startAngle: 180
    property real sweep: 250

    readonly property real cx: width / 2
    readonly property real cy: height / 2
    readonly property real rad: Math.min(width, height) / 2 - 6
    function angleFor(v) { return startAngle + sweep * Math.max(0, Math.min(1, v / maxRpm)); }

    width: 400; height: 400

    // Face
    Rectangle {
        anchors.centerIn: parent
        width: d.rad * 2 + 8; height: width; radius: width / 2
        color: "#07090c"
        border.color: "#1c2229"; border.width: 2
    }
    Rectangle {
        anchors.centerIn: parent
        width: d.rad * 1.14; height: width; radius: width / 2
        color: "transparent"
        border.color: "#161b21"; border.width: 1
    }

    // Red zone band (static, painted once)
    Canvas {
        anchors.fill: parent
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            function rad(a) { return (a - 90) * Math.PI / 180; }
            ctx.lineWidth = 7;
            ctx.strokeStyle = "#d1162b";
            ctx.beginPath();
            ctx.arc(d.cx, d.cy, d.rad - 4, rad(d.angleFor(d.redline)), rad(d.angleFor(d.maxRpm)), false);
            ctx.stroke();
        }
    }

    // Tick ring: one tick per 100 rpm, lit up to the current rpm
    Repeater {
        model: Math.round(d.maxRpm / 100) + 1
        Item {
            readonly property real v: index * 100
            readonly property bool major: index % 10 === 0
            readonly property bool half: index % 5 === 0
            readonly property bool red: v >= d.redline
            readonly property bool lit: d.lampTest || v <= d.rpm
            anchors.fill: parent
            rotation: d.angleFor(v)
            Rectangle {
                width: major ? 4 : (half ? 3 : 2)
                height: major ? 26 : (half ? 18 : 12)
                x: d.cx - width / 2
                y: d.cy - d.rad + 12
                radius: 1
                antialiasing: true
                color: lit ? (red ? "#ff2d3f" : "#f2f4f7")
                           : (red ? "#4a1218" : "#262d35")
            }
        }
    }

    // Numbers
    Repeater {
        model: Math.round(d.maxRpm / 1000) + 1
        Text {
            readonly property real a: d.angleFor(index * 1000) * Math.PI / 180
            readonly property real lr: d.rad * 0.70
            x: d.cx + Math.sin(a) * lr - width / 2
            y: d.cy - Math.cos(a) * lr - height / 2
            text: index
            color: index * 1000 >= d.redline ? "#ff2d3f" : "#e8ecf0"
            font.family: "DejaVu Sans"
            font.pixelSize: 34
            font.weight: Font.Light
        }
    }

    // Needle: a radial red line with a soft glow underneath
    Item {
        anchors.fill: parent
        rotation: d.angleFor(d.rpm)
        Rectangle {
            width: 12; height: d.rad * 0.50
            x: d.cx - width / 2; y: d.cy - d.rad + 8
            radius: 6
            color: "#ff2d3f"; opacity: 0.18
        }
        Rectangle {
            width: 4; height: d.rad * 0.48
            x: d.cx - width / 2; y: d.cy - d.rad + 9
            radius: 2
            antialiasing: true
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#ff5060" }
                GradientStop { position: 1.0; color: "#80ff2d3f" }
            }
        }
    }

    // Digital rpm
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: d.cy - 92
        text: Math.round(d.rpm / 10) * 10
        color: "#7d8996"
        font.family: "DejaVu Sans"; font.pixelSize: 18
    }
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: d.cy - 68
        text: "x1000 r/min"
        color: "#3d4651"
        font.family: "DejaVu Sans"; font.pixelSize: 11; font.letterSpacing: 1
    }

    // Gear box
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        y: d.cy - 40
        width: 120; height: 100
        radius: 10
        color: "#0d1116"
        border.color: "#232a32"; border.width: 1.5
        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            y: 4
            spacing: 4
            Text {
                text: d.selector
                color: "#f4f6f8"
                font.family: "DejaVu Sans"; font.pixelSize: 66; font.weight: Font.DemiBold
            }
            Text {
                text: d.selector === "D" ? d.gear : ""
                color: "#ff2d3f"
                font.family: "DejaVu Sans"; font.pixelSize: 26; font.bold: true
                anchors.bottom: parent.bottom; anchors.bottomMargin: 12
            }
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.bottom: parent.bottom; anchors.bottomMargin: 6
            text: "AUTO"
            color: "#7d8996"
            font.family: "DejaVu Sans"; font.pixelSize: 11; font.letterSpacing: 3
        }
    }
}
