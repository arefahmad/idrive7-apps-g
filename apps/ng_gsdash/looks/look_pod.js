'use strict';
/**
 * Pod '04 - the dash as a mid-2000s pocket music player (original art in that spirit: no maker's name,
 * logo, font or icons). A glossy white front; on the left a monochrome screen, pale blue-grey and backlit,
 * in a dark bezel; on the right a touch wheel with a centre button. The screen shows the drive as Now
 * Playing: the speed as the track (big), the drive mode as the artist, the session as the album, and the
 * revs as the song's progress bar - the rpm elapsed on the left, the rpm still to go to the shift point on
 * the right (as a song's time left) - with oil and coolant as two small level bars, a play / pause mark in
 * the title bar (moving / standing still). Beside it a menu list, the g-force peaks, its top row
 * highlighted. On the wheel the revs fill round its ring, the gear sits on the centre button and a
 * fingertip dot moves with the g-force. Titillium and Hind (open fonts the app already ships). Static
 * parts (body, bezel, wheel) are cached layers. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');

const { withAlpha, clamp, isNum } = L;
const BIG = 'gs_s_gear', NUM = 'gs_s_num', TXT = 'gs_h_txt', LBL = 'gs_s_txt';
const C = {
    body0: '#fbfbf9', body1: '#dedfdc', bezel: '#2b2d31', lcd0: '#cfdbe3', lcd1: '#b4c4cf', ink: '#1b2530', ink2: '#56677a',
    hi0: '#6fb1f0', hi1: '#2f73cc', wheel: '#ecedeb', wheelEdge: '#c9cbc8', btn: '#f8f8f6', label: '#a3a8ad',
    blue: '#3d8ae0', amber: '#ff9f2e', red: '#ff3b30', green: '#3fae5a',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: "Pod '04",
    bg: C.body1, panelTop: C.body0, panelBottom: C.body1, panelEdge: '#b8bab6',
    track: '#c9cbc8', tick: '#9a9ea3', text: '#1d1f22', dim: '#6a6f75',
    accent: C.blue, accent2: C.hi1, ok: C.green, warn: '#b06a00', crit: '#d0281e', cold: C.blue,
    stripes: [C.hi0, C.blue, C.hi1], sel: C.blue, selText: '#ffffff', marker: C.amber,
});
const T = (cv, s, x, y, size, col, font, o) => cv.text(s, x, y, size, col || C.ink, Object.assign({ font: font || TXT, literal: true }, o || {}));

/* ---------------- the body, the bezel, the wheel ---------------- */
function body(c, w, h) {
    c.gradientRect(0, 0, w, h, [[0, C.body0], [0.55, '#eeeeec'], [1, C.body1]]);
    c.gradientRect(0, 0, w, h * 0.18, [[0, withAlpha('#ffffff', 0.9)], [1, withAlpha('#ffffff', 0)]]);
}
function background(cv, t, reach) { cv.blit(G.layer('gs-pod-body|' + reach, 1600, reach, (c) => body(c, 1600, reach)), 0, 0); }
function geo(S) {
    const bx = S.x + 14, by = S.y + 8, bw = 1046, bh = S.h - 16;
    const R = Math.min(196, (S.h - 40) / 2), wx = S.x + S.w - 30 - R, wy = S.y + Math.min(S.h, 456) / 2 - 8;
    return { bx, by, bw, bh, lx: bx + 16, ly: by + 16, lw: bw - 32, lh: bh - 32, R, wx, wy };
}
function bezel(c, g) {
    c.roundRect(0, 0, g.bw, g.bh, 26, C.bezel);
    c.roundRect(3, 3, g.bw - 6, 4, 2, withAlpha('#ffffff', 0.12));
    c.gradientRect(16, 16, g.lw, g.lh, [[0, C.lcd0], [1, C.lcd1]]);
    c.fillRect(16, 16, g.lw, 3, withAlpha('#000000', 0.12)); c.fillRect(16, 16, 3, g.lh, withAlpha('#000000', 0.10));
}
/** next / previous: two triangles and a bar (dir 1 next, -1 previous) */
function skip(c, x, y, dir, col) {
    [0, 13].forEach((o) => { const ax = x + dir * (o - 13); c.quad([[ax, y - 8], [ax + dir * 13, y], [ax + dir * 13, y], [ax, y + 8]], col); });
    c.fillRect(dir > 0 ? x + 13 : x - 16, y - 8, 3, 16, col);
}
function wheel(c, R) {
    const x = R + 8, y = R + 8, col = C.label;
    c.circle(x + 2, y + 4, R + 2, withAlpha('#000000', 0.10));
    c.circle(x, y, R, C.wheelEdge);
    c.circle(x, y, R - 3, C.wheel);
    // the centre button
    const r = R * 0.36;
    c.circle(x, y, r + 3, C.wheelEdge);
    c.circle(x, y, r, C.btn);
    // the labels: MENU, next, previous, play / pause
    c.text('MENU', x, y - R * 0.68 + 9, 24, col, { font: LBL, align: 'center', spacing: 2, literal: true });
    skip(c, x + R * 0.68, y, 1, col);
    skip(c, x - R * 0.68, y, -1, col);
    const py = y + R * 0.68;
    c.quad([[x - 16, py - 9], [x - 2, py], [x - 2, py], [x - 16, py + 9]], col);
    c.fillRect(x + 3, py - 9, 4, 18, col); c.fillRect(x + 11, py - 9, 4, 18, col);
}
/** the menu list (the right panel on the screen): a title, rows with values and chevrons, the first highlighted */
function menu(cv, S, x, y, w, h) {
    const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
    const rows = [['G-force now', tot == null ? '-.--' : tot.toFixed(2) + ' g'], ['Best launch', S.peak.acc.toFixed(2) + ' g'], ['Hardest braking', S.peak.brk.toFixed(2) + ' g'],
        ['Fastest corner', S.peak.lat.toFixed(2) + ' g'], ['Session', L.clock(S.session)]];
    const rh = Math.min(58, (h - 8) / rows.length);
    rows.forEach((r, i) => {
        const ry = y + i * rh, on = i === 0;
        if (on) cv.gradientRect(x, ry, w, rh, [[0, C.hi0], [1, C.hi1]]);
        else cv.fillRect(x + 12, ry + rh - 1, w - 24, 1, withAlpha(C.ink2, 0.25));
        const col = on ? '#ffffff' : C.ink;
        T(cv, r[0], x + 14, ry + rh / 2 + 9, 24, col);
        T(cv, r[1], x + w - 40, ry + rh / 2 + 9, 24, col, NUM, { align: 'right' });
        cv.line(x + w - 24, ry + rh / 2 - 7, x + w - 17, ry + rh / 2, 2.5, col); cv.line(x + w - 17, ry + rh / 2, x + w - 24, ry + rh / 2 + 7, 2.5, col);
    });
    L.sessionTap(cv, S, x, y + 4 * rh, w, rh, C.blue, 0);
}

