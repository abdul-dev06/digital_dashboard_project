import QtQuick
import QtQuick.Window

Window {
    id: win
    width: 1280
    height: 480
    visible: true
    color: "#000000"
    title: "Cluster"
    visibility: Qt.application.arguments.indexOf("--windowed") >= 0 ? Window.Windowed : Window.FullScreen

    property alias sim: sim
    Simulator { id: sim; objectName: "sim" }

    readonly property bool lampTest: sim.bulbCheck
    readonly property color accent: "#ff2d3f"

    function fmtTime(s) {
        var m = Math.floor(s / 60), h = Math.floor(m / 60);
        m = m % 60;
        return h + ":" + (m < 10 ? "0" : "") + m;
    }

    // Laid out on a 1280x480 canvas and scaled to the screen.
    Item {
        id: stage
        width: 1280; height: 480
        anchors.centerIn: parent
        scale: Math.min(win.width / width, win.height / height)

        Rectangle {
            anchors.fill: parent
            gradient: Gradient {
                GradientStop { position: 0.0; color: "#06080b" }
                GradientStop { position: 1.0; color: "#020304" }
            }
        }

        // ================= LEFT: digital speed + trip computer =================
        Rectangle {
            id: leftPanel
            x: 30; y: 40; width: 390; height: 362
            radius: 14
            color: "#0a0d11"
            border.color: "#1a2027"; border.width: 1.5
            Rectangle { x: 24; y: 0; width: 70; height: 2; color: win.accent }

            Text {
                x: 24; y: 18
                text: "SPEED"
                color: "#7d8996"
                font.family: "DejaVu Sans"; font.pixelSize: 12; font.letterSpacing: 3
            }
            Text {
                id: speedText
                anchors.right: kmh.left; anchors.rightMargin: 10
                y: 22
                text: lampTest ? "888" : Math.round(sim.speed)
                color: "#f6f8fa"
                font.family: "DejaVu Sans"; font.pixelSize: 132; font.weight: Font.DemiBold
            }
            Text {
                id: kmh
                anchors.right: parent.right; anchors.rightMargin: 26
                anchors.baseline: speedText.baseline
                text: "km/h"
                color: "#7d8996"
                font.family: "DejaVu Sans"; font.pixelSize: 20
            }

            // Speed bar
            Rectangle {
                x: 24; y: 198; width: parent.width - 48; height: 6; radius: 3
                color: "#161b21"
                Rectangle {
                    width: parent.width * Math.min(1, (lampTest ? 200 : sim.speed) / 200)
                    height: parent.height; radius: 3
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0.0; color: "#5a6572" }
                        GradientStop { position: 1.0; color: "#f2f4f7" }
                    }
                }
            }
            Item {
                x: 24; y: 210; width: leftPanel.width - 48
                Repeater {
                    model: ["0", "50", "100", "150", "200"]
                    Text {
                        x: index * parent.width / 4 - (index === 4 ? width : 0)
                        text: modelData
                        color: "#3d4651"
                        font.family: "DejaVu Sans"; font.pixelSize: 10
                    }
                }
            }

            // Trip computer
            Rectangle {
                x: 16; y: 238; width: parent.width - 32; height: 70
                radius: 8
                color: "#0e1217"
                border.color: "#1a2027"
                Row {
                    anchors.fill: parent; anchors.margins: 10
                    Repeater {
                        model: [
                            { l: "TRIP A",   v: sim.tripA.toFixed(1),            u: "km" },
                            { l: "AVG",      v: Math.round(sim.avgSpeed),        u: "km/h" },
                            { l: "TIME",     v: win.fmtTime(sim.tripTime),        u: "" },
                            { l: "RANGE",    v: Math.round(sim.range),            u: "km" }
                        ]
                        Item {
                            width: (leftPanel.width - 52) / 4; height: 50
                            Text {
                                text: modelData.l
                                color: "#5d6873"
                                font.family: "DejaVu Sans"; font.pixelSize: 10; font.letterSpacing: 1.5
                            }
                            Text {
                                y: 18
                                text: modelData.v + (modelData.u ? " " : "")
                                color: "#e8ecf0"
                                font.family: "DejaVu Sans"; font.pixelSize: 19
                                Text {
                                    anchors.left: parent.right
                                    anchors.baseline: parent.baseline
                                    text: modelData.u
                                    color: "#5d6873"
                                    font.family: "DejaVu Sans"; font.pixelSize: 10
                                }
                            }
                        }
                    }
                }
            }

            // Fuel
            SegmentBar {
                x: 24; y: 318
                width: parent.width - 48
                icon: "FUEL"
                leftLabel: "E"; rightLabel: "F"
                ratio: lampTest ? 1 : sim.fuel
                segments: 12; warnLowSegments: 2
            }
        }

        // ================= CENTER: RPM dial =================
        RpmDial {
            x: 440; y: 22
            width: 400; height: 400
            rpm: sim.rpm
            selector: sim.selector
            gear: sim.gear
            lampTest: win.lampTest
        }

        // Turn signals + high beam, either side of the dial top
        Text {
            x: 440; y: 22
            text: "◀"; font.pixelSize: 32
            color: (sim.leftTurn || lampTest) ? "#2bdc6b" : "#12171c"
        }
        Text {
            x: 840 - width; y: 22
            text: "▶"; font.pixelSize: 32
            color: (sim.rightTurn || lampTest) ? "#2bdc6b" : "#12171c"
        }

        // ================= RIGHT: vehicle status =================
        Rectangle {
            id: rightPanel
            x: 860; y: 40; width: 390; height: 362
            radius: 14
            color: "#0a0d11"
            border.color: "#1a2027"; border.width: 1.5
            Rectangle { x: parent.width - 94; y: 0; width: 70; height: 2; color: win.accent }

            Text {
                x: 24; y: 18
                text: "VEHICLE STATUS"
                color: "#7d8996"
                font.family: "DejaVu Sans"; font.pixelSize: 12; font.letterSpacing: 3
            }
            Rectangle {
                anchors.right: parent.right; anchors.rightMargin: 22; y: 14
                width: 46; height: 20; radius: 4
                color: "transparent"
                border.color: "#9be15d"; border.width: 1
                Text {
                    anchors.centerIn: parent
                    text: "SIM"
                    color: "#9be15d"
                    font.family: "DejaVu Sans"; font.pixelSize: 11; font.bold: true; font.letterSpacing: 2
                }
            }

            CarTopView {
                x: 30; y: 62
                width: 112; height: 230
                // source: "file:///opt/cluster/car.png"   // drop in a real photo later
            }

            Column {
                x: 168; y: 58
                width: parent.width - 168 - 24
                spacing: 12
                MetricRow {
                    width: parent.width
                    label: "COOLANT"
                    value: Math.round(sim.coolant); unit: "°C"
                    ratio: (sim.coolant - 40) / (120 - 40)
                    warn: sim.coolant > 108
                }
                MetricRow {
                    width: parent.width
                    label: "INTAKE AIR"
                    value: Math.round(sim.intakeTemp); unit: "°C"
                    ratio: (sim.intakeTemp + 40) / 100
                }
                MetricRow {
                    width: parent.width
                    label: "BATTERY"
                    value: sim.batteryVolts.toFixed(1); unit: "V"
                    ratio: (sim.batteryVolts - 11) / (15 - 11)
                    warn: sim.batteryVolts < 12.0
                }
                MetricRow {
                    width: parent.width
                    label: "ENGINE LOAD"
                    value: Math.round(sim.engineLoad); unit: "%"
                    ratio: sim.engineLoad / 100
                }
                MetricRow {
                    width: parent.width
                    label: "THROTTLE"
                    value: Math.round(sim.throttle); unit: "%"
                    ratio: sim.throttle / 100
                }
            }

            Text {
                x: 30; y: 316
                text: "OUTSIDE  " + Math.round(sim.outsideTemp) + "°C"
                color: "#5d6873"
                font.family: "DejaVu Sans"; font.pixelSize: 12; font.letterSpacing: 1
            }
        }

        // ================= BOTTOM STRIP =================
        Row {
            x: 30; y: 428
            spacing: 6
            Telltale { label: "CHECK"; lampColor: "#ffb020"; on: sim.checkEngine || lampTest }
            Telltale { label: "OIL";   lampColor: "#ff3b4e"; on: sim.oil || lampTest }
            Telltale { label: "BATT";  lampColor: "#ff3b4e"; on: sim.battery || lampTest }
            Telltale { label: "ABS";   lampColor: "#ffb020"; on: sim.abs || lampTest }
        }

        Row {
            anchors.horizontalCenter: parent.horizontalCenter
            y: 434
            spacing: 26
            Text {
                text: clock.now
                color: "#e8ecf0"
                font.family: "DejaVu Sans"; font.pixelSize: 18
                Timer {
                    id: clock
                    property string now: Qt.formatTime(new Date(), "HH:mm")
                    interval: 1000; running: true; repeat: true
                    onTriggered: now = Qt.formatTime(new Date(), "HH:mm")
                }
            }
            Text {
                text: "ODO  " + Math.floor(sim.odometer).toLocaleString(Qt.locale("en_CA"), "f", 0) + " km"
                color: "#9aa6b2"
                font.family: "DejaVu Sans"; font.pixelSize: 15
                anchors.verticalCenter: parent.verticalCenter
            }
            Text {
                text: "HI"
                color: (sim.highBeam || lampTest) ? "#3d8bff" : "#161b21"
                font.family: "DejaVu Sans"; font.bold: true; font.pixelSize: 15
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        Row {
            anchors.right: parent.right; anchors.rightMargin: 30
            y: 428
            spacing: 6
            Telltale { label: "AIRBAG"; lampColor: "#ff3b4e"; on: sim.airbag || lampTest }
            Telltale { label: "BRAKE";  lampColor: "#ff3b4e"; on: sim.brake || lampTest }
            Telltale { label: "BELT";   lampColor: "#ff3b4e"; on: sim.seatbelt || lampTest }
            Telltale { label: "FUEL";   lampColor: "#ffb020"; on: sim.lowFuel || lampTest }
        }
    }
}
