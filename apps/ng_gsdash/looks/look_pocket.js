'use strict';
/**
 * Pocket - the dash as a late-80s pocket game console (original art in that spirit: no maker's name, logo
 * or artwork). A light grey body; a dark bezel with a red power light round a four-shade green dot-matrix
 * screen; a cross pad on the left, two round buttons on the right and two pill buttons under the screen.
 * On the screen, as a game would draw it: the rpm as a block bar, the speed in big pixel numerals, the gear
 * in a box, oil and coolant bars, a g-meter target with its peaks, the session as TIME, and a little car
 * driving along a road under scrolling hills (faster with the car's speed, "SHIFT!" blinking past the shift
 * point). The G's Dash pixel font (px.js, as the Pixel look). Static parts (body, bezel, pad, buttons,
 * the screen's dot grid) are cached layers. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');
const P = require('./px');

const { withAlpha, clamp, isNum } = L;
const FONT = 'gs_p_px';
/* the screen's four shades, darkest to lightest */
const S0 = '#0f380f', S1 = '#306230', S2 = '#8bac0f', S3 = '#9bbc0f';
const C = { body0: '#cfcfd2', body1: '#b9b9bd', bezel: '#5b5f6e', bezelHi: '#6b7080', led: '#ff2d2d', pad: '#2a2a2e', btn: '#9c2a5c', btnHi: '#c4467c', label: '#2b2f6b', pill: '#8c8c94' };
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'Pocket',
    bg: C.body1, panelTop: C.body0, panelBottom: C.body1, panelEdge: '#8a8a90',
    track: '#a8a8ae', tick: '#7a7a80', text: '#1c1d2b', dim: '#4c5064',
    accent: S1, accent2: C.label, ok: S1, warn: '#7a5a00', crit: '#b0203a', cold: C.label,
    stripes: [S0, S1, S2], sel: S1, selText: S3, marker: C.btn,
});
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col || S0, Object.assign({ font: FONT, literal: true }, o || {}));
const numCell = (size) => Math.max(2, Math.round(size / 9));
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------------- the console ---------------- */
function body(c, w, h) {
    c.gradientRect(0, 0, w, h, [[0, C.body0], [1, C.body1]]);
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1, withAlpha('#ffffff', 0.05));
}
function background(cv, t, reach) { cv.blit(G.layer('gs-pk-body|' + reach, 1600, reach, (c) => body(c, 1600, reach)), 0, 0); }
function geo(S) {
    const sx = S.x + 270, sy = S.y + 10, sw = 1036, sh = S.h - 52;         // the bezel
    return { sx, sy, sw, sh, lx: sx + 84, ly: sy + 28, lw: sw - 116, lh: sh - 62 };   // and the screen inside it
}
/** the bezel (rounded, the lower right corner rounder), the power light, the screen's base colour and dot grid */
function bezel(c, g) {
    const w = g.sw, h = g.sh;
    c.roundRect(0, 0, w, h, 16, C.bezel);
    c.roundRect(w - 120, h - 120, 120, 120, 60, C.bezel);
    c.roundRect(2, 2, w - 4, 3, 2, withAlpha(C.bezelHi, 0.8));
    // the power light and its label
    c.circle(40, g.ly - g.sy + g.lh * 0.35, 7, withAlpha(C.led, 0.35)); c.circle(40, g.ly - g.sy + g.lh * 0.35, 4.5, C.led);
    c.text('POWER', 40, g.ly - g.sy + g.lh * 0.35 + 24, 16, '#c8cad6', { font: FONT, align: 'center', literal: true });
    // the screen: lightest shade, a dot grid (dot-matrix), a soft inner shadow
    const x = g.lx - g.sx, y = g.ly - g.sy;
    c.fillRect(x - 3, y - 3, g.lw + 6, g.lh + 6, '#3c404c');
    c.fillRect(x, y, g.lw, g.lh, S3);
    for (let gx = 0; gx < g.lw; gx += 4) c.fillRect(x + gx, y, 1, g.lh, withAlpha(S2, 0.35));
    for (let gy = 0; gy < g.lh; gy += 4) c.fillRect(x, y + gy, g.lw, 1, withAlpha(S2, 0.35));
    c.fillRect(x, y, g.lw, 6, withAlpha(S1, 0.18)); c.fillRect(x, y, 6, g.lh, withAlpha(S1, 0.18));
    // the maker line under the screen: the app's own name
    c.text("G's Dash  POCKET", x, h - 8, 16, '#c8cad6', { font: FONT, literal: true });
}
/** the cross pad, two round buttons, two pills, the speaker slots; drawn once */
function controls(c, w, h, g, S) {
    const px = g.sx - S.x - 150, py = 190;
    // the cross pad
    c.roundRect(px - 70, py - 22, 140, 44, 6, C.pad); c.roundRect(px - 22, py - 70, 44, 140, 6, C.pad);
    c.circle(px, py, 12, '#202024');
    [[0, -50], [0, 50], [-50, 0], [50, 0]].forEach((d) => {
        const ax = px + d[0], ay = py + d[1], s = 9, ux = d[0] / 50, uy = d[1] / 50;
        c.quad([[ax + ux * s, ay + uy * s], [ax - uy * s - ux * s * 0.6, ay + ux * s - uy * s * 0.6], [ax + uy * s - ux * s * 0.6, ay - ux * s - uy * s * 0.6], [ax + ux * s, ay + uy * s]], '#3e3e44');
    });
    // B and A, on a slant
    const bx = g.sx - S.x + g.sw + 110, by = 230;
    [[bx - 44, by + 22, 'B'], [bx + 44, by - 22, 'A']].forEach((b) => {
        c.circle(b[0] + 2, b[1] + 3, 32, withAlpha('#000000', 0.25));
        c.circle(b[0], b[1], 32, C.btn); c.circle(b[0] - 6, b[1] - 7, 14, withAlpha(C.btnHi, 0.5));
        c.text(b[2], b[0] + 30, b[1] + 50, 24, C.label, { font: FONT, literal: true });
    });
    // the speaker: slanted slots, lower right
    for (let i = 0; i < 6; i++) { const sx = g.sx - S.x + g.sw + 70 + i * 18; c.line(sx, h - 26, sx + 34, h - 90, 6, withAlpha('#7a7a82', 0.8)); }
    // select, start
    [['SELECT', -80], ['START', 80]].forEach((p2) => {
        const cx = g.sx - S.x + g.sw / 2 + p2[1], cy = g.sh + 26;
        c.roundRect(cx - 36, cy - 8, 72, 16, 8, C.pill);
        c.text(p2[0], cx, cy + 30, 16, C.label, { font: FONT, align: 'center', literal: true });
    });
}