module.exports = {
    id: 'pod',
    name: "Pod '04",
    blurb: 'A mid-2000s pocket music player: a backlit screen playing your drive, a touch wheel',
    palette,
    ui: { txt: TXT, num: NUM, size: 20, spacing: 0, upper: false, radius: 12, nameFont: TXT, nameSize: 28 },
    badgeLetter: '#2b2d31',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) {
        cv.roundRect(x, y, w, h, 12, on ? withAlpha(C.blue, 0.14) : withAlpha('#ffffff', 0.7));
        cv.strokeRoundRect(x, y, w, h, 12, on ? 2.5 : 1, on ? C.blue : withAlpha('#000000', 0.14));
    },
    cardBg(cv, t, x, y, w, h) { cv.gradientRect(x, y, w, h, [[0, C.body0], [1, C.body1]]); },
    panelPlate(cv, t, x, y, w, h) { cv.roundRect(x, y, w, h, 18, C.bezel); cv.gradientRect(x + 12, y + 12, w - 24, h - 24, [[0, C.lcd0], [1, C.lcd1]]); },
    gButton(cv, t, r, lit, down) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rr = Math.min(r.w, r.h) / 2 - 8;
        cv.circle(cx, cy, rr + 2, C.wheelEdge); cv.circle(cx, cy, rr, down ? C.wheel : C.btn);
        if (lit) cv.arc(cx, cy, rr - 3, rr, 0, 360, C.blue);
        const bh = 20, bw = L.badgeWidth(bh);
        L.badge(cv, cx - bw / 2, cy + bh / 2, bh, '#1d1f22');
    },
    /** The gallery card: a little screen with a number and a progress bar, the wheel under it */
    swatch(cv, t, x, y, w, h) {
        const sw = w - 40, sh = h * 0.5, sx = x + 20, sy = y + 4;
        cv.roundRect(sx - 5, sy - 5, sw + 10, sh + 10, 8, C.bezel);
        cv.gradientRect(sx, sy, sw, sh, [[0, C.lcd0], [1, C.lcd1]]);
        T(cv, '88', sx + sw / 2, sy + sh * 0.62, Math.round(sh * 0.5), C.ink, BIG, { align: 'center' });
        cv.roundRect(sx + 8, sy + sh - 14, sw - 16, 7, 3, withAlpha(C.ink2, 0.3)); cv.roundRect(sx + 8, sy + sh - 14, (sw - 16) * 0.6, 7, 3, C.blue);
        const R = Math.min(w, h) * 0.2, wx = x + w / 2, wy = sy + sh + 14 + R;
        cv.circle(wx, wy, R, C.wheelEdge); cv.circle(wx, wy, R - 2, C.wheel); cv.circle(wx, wy, R * 0.36, C.btn);
    },

    panelRect(S) { const g = geo(S); return { x: g.lx + 610, y: g.ly + 52, w: g.lw - 610, h: g.lh - 52 }; },

    draw(cv, S) {
        const now = Date.now(), g = geo(S), mph = isNum(S.mph) ? S.mph : isNum(S.speed) ? (S.imperial ? S.speed : S.speed / 1.609344) : 0;
        cv.blit(G.layer(['gs-pod-bezel', g.bw, g.bh].join('|'), g.bw, g.bh, (c) => bezel(c, g), cv.textScale), g.bx, g.by);
        const x = g.lx, y = g.ly, w = g.lw, h = g.lh, blink = Math.floor(now / 250) % 2 === 0;
        // the title bar: play / pause, the title, a full battery
        cv.gradientRect(x, y, w, 44, [[0, '#f3f6f8'], [1, '#c9d3da']]);
        cv.fillRect(x, y + 44, w, 1, withAlpha(C.ink2, 0.5));
        if (mph > 1) cv.quad([[x + 18, y + 12], [x + 36, y + 22], [x + 36, y + 22], [x + 18, y + 32]], C.ink);
        else { cv.fillRect(x + 18, y + 12, 6, 20, C.ink); cv.fillRect(x + 30, y + 12, 6, 20, C.ink); }
        T(cv, S.strobe ? 'Shift Up!' : 'Now Playing', x + w / 2, y + 31, 24, S.strobe && blink ? C.red : C.ink, LBL, { align: 'center' });
        cv.strokeRoundRect(x + w - 64, y + 12, 40, 20, 3, 2, C.ink); cv.fillRect(x + w - 24, y + 17, 4, 10, C.ink);
        cv.gradientRect(x + w - 60, y + 16, 32, 12, [[0, '#8fd18a'], [1, C.green]]);
        // Now Playing: the gear as the track number, the speed as the title, the mode and session under it
        const nx = x + 34, nw = 560;
        T(cv, 'Gear ' + S.gearText, nx, y + 82, 22, C.ink2);
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--';
        T(cv, sp, nx - 4, y + 192, 124, C.ink, BIG);
        T(cv, (S.unit || 'mph').toLowerCase(), nx + cv.textWidth(sp, 124, { font: BIG, literal: true }) + 6, y + 192, 32, C.ink2, LBL);
        T(cv, S.mode ? S.mode.charAt(0) + S.mode.slice(1).toLowerCase() : 'Drive', nx, y + 230, 26, C.ink);
        T(cv, 'Session ' + L.clock(S.session), nx, y + 260, 22, C.ink2);
        // the progress bar: the revs; elapsed rpm left, rpm to the shift point right
        const by = y + 284, bw = nw - 20, lo = S.shift - S.range, rpm = isNum(S.rpm) ? G.smooth('gs-pod-rpm', S.rpm, 14) : 0, f = clamp(rpm / S.maxRpm, 0, 1);
        cv.roundRect(nx, by, bw, 14, 7, withAlpha(C.ink2, 0.25));
        cv.strokeRoundRect(nx, by, bw, 14, 7, 1.5, withAlpha(C.ink, 0.6));
        const fc = S.strobe ? (blink ? C.red : '#ffffff') : rpm >= S.shift ? C.red : rpm >= lo ? C.amber : null;
        if (f > 0.02) {
            if (fc) cv.roundRect(nx, by, bw * f, 14, 7, fc);
            else cv.rampRect(nx, by, bw * f, 14, 7, [[0, C.hi0], [1, C.hi1]], nx, bw);
            cv.quad([[nx + bw * f, by - 5], [nx + bw * f + 9, by + 7], [nx + bw * f, by + 19], [nx + bw * f - 9, by + 7]], C.ink);
        }
        T(cv, L.rpmText(S.rpm), nx, by + 40, 22, C.ink, NUM);
        const left = isNum(S.rpm) ? Math.max(0, S.shift - S.rpm) : null;
        T(cv, left == null ? '----' : '-' + L.rpmText(left), nx + bw, by + 40, 22, C.ink, NUM, { align: 'right' });
        // oil and coolant: two small level bars
        [['Oil', S.oil], ['Coolant', S.cool]].forEach((r, i) => {
            const fx = nx + i * 280, fy = by + 70, zg = L.tempGauge(r[1], { cold: C.blue, ok: C.green, hot: C.red }, '#9fb0bc', 0.3);
            T(cv, r[0] + ' ' + L.tempText(r[1]), fx, fy + 4, 18, C.ink2);
            cv.roundRect(fx, fy + 12, 250, 7, 3.5, withAlpha(C.ink2, 0.25));
            if (zg.on) cv.roundRect(fx, fy + 12, Math.max(7, 250 * zg.pos), 7, 3.5, zg.on);
        });
        // the menu list (the right panel): the peaks
        const pr = module.exports.panelRect(S);
        cv.fillRect(pr.x - 1, pr.y, 1, pr.h, withAlpha(C.ink2, 0.35));
        if (!S.panel || S.panel === 'g') menu(cv, S, pr.x, pr.y + 4, pr.w, pr.h - 8);
        // the wheel: the revs round its ring, the gear on the centre button, a fingertip dot for the g
        cv.blit(G.layer(['gs-pod-wheel', g.R].join('|'), 2 * g.R + 20, 2 * g.R + 20, (c) => wheel(c, g.R), cv.textScale), g.wx - g.R - 8, g.wy - g.R - 8);
        const A0 = -140, A1 = 140, A = (v) => A0 + (A1 - A0) * clamp(v / S.maxRpm, 0, 1), r0 = g.R * 0.82, r1 = g.R * 0.92;
        cv.arc(g.wx, g.wy, r0, r1, A0, A1, withAlpha(C.ink2, 0.10), { round: true });
        if (f > 0.01) {
            const col = S.strobe ? (blink ? C.red : withAlpha(C.red, 0.35)) : rpm >= S.shift ? C.red : rpm >= lo ? C.amber : null;
            if (col) cv.arc(g.wx, g.wy, r0, r1, A0, A(rpm), col, { round: true });
            else cv.arc(g.wx, g.wy, r0, r1, A0, A(rpm), C.blue, { round: true, ramp: [C.hi0, C.hi1], rampFrom: A0, rampTo: A1 });
        }
        const gs = L.gearFit(cv, S.gearText, 92, g.R * 0.6, { font: BIG, spacing: 0 });
        T(cv, S.gearText, g.wx, g.wy + gs * 0.36, gs, S.strobe && blink ? C.red : '#3a3f45', BIG, { align: 'center' });
        if (isNum(S.gLat) && isNum(S.gLong)) {
            const gx = G.smooth('gs-pod-gx', S.gLat, 6), gy = G.smooth('gs-pod-gy', -S.gLong, 6), m = Math.min(1, Math.sqrt(gx * gx + gy * gy) / (S.gMax || 1.5));
            if (m > 0.04) {
                const a = Math.atan2(gy, gx), rr = g.R * (0.42 + 0.33 * m);
                const dx = g.wx + Math.cos(a) * rr, dy = g.wy + Math.sin(a) * rr;
                cv.circle(dx, dy, 20, withAlpha(C.blue, 0.18)); cv.circle(dx, dy, 11, withAlpha(C.blue, 0.75));
            }
        }
        S.zones = {
            speed: { x: nx, y: y + 92, w: 400, h: 110 }, gear: { x: g.wx - g.R * 0.36, y: g.wy - g.R * 0.36, w: g.R * 0.72, h: g.R * 0.72 },
            toast: { x: x + 300, y: y + 160 }, chip: { x: x + w - 90, y: y + 22 }, star: { x: x + 180, y: y + 76 },
        };
    },
};
