import QtQuick

// Fake vehicle data: key-on bulb check + needle sweep, then an endless
// city/highway drive cycle with a 4-speed automatic.
// Swap this file for a real data source later (UART from a microcontroller).
Item {
    id: sim
    visible: false

    // ---- Outputs the cluster binds to ----
    property real speed: 0          // km/h
    property real rpm: 0
    property int  gear: 1
    property string selector: "P"   // P R N D
    property real coolant: 22       // °C
    property real fuel: 0.58        // 0..1
    property real odometer: 186432.0
    property real tripA: 128.4
    property real outsideTemp: -12
    property bool bulbCheck: true
    property bool ignition: true
    property bool leftTurn: false
    property bool rightTurn: false
    property bool highBeam: false
    property bool seatbelt: true
    property bool checkEngine: true
    property bool oil: true
    property bool battery: true
    property bool abs: true
    property bool airbag: true
    property bool brake: true
    readonly property bool lowFuel: fuel < 0.12
    // Engine data an '07 Elantra ECM can report over OBD2
    property real intakeTemp: -8     // °C
    property real batteryVolts: 12.4
    property real engineLoad: 0      // %
    property real throttle: 0        // %
    // Trip computer
    property real tripTime: 0        // seconds driving since key-on
    property real tripDist: 0        // km since key-on
    readonly property real avgSpeed: tripTime > 5 ? tripDist / (tripTime / 3600) : 0
    readonly property real range: fuel * 55 / 8.6 * 100   // 55 L tank, ~8.6 L/100 km

    // ---- Internals ----
    property real t: 0
    property real stateTime: 0
    property string state: "boot"
    property real target: 0
    property real stateLen: 0
    property real blinkLeft: 0       // seconds of turn signal remaining
    property int  blinkSide: 0       // -1 left, 1 right
    property double lastMs: 0

    readonly property var kmhPer1000: [8.5, 15.0, 23.0, 32.0]   // per gear

    function rnd(a, b) { return a + Math.random() * (b - a); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function idleRpm() { return 760 + Math.max(0, 60 - coolant) * 6; }

    function enter(s) {
        state = s; stateTime = 0;
        if (s === "idle")   { stateLen = rnd(3, 6); target = 0; selector = "D"; }
        if (s === "accel")  { target = pick([50, 60, 70, 80, 100, 110]); if (target <= speed + 5) target = speed + 25; }
        if (s === "cruise") { stateLen = rnd(6, 12); }
        if (s === "brake")  { }
    }

    function signal(side) { blinkSide = side; blinkLeft = 3.5; }

    function step(dt) {
        t += dt; stateTime += dt;

        // --- Key-on: bulb check + needle sweep (2.4 s) ---
        if (state === "boot") {
            var p = Math.min(1, stateTime / 2.4);
            var s = p < 0.5 ? p * 2 : (1 - p) * 2;     // up then down
            s = s * s * (3 - 2 * s);                   // smoothstep
            speed = 220 * s; rpm = 8000 * s;
            if (p >= 1) {
                bulbCheck = false;
                checkEngine = false; oil = false; battery = false;
                abs = false; airbag = false; brake = false;
                speed = 0; rpm = idleRpm(); selector = "P";
                state = "warm"; stateTime = 0;
            }
            return;
        }
        if (state === "warm") {                        // sit in Park, then shift to D
            rpm += (idleRpm() - rpm) * Math.min(1, dt * 4);
            if (stateTime > 2.5) seatbelt = false;
            if (stateTime > 3.5) { selector = "D"; enter("accel"); }
            return;
        }

        // --- Speed profile ---
        if (state === "idle") {
            speed = 0;
            if (stateTime > stateLen) enter("accel");
        } else if (state === "accel") {
            var a = 9.5 * Math.max(0.25, 1 - speed / 170);   // km/h per second
            speed += a * dt;
            if (speed >= target) { speed = target; enter("cruise"); }
        } else if (state === "cruise") {
            speed = target + Math.sin(t * 0.7) * 1.2 + Math.sin(t * 0.23) * 0.8;
            if (stateTime > stateLen) {
                var r = Math.random();
                if (r < 0.4) { target = 0; signal(Math.random() < 0.5 ? -1 : 1); enter("brake"); }
                else if (r < 0.7) { target = Math.max(30, target - pick([20, 30])); enter("brake"); }
                else { enter("accel"); }
            }
        } else if (state === "brake") {
            speed -= 11 * dt;
            if (speed <= target) {
                speed = Math.max(0, target);
                if (target <= 0) enter("idle"); else { stateLen = rnd(5, 9); state = "cruise"; stateTime = 0; }
            }
        }

        // --- Automatic transmission ---
        var accel = state === "accel";
        var g = gear;
        var engineAt = function(gg) { return speed / kmhPer1000[gg - 1] * 1000; };
        if (accel) {
            if (g < 4 && engineAt(g) > (target > 90 ? 3600 : 3000)) g++;
        } else {
            // lowest-revving gear that keeps the engine above ~1450 rpm
            g = 1;
            for (var i = 4; i >= 1; i--) { if (engineAt(i) >= 1450) { g = i; break; } }
            if (g < gear - 1) g = gear - 1;            // one downshift at a time
        }
        gear = Math.max(1, Math.min(4, g));

        var targetRpm = Math.max(idleRpm(), engineAt(gear)) + (accel ? 380 : 0);
        if (speed < 1) targetRpm = idleRpm() + Math.sin(t * 9) * 12;
        rpm += (targetRpm - rpm) * Math.min(1, dt * 7);

        // --- Slow-moving values ---
        if (coolant < 90) coolant += dt * 0.9; else coolant = 90 + Math.sin(t * 0.05) * 2;
        var km = speed / 3600 * dt;
        odometer += km; tripA += km; tripDist += km; tripTime += dt;

        // Engine readings
        var thr = accel ? 28 + Math.min(30, (target - speed) * 0.8) : (state === "cruise" ? 14 + speed * 0.06 : 0);
        throttle += (thr - throttle) * Math.min(1, dt * 3);
        var load = speed < 1 ? 19 : (accel ? 55 + throttle * 0.6 : (state === "brake" ? 12 : 28 + speed * 0.12));
        engineLoad += (load - engineLoad) * Math.min(1, dt * 3);
        var iat = outsideTemp + 6 + Math.max(0, 25 - speed) * 0.25;   // heat soak at low speed
        intakeTemp += (iat - intakeTemp) * Math.min(1, dt * 0.2);
        batteryVolts = 14.1 + Math.sin(t * 0.37) * 0.06 - (rpm < 900 ? 0.15 : 0);
        fuel = Math.max(0.05, fuel - km / 520);

        // Turn signals: 1.5 Hz flash
        if (blinkLeft > 0) {
            blinkLeft -= dt;
            var onPhase = (Math.floor(t * 3) % 2) === 0;
            leftTurn = blinkSide < 0 && onPhase && blinkLeft > 0;
            rightTurn = blinkSide > 0 && onPhase && blinkLeft > 0;
        } else { leftTurn = false; rightTurn = false; }
    }

    Timer {
        interval: 16; running: true; repeat: true
        onTriggered: {
            var now = Date.now();
            var dt = sim.lastMs > 0 ? Math.min(0.1, (now - sim.lastMs) / 1000) : 0.016;
            sim.lastMs = now;
            sim.step(dt);
        }
    }

    property real ffRequest: 0
    onFfRequestChanged: fastForward(ffRequest)

    // For test renders: advance the simulation without waiting in real time.
    function fastForward(seconds) {
        var n = Math.round(seconds / 0.02);
        for (var i = 0; i < n; i++) step(0.02);
    }
}