/* ---------------- the screen ---------------- */
/** a box with a 2 px border in the darkest shade */
function box(cv, x, y, w, h) { cv.fillRect(x, y, w, 2, S0); cv.fillRect(x, y + h - 2, w, 2, S0); cv.fillRect(x, y, 2, h, S0); cv.fillRect(x + w - 2, y, 2, h, S0); }
/** blocks across w, k of them lit (darkest), the rest outlined faintly */
function bar(cv, x, y, w, h, k, n, colOf) {
    const bw = (w - (n - 1) * 3) / n, lit = Math.round(clamp(k, 0, 1) * n);
    for (let i = 0; i < n; i++) cv.fillRect(Math.round(x + i * (bw + 3)), y, Math.round(bw), h, i < lit ? (colOf ? colOf(i / n) : S0) : withAlpha(S1, 0.25));
}
/** the little car: a pixel sprite, 4 px cells, wheels turning */
const CAR = ['....######....', '...##....###..', '..##......###.', '##############', '##############', '.###......###.', '..#........#..'];
function car(cv, x, y, now, mph) {
    const u = 5;
    CAR.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') cv.fillRect(x + i * u, y + j * u, u, u, S0); });
    // the windows lighter, the wheels' spokes turning
    cv.fillRect(x + 4 * u, y + 2 * u, 3 * u, u, S2); cv.fillRect(x + 8 * u, y + 2 * u, 3 * u, u, S2);
    const turn = Math.floor(now / Math.max(40, 220 - mph * 2)) % 2;
    [x + 2 * u, x + 11 * u].forEach((wx) => { cv.fillRect(wx - u, y + 5 * u, 3 * u, 2 * u, S0); cv.fillRect(wx + (turn ? -u / 2 : u / 2), y + 5.5 * u, u, u, S2); });
}
/** a rect clipped to [x0, x1) across (clip() is not drawn everywhere: the software path ignores it) */
function hrect(cv, x, y, w, h, x0, x1, c) { const a = Math.max(x, x0), b = Math.min(x + w, x1); if (b > a) cv.fillRect(a, y, b - a, h, c); }
function road(cv, g, x, y, w, h, now, mph) {
    const v = clamp(isNum(mph) ? mph : 0, 0, 160), ts = now / 1000, x1 = x + w;
    if (!road.t) road.t = { at: now, far: 0, near: 0 };
    const dt = clamp((now - road.t.at) / 1000, 0, 0.25); road.t.at = now;
    road.t.far += dt * (6 + v * 0.6); road.t.near += dt * (20 + v * 3.2);
    // far hills: a stepped skyline, scrolling slowly
    for (let i = -1; i < w / 32 + 2; i++) {
        const k = Math.floor(i + road.t.far / 32), hh = 8 + Math.round(rnd(k, 1) * 3) * 6, hx = x + i * 32 - (road.t.far % 32);
        hrect(cv, hx, y + h - 22 - hh, 32, hh, x, x1, S2);
    }
    // the road: a base line, dashes rushing past
    cv.fillRect(x, y + h - 22, w, 4, S0);
    for (let i = -1; i < w / 48 + 2; i++) hrect(cv, x + i * 48 - (road.t.near % 48), y + h - 10, 24, 4, x, x1, S1);
    const bob = v > 2 ? Math.round(Math.sin(ts * 18)) : 0;
    car(cv, x + 90, y + h - 22 - 35 + bob, now, v);
}
function screen(cv, S, g, now) {
    const x = g.lx + 16, y = g.ly + 14, w = g.lw - 32, h = g.lh - 28, gm = !S.panel || S.panel === 'g';
    const lw = gm ? w * 0.66 : w;                            // the left part; the g-meter on the right
    const lo = S.shift - S.range, hot = isNum(S.rpm) && S.rpm >= lo;
    // the rpm bar
    T(cv, 'RPM', x, y + 24, 24);
    const rpm = isNum(S.rpm) ? G.smooth('gs-pk-rpm', S.rpm, 14) : 0;
    if (!(S.strobe && !S.blink)) bar(cv, x + 72, y + 4, lw - 82, 22, rpm / S.maxRpm, 28, (f) => (f * S.maxRpm >= lo ? S1 : S0));
    T(cv, L.rpmText(S.rpm), x + lw - 10, y + 52, 24, S0, { align: 'right' });
    if (S.strobe && S.blink) T(cv, 'SHIFT!', x + 72, y + 52, 24, S0);
    else if (hot) T(cv, 'READY', x + 72, y + 52, 24, S1);
    // the speed, big, and the gear in its box
    const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--', u = sp.length > 2 ? 10 : 12, gw = 170;
    P.text(cv, sp, x + lw - gw - 40, y + 66, u, S0, { align: 'right' });
    T(cv, (S.unit || 'MPH').toUpperCase(), x + 4, y + 120, 24, S1);
    const gx = x + lw - gw, gy = y + 64;
    box(cv, gx, gy, gw, 122);
    T(cv, 'GEAR', gx + 12, gy + 26, 16, S1);
    let gu = 10; while (gu > 4 && P.width(S.gearText, gu) > gw - 30) gu--;
    P.text(cv, S.gearText, gx + gw / 2, gy + 32 + (88 - 7 * gu) / 2, gu, S0, { align: 'center' });
    // oil and coolant
    [['OIL', S.oil], ['H2O', S.cool]].forEach((r, i) => {
        const ry = y + 196 + i * 24, zg = L.tempGauge(r[1], { cold: S1, ok: S0, hot: S0 }, S2, 0.3);
        T(cv, r[0], x, ry + 18, 16);
        bar(cv, x + 50, ry + 2, lw * 0.45, 16, zg.on ? zg.pos : 0, 16);
        T(cv, L.tempText(r[1]), x + 60 + lw * 0.45, ry + 18, 16, zg.zone === 'hot' ? S0 : S1);
    });
    road(cv, g, x, y + 246, lw, h - 246, now, S.mph);
    if (!gm) return;
    // the right: the g-meter target, the peaks, TIME
    const rx = x + lw + 24, rw = w - lw - 24, r = Math.min(62, rw / 2 - 20), cx = rx + rw / 2, cy = y + 14 + r;
    box(cv, rx, y, rw, h);
    cv.fillRect(cx - r, cy, 2 * r, 2, S2); cv.fillRect(cx, cy - r, 2, 2 * r, S2);
    cv.arc(cx, cy, r - 2, r, 0, 360, S1); cv.arc(cx, cy, r / 2 - 1, r / 2 + 1, 0, 360, S2);
    const max = S.gMax, lat = G.smooth('gs-pk-lat', S.gLat, 12), lon = G.smooth('gs-pk-lon', S.gLong, 12);
    if (isNum(lat) && isNum(lon)) {
        const q = [cx + clamp(lat / max, -1.05, 1.05) * r, cy - clamp(lon / max, -1.05, 1.05) * r];
        cv.fillRect(Math.round(q[0] / 4) * 4 - 6, Math.round(q[1] / 4) * 4 - 6, 12, 12, S0);
    }
    const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
    [['G', tot == null ? '-.--' : tot.toFixed(2)], ['ACC', S.peak.acc.toFixed(2)], ['BRK', S.peak.brk.toFixed(2)], ['LAT', S.peak.lat.toFixed(2)]].forEach((p2, i) => {
        const yy = cy + r + 30 + i * 25;
        T(cv, p2[0], rx + 14, yy, 16, S1); T(cv, p2[1], rx + rw - 14, yy, 16, S0, { align: 'right' });
    });
    T(cv, 'TIME', rx + 14, y + h - 14, 16, S1);
    T(cv, L.clock(S.session), rx + rw - 14, y + h - 14, 16, S0, { align: 'right' });
    L.sessionTap(cv, S, rx, y + h - 40, rw, 40, S0, 0);
}

