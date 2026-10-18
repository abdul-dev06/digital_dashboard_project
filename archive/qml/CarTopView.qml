import QtQuick

// Bird's-eye view of the car. Set `source` to a PNG (transparent background,
// nose pointing up) to use a real photo instead of the drawn outline.
Item {
    id: car
    property url source: ""
    property color lineColor: "#7fb4ff"

    width: 120; height: 240

    Image {
        anchors.fill: parent
        source: car.source
        visible: car.source != ""
        fillMode: Image.PreserveAspectFit
        smooth: true
    }

    Canvas {
        anchors.fill: parent
        visible: car.source == ""
        onPaint: {
            var c = getContext("2d"); c.reset();
            var w = width, h = height;
            var line = car.lineColor;

            function rrect(x, y, ww, hh, r) {
                c.beginPath();
                c.moveTo(x + r, y);
                c.lineTo(x + ww - r, y); c.quadraticCurveTo(x + ww, y, x + ww, y + r);
                c.lineTo(x + ww, y + hh - r); c.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh);
                c.lineTo(x + r, y + hh); c.quadraticCurveTo(x, y + hh, x, y + hh - r);
                c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
                c.closePath();
            }
            function quad(p) {
                c.beginPath(); c.moveTo(p[0] * w, p[1] * h);
                for (var i = 2; i < p.length; i += 2) c.lineTo(p[i] * w, p[i + 1] * h);
                c.closePath();
            }

            // Wheels (under the body)
            c.fillStyle = "#1b2027";
            rrect(0.02 * w, 0.14 * h, 0.14 * w, 0.13 * h, 4); c.fill();
            rrect(0.84 * w, 0.14 * h, 0.14 * w, 0.13 * h, 4); c.fill();
            rrect(0.02 * w, 0.72 * h, 0.14 * w, 0.13 * h, 4); c.fill();
            rrect(0.84 * w, 0.72 * h, 0.14 * w, 0.13 * h, 4); c.fill();

            // Body
            var g = c.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, "rgba(127,180,255,0.10)");
            g.addColorStop(0.5, "rgba(127,180,255,0.22)");
            g.addColorStop(1, "rgba(127,180,255,0.10)");
            c.fillStyle = g;
            c.strokeStyle = line; c.lineWidth = 1.6;
            rrect(0.09 * w, 0.02 * h, 0.82 * w, 0.96 * h, 0.24 * w); c.fill(); c.stroke();

            // Mirrors
            c.fillStyle = "rgba(127,180,255,0.35)";
            rrect(0.0, 0.33 * h, 0.1 * w, 0.035 * h, 3); c.fill();
            rrect(0.9 * w, 0.33 * h, 0.1 * w, 0.035 * h, 3); c.fill();

            // Hood creases
            c.strokeStyle = "rgba(127,180,255,0.45)"; c.lineWidth = 1;
            c.beginPath(); c.moveTo(0.32 * w, 0.06 * h); c.lineTo(0.30 * w, 0.29 * h); c.stroke();
            c.beginPath(); c.moveTo(0.68 * w, 0.06 * h); c.lineTo(0.70 * w, 0.29 * h); c.stroke();

            // Glass
            c.fillStyle = "rgba(20,40,70,0.9)";
            c.strokeStyle = line; c.lineWidth = 1.3;
            quad([0.17, 0.31, 0.83, 0.31, 0.75, 0.42, 0.25, 0.42]); c.fill(); c.stroke();   // windshield
            quad([0.25, 0.67, 0.75, 0.67, 0.81, 0.76, 0.19, 0.76]); c.fill(); c.stroke();   // rear glass
            quad([0.14, 0.43, 0.20, 0.44, 0.20, 0.65, 0.14, 0.66]); c.fill();               // side glass L
            quad([0.86, 0.43, 0.80, 0.44, 0.80, 0.65, 0.86, 0.66]); c.fill();               // side glass R

            // Roof
            c.fillStyle = "rgba(127,180,255,0.16)";
            rrect(0.24 * w, 0.43 * h, 0.52 * w, 0.23 * h, 6); c.fill(); c.stroke();

            // Lights
            c.lineWidth = 3; c.lineCap = "round";
            c.strokeStyle = "#e8f1ff";
            c.beginPath(); c.moveTo(0.18 * w, 0.045 * h); c.lineTo(0.33 * w, 0.03 * h); c.stroke();
            c.beginPath(); c.moveTo(0.82 * w, 0.045 * h); c.lineTo(0.67 * w, 0.03 * h); c.stroke();
            c.strokeStyle = "#ff2d3f";
            c.beginPath(); c.moveTo(0.16 * w, 0.955 * h); c.lineTo(0.32 * w, 0.97 * h); c.stroke();
            c.beginPath(); c.moveTo(0.84 * w, 0.955 * h); c.lineTo(0.68 * w, 0.97 * h); c.stroke();
        }
    }
}