module.exports = {
    id: 'pocket',
    name: 'Pocket',
    blurb: 'A pocket game console: a green dot-matrix screen, a cross pad, a little car on the road',
    palette,
    ui: {
        txt: FONT, num: FONT, size: 18, spacing: 1, upper: true, radius: 6, nameFont: FONT, nameSize: 24,
        numText: (cv, s, x, y, size, c, o) => {
            o = o || {};
            if (size < 40) return cv.text(String(s), x, y, size, c, Object.assign({ font: FONT, literal: true }, o));
            const u = numCell(size);
            return P.text(cv, String(s), x, y - 7 * u, u, c, { align: o.align });
        },
        numWidth: (cv, s, size) => (size < 40 ? cv.textWidth(String(s), size, { font: FONT, literal: true }) : P.width(String(s), numCell(size))),
    },
    badgeLetter: '#ffffff',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) {
        cv.roundRect(x, y, w, h, 8, withAlpha(on ? C.bezelHi : C.bezel, 0.9));
        cv.roundRect(x + 6, y + 6, w - 12, h - 12, 4, withAlpha(S3, on ? 0.35 : 0.22));
    },
    cardBg(cv, t, x, y, w, h) { cv.gradientRect(x, y, w, h, [[0, C.body0], [1, C.body1]]); },
    panelPlate(cv, t, x, y, w, h) { cv.roundRect(x, y, w, h, 10, C.bezel); cv.roundRect(x + 8, y + 8, w - 16, h - 16, 4, S3); },
    gButton(cv, t, r, lit, down) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rr = Math.min(r.w, r.h) / 2 - 8;
        cv.circle(cx + 2, cy + 3, rr, withAlpha('#000000', 0.25));
        cv.circle(cx, cy + (down ? 1 : 0), rr, lit ? C.btnHi : C.btn);
        const bh = 20, bw = L.badgeWidth(bh);
        L.badge(cv, cx - bw / 2, cy + bh / 2 + (down ? 1 : 0), bh, '#ffffff');
    },
    /** The gallery card: a little bezel, a green screen with a number, a cross pad and two buttons */
    swatch(cv, t, x, y, w, h) {
        const bx = x + 10, by = y + 12, bw = w - 20, bh = h * 0.62;
        cv.roundRect(bx, by, bw, bh, 8, C.bezel);
        cv.fillRect(bx + 12, by + 10, bw - 24, bh - 20, S3);
        P.text(cv, '88', bx + bw / 2, by + 10 + (bh - 20 - 28) / 2, 4, S0, { align: 'center' });
        const py = by + bh + 22, px = bx + 20;
        cv.fillRect(px - 12, py - 4, 24, 8, C.pad); cv.fillRect(px - 4, py - 12, 8, 24, C.pad);
        cv.circle(bx + bw - 34, py + 4, 7, C.btn); cv.circle(bx + bw - 14, py - 4, 7, C.btn);
    },

    panelRect(S) { const g = geo(S), w = g.lw - 32; return { x: g.lx + 16 + w * 0.66 + 24, y: g.ly + 14, w: w * 0.34 - 24, h: g.lh - 28 }; },

    draw(cv, S) {
        const now = Date.now(), g = geo(S);
        cv.blit(G.layer(['gs-pk-ctl', S.w, S.h].join('|'), S.w + 24, S.h + 12, (c) => controls(c, S.w + 24, S.h + 12, g, S), cv.textScale), S.x, S.y);
        cv.blit(G.layer(['gs-pk-bezel', g.sw, g.sh].join('|'), g.sw, g.sh + 4, (c) => bezel(c, g), cv.textScale), g.sx, g.sy);
        screen(cv, S, g, now);
        const lw = (g.lw - 32) * 0.66;
        S.zones = {
            speed: { x: g.lx + 16, y: g.ly + 84, w: lw - 200, h: 120 }, gear: { x: g.lx + 16 + lw - 170, y: g.ly + 84, w: 170, h: 138 },
            toast: { x: g.lx + lw / 2, y: g.ly + 170 }, chip: { x: g.lx + 16 + lw - 30, y: g.ly + 100 }, star: { x: g.lx + 160, y: g.ly + 38 },
        };
    },
};
