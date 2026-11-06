'use strict';
/**
 * Desktop '98 - the dash as a late-90s desktop (original art, in the spirit of that era's computers: no
 * maker's name, logo or artwork). A teal desktop; grey bevelled windows with navy gradient title bars and
 * little title buttons; the speed in a sunken white field in big pixel numerals; the rpm as a block
 * progress bar ("Revving..."), and past the shift point a warning dialog pops up; the gear in its own
 * window with the drive mode as radio buttons; oil and coolant as progress bars; a black performance-
 * monitor g-meter with a green grid and a list of peaks; a taskbar along the bottom with a G button, the
 * open windows and the time in its tray. The G's Dash pixel font (px.js, also the Pixel look's).
 * Static parts (windows, bevels, scales) are cached layers. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');
const P = require('./px');
const CLOCK = new (require('./clock').Clock)();

const { withAlpha, clamp, isNum } = L;
const FONT = 'gs_p_px';
const C = {
    desk: '#008080', face: '#c0c0c0', hi: '#ffffff', light: '#dfdfdf', shadow: '#808080', dark: '#000000',
    title0: '#000080', title1: '#1084d0', text: '#000000', white: '#ffffff', navy: '#000080', field: '#ffffff',
    amber: '#c08000', red: '#c00000', green: '#00ff00', grid: '#008000', teal: '#008080', yellow: '#ffff00',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: "Desktop '98",
    bg: C.desk, panelTop: C.face, panelBottom: C.face, panelEdge: C.shadow,
    track: C.shadow, tick: C.shadow, text: C.white, dim: '#d8f0f0',
    accent: C.yellow, accent2: C.title1, ok: C.white, warn: C.yellow, crit: '#ff5050', cold: '#80c0ff',
    stripes: [C.title1, C.white, C.yellow], sel: C.yellow, selText: C.dark, marker: C.yellow,
});
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col || C.text, Object.assign({ font: FONT, literal: true }, o || {}));
const numCell = (size) => Math.max(2, Math.round(size / 9));

/* ---------------- the toolkit: bevels, windows, fields, bars ---------------- */
/** a raised (out) or sunken (in) bevel, two pixels deep */
function bevel(cv, x, y, w, h, out) {
    const a = out ? C.hi : C.shadow, b = out ? C.dark : C.hi, a2 = out ? C.light : C.dark, b2 = out ? C.shadow : C.light;
    cv.fillRect(x, y, w, 1, a); cv.fillRect(x, y, 1, h, a);
    cv.fillRect(x, y + h - 1, w, 1, b); cv.fillRect(x + w - 1, y, 1, h, b);
    cv.fillRect(x + 1, y + 1, w - 2, 1, a2); cv.fillRect(x + 1, y + 1, 1, h - 2, a2);
    cv.fillRect(x + 1, y + h - 2, w - 2, 1, b2); cv.fillRect(x + w - 2, y + 1, 1, h - 2, b2);
}
function button(cv, x, y, w, h, down) { cv.fillRect(x, y, w, h, C.face); bevel(cv, x, y, w, h, !down); }
/** a window: frame, title bar (gradient, title, the three little buttons), the client area; cached */
function windowFrame(c, w, h, title, active) {
    c.fillRect(0, 0, w, h, C.face);
    bevel(c, 0, 0, w, h, true);
    const tb = 26;
    c.gradientRect(4, 4, w - 8, tb, [[0, active ? C.title0 : '#808080'], [1, active ? C.title1 : '#b5b5b5']]);
    // a little window icon, then the title
    c.fillRect(9, 9, 16, 16, C.face); bevel(c, 9, 9, 16, 16, true); c.fillRect(12, 12, 10, 3, C.title0);
    T(c, title, 32, 23, 16, active ? C.white : '#d4d0c8');
    // minimise, maximise, close
    const bx = w - 4 - 3 * 22 - 2;
    [0, 1, 2].forEach((i) => {
        const x = bx + i * 22 + (i === 2 ? 2 : 0), y = 7;
        button(c, x, y, 20, 18, false);
        if (i === 0) c.fillRect(x + 5, y + 12, 8, 2, C.dark);
        else if (i === 1) { c.fillRect(x + 5, y + 4, 10, 2, C.dark); c.fillRect(x + 5, y + 4, 1, 9, C.dark); c.fillRect(x + 14, y + 4, 1, 9, C.dark); c.fillRect(x + 5, y + 12, 10, 1, C.dark); }
        else { c.line(x + 6, y + 5, x + 14, y + 13, 2, C.dark); c.line(x + 14, y + 5, x + 6, y + 13, 2, C.dark); }
    });
    return tb;
}
function win(cv, key, x, y, w, h, title, active) {
    cv.blit(G.layer(['gs-dk-win', key, w, h, title, active ? 1 : 0].join('|'), w, h, (c) => windowFrame(c, w, h, title, active), cv.textScale), x, y);
    return { x: x + 8, y: y + 36, w: w - 16, h: h - 44 };      // the client area
}
/** a sunken field (white, or another colour) */
function field(cv, x, y, w, h, col) { cv.fillRect(x, y, w, h, col || C.field); bevel(cv, x, y, w, h, false); }
/** a group box: an etched frame with its label breaking the top line */
function group(cv, x, y, w, h, label) {
    cv.strokeRoundRect(x, y, w, h, 0, 1, C.shadow);
    cv.strokeRoundRect(x + 1, y + 1, w, h, 0, 1, C.hi);
    const lw = cv.textWidth(label, 16, { font: FONT, literal: true });
    cv.fillRect(x + 8, y - 6, lw + 8, 12, C.face);
    T(cv, label, x + 12, y + 6, 16);
}
/** a block progress bar: k (0..1) of n blocks lit, each block's colour from col(i / n) */
function blocks(cv, x, y, w, h, k, col) {
    field(cv, x, y, w, h, C.field);
    const bw = 12, gap = 2, n = Math.floor((w - 6 + gap) / (bw + gap)), lit = Math.round(clamp(k, 0, 1) * n);
    for (let i = 0; i < lit; i++) cv.fillRect(x + 3 + i * (bw + gap), y + 3, bw, h - 6, col(i / n));
    return n;
}
/** a radio button with its label */
function radio(cv, x, y, label, on) {
    cv.circle(x + 7, y + 7, 7, C.shadow); cv.circle(x + 7.5, y + 7.5, 6.5, C.hi); cv.circle(x + 7, y + 7, 5.5, C.white);
    if (on) cv.circle(x + 7, y + 7, 2.5, C.dark);
    T(cv, label, x + 22, y + 13, 16);
}
/** the classic warning icon: a yellow triangle with a black ! */
function warnIcon(cv, x, y, s) {
    cv.quad([[x + s / 2, y], [x + s, y + s], [x, y + s], [x + s / 2, y]], C.dark);
    cv.quad([[x + s / 2, y + 3], [x + s - 3, y + s - 2], [x + 3, y + s - 2], [x + s / 2, y + 3]], C.yellow);
    cv.fillRect(x + s / 2 - 1.5, y + s * 0.32, 3, s * 0.36, C.dark); cv.fillRect(x + s / 2 - 1.5, y + s * 0.76, 3, 3, C.dark);
}
/** the desktop: teal, a faint dither, a few icons down the left (their labels in white) */
function desktop(c, w, h) {
    c.fillRect(0, 0, w, h, C.desk);
    for (let y = 0; y < h; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < w; x += 4) c.fillRect(x, y, 1, 1, withAlpha('#000000', 0.06));
}
function background(cv, t, reach) {
    cv.blit(G.layer('gs-dk-desk|' + reach, 1600, reach, (c) => desktop(c, 1600, reach)), 0, 0);
}

/* ---------------- the dash ---------------- */
const rpmCol = (S) => (f) => {
    const v = f * S.maxRpm, lo = S.shift - S.range;
    return v >= S.shift ? C.red : v >= lo ? C.amber : C.navy;
};
function geo(S) {
    const x0 = S.x + 10, top = S.y + 6, bar = 36, bottom = S.y + S.h - bar - 6;
    return { x0, top, bottom, bar, w1: 690, w2: 290, rx: S.x + 1010, r1: S.x + S.w - 6 };
}
function engine(cv, S, g) {
    const lo = S.shift - S.range, ca = win(cv, 'eng', g.x0, g.top, g.w1, 250, 'Engine Monitor', true);
    // the speed: a sunken white field, big pixel numerals
    const fw = 300, fh = 150;
    field(cv, ca.x + 6, ca.y + 8, fw, fh);
    const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--', u = sp.length > 2 ? 12 : 14;
    P.text(cv, sp, ca.x + 6 + fw - 18, ca.y + 8 + (fh - 7 * u) / 2 - 6, u, C.dark, { align: 'right' });
    T(cv, (S.unit || 'MPH').toLowerCase(), ca.x + 14, ca.y + fh - 2, 16, C.shadow);
    // the rpm: a group box with the number and the scale
    const gx = ca.x + fw + 22, gw = ca.w - fw - 28;
    group(cv, gx, ca.y + 14, gw, fh - 6, 'Engine speed');
    const strobe = S.strobe, hot = isNum(S.rpm) && S.rpm >= lo;
    P.text(cv, L.rpmText(S.rpm), gx + gw - 18, ca.y + 46, 6, strobe && S.blink ? C.red : C.dark, { align: 'right' });
    T(cv, 'rpm', gx + 16, ca.y + 82, 16, C.shadow);
    T(cv, strobe ? 'Shift now!' : hot ? 'Almost there...' : isNum(S.rpm) && S.rpm > 1200 ? 'Revving...' : 'Idle', gx + 16, ca.y + 126, 16, strobe ? C.red : C.dark);
    // the progress bar under both, its scale over it
    const by = ca.y + fh + 30, bw = ca.w - 12;
    for (let v = 0; v <= S.maxRpm; v += 1000) { const x = ca.x + 6 + 3 + (bw - 6) * v / S.maxRpm; cv.fillRect(x, by - 8, 1, 5, C.shadow); T(cv, String(v / 1000), x, by - 11, 16, v >= S.redline ? C.red : C.dark, { align: 'center' }); }
    const rpm = isNum(S.rpm) ? G.smooth('gs-dk-rpm', S.rpm, 14) : 0;
    blocks(cv, ca.x + 6, by, bw, 26, rpm / S.maxRpm, rpmCol(S));
}
function gearWin(cv, S, g) {
    const x = g.x0 + g.w1 + 12, ca = win(cv, 'gear', x, g.top, g.w2, 250, 'Gear', false);
    field(cv, ca.x + 6, ca.y + 8, ca.w - 12, 88);
    let u = 11; while (u > 4 && P.width(S.gearText, u) > ca.w - 40) u--;
    P.text(cv, S.gearText, ca.x + ca.w / 2, ca.y + 8 + (88 - 7 * u) / 2, u, S.strobe && S.blink ? C.red : C.dark, { align: 'center' });
    if (S.guessed) T(cv, '(estimated)', ca.x + ca.w - 12, ca.y + 90, 16, C.shadow, { align: 'right' });
    // the drive mode as radio buttons
    group(cv, ca.x + 6, ca.y + 110, ca.w - 12, ca.h - 114, 'Drive mode');
    const tone = S.modeTone, pick = !S.mode ? -1 : tone === 'sport+' || tone === 'track' ? 2 : tone === 'sport' ? 1 : 0;
    ['Comfort', 'Sport', 'Sport+'].forEach((m, i) => radio(cv, ca.x + 22, ca.y + 124 + i * 24, m, i === pick));
    return { x, w: g.w2 };
}
function temps(cv, S, g) {
    const y = g.top + 262, ca = win(cv, 'temps', g.x0, y, g.w1 + 12 + g.w2, g.bottom - y, 'Temperatures', false);
    [['Oil', S.oil], ['Coolant', S.cool]].forEach((r, i) => {
        const ry = ca.y + 8 + i * 40, v = r[1], zg = L.tempGauge(v, { cold: '#0000c0', ok: C.navy, hot: C.red }, C.shadow, 0.35);
        T(cv, r[0] + ':', ca.x + 8, ry + 20, 16);
        blocks(cv, ca.x + 110, ry, ca.w - 270, 26, zg.on ? zg.pos : 0, () => (zg.on || C.navy));
        field(cv, ca.x + ca.w - 150, ry, 142, 26);
        T(cv, L.tempText(v), ca.x + ca.w - 16, ry + 20, 16, zg.zone === 'hot' ? C.red : C.dark, { align: 'right' });
    });
}
/** the performance monitor: a black plot, a green grid, the g as a cross and its trail */
function perf(cv, S, ca) {
    const pw = 236, x = ca.x + 6, y = ca.y + 8, cx = x + pw / 2, cy = y + pw / 2, r = pw / 2 - 12, max = S.gMax;
    cv.blit(G.layer(['gs-dk-perf', pw, max].join('|'), pw, pw, (c) => {
        c.fillRect(0, 0, pw, pw, C.dark); bevel(c, 0, 0, pw, pw, false);
        for (let k = 1; k < 8; k++) { c.fillRect(2 + (pw - 4) * k / 8, 2, 1, pw - 4, C.grid); c.fillRect(2, 2 + (pw - 4) * k / 8, pw - 4, 1, C.grid); }
        c.fillRect(pw / 2, 2, 1, pw - 4, '#00c000'); c.fillRect(2, pw / 2, pw - 4, 1, '#00c000');
        for (let q = 0.5; q <= max + 1e-6; q += 0.5) { const rr = q / max * (pw / 2 - 12); c.arc(pw / 2, pw / 2, rr - 0.5, rr + 0.5, 0, 360, withAlpha(C.green, q % 1 === 0 ? 0.6 : 0.3)); }
    }, cv.textScale), x, y);
    const Pt = (lat, lon) => [cx + clamp(lat / max, -1.05, 1.05) * r, cy - clamp(lon / max, -1.05, 1.05) * r];
    const tr = S.trail.filter((p) => isNum(p[0]) && isNum(p[1])).map((p) => Pt(p[0], p[1]));
    if (tr.length > 1) cv.polyline(tr, 1.5, withAlpha(C.green, 0.55));
    const lat = G.smooth('gs-dk-lat', S.gLat, 12), lon = G.smooth('gs-dk-lon', S.gLong, 12);
    if (isNum(lat) && isNum(lon)) { const q = Pt(lat, lon); cv.fillRect(q[0] - 7, q[1] - 1, 15, 3, C.green); cv.fillRect(q[0] - 1, q[1] - 7, 3, 15, C.green); }
    return pw;
}
function gWin(cv, S, g) {
    const ca = win(cv, 'g', g.rx, g.top, g.r1 - g.rx, g.bottom - g.top, 'G-Force Monitor', false);
    const pw = perf(cv, S, ca);
    // the peaks: a list view with a header
    const lx = ca.x + pw + 20, lw = ca.x + ca.w - lx - 6;
    field(cv, lx, ca.y + 8, lw, pw);
    button(cv, lx + 2, ca.y + 10, lw * 0.6, 24, false); button(cv, lx + 2 + lw * 0.6, ca.y + 10, lw * 0.4 - 4, 24, false);
    T(cv, 'Name', lx + 10, ca.y + 28, 16); T(cv, 'g', lx + lw - 14, ca.y + 28, 16, C.dark, { align: 'right' });
    const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
    [['Now', tot == null ? '-.--' : tot.toFixed(2)], ['Accel', S.peak.acc.toFixed(2)], ['Brake', S.peak.brk.toFixed(2)], ['Lateral', S.peak.lat.toFixed(2)]].forEach((p, i) => {
        const ry = ca.y + 40 + i * 44, sel = i === 0;
        if (sel) cv.fillRect(lx + 4, ry, lw - 8, 36, C.navy);
        T(cv, p[0], lx + 12, ry + 26, 16, sel ? C.white : C.dark);
        P.text(cv, p[1], lx + lw - 14, ry + 6, 3, sel ? C.white : C.dark, { align: 'right' });
    });
    // a status bar: the session time
    const sy = ca.y + ca.h - 28;
    field(cv, ca.x + 6, sy, ca.w - 12, 26, C.face);
    T(cv, 'Uptime: ' + L.clock(S.session), ca.x + 14, sy + 19, 16);
    L.sessionTap(cv, S, ca.x + 4, sy - 2, ca.w - 8, 30, C.navy, 0);
}
/** the shift warning: a little dialog over the engine window while past the shift point */
function shiftDialog(cv, S, g) {
    const w = 300, h = 130, x = g.x0 + g.w1 - w - 30, y = g.top + 60;
    cv.fillRect(x + 6, y + 6, w, h, withAlpha('#000000', 0.35));
    const ca = win(cv, 'dlg', x, y, w, h, 'Warning', true);
    warnIcon(cv, ca.x + 10, ca.y + 6, 34);
    T(cv, 'Shift now!', ca.x + 58, ca.y + 28, 24, S.blink ? C.red : C.dark);
    button(cv, ca.x + ca.w / 2 - 40, ca.y + ca.h - 34, 80, 28, false);
    T(cv, 'OK', ca.x + ca.w / 2, ca.y + ca.h - 14, 16, C.dark, { align: 'center' });
}
/** the taskbar: the G button, the open windows, the tray with the time */
function taskbar(cv, S, g) {
    const y = S.y + S.h - g.bar, x0 = S.x - 12, w = S.w + 24, tw = 120;
    // the bar, the G button and the window buttons: a layer (the pressed button's dither is 1 px dots)
    cv.blit(G.layer(['gs-dk-task', w, g.bar].join('|'), w, g.bar, (c) => {
        const ox = S.x - x0;
        c.fillRect(0, 0, w, g.bar, C.face); c.fillRect(0, 0, w, 1, C.light); c.fillRect(0, 1, w, 1, C.hi);
        button(c, ox, 4, 150, g.bar - 8, false);
        const bh = 15, bw = L.badgeWidth(bh);
        L.badge(c, ox + 8, 4 + (g.bar - 8 + bh) / 2, bh, '#000000');
        T(c, "G's Dash", ox + 14 + bw, 24, 16);
        ['Engine Monitor', 'Gear', 'Temperatures', 'G-Force Monitor'].forEach((n, i) => {
            const bx = ox + 162 + i * 262, bw2 = 254;
            button(c, bx, 4, bw2, g.bar - 8, i === 0);
            if (i === 0) for (let yy = 6; yy < g.bar - 6; yy += 2) for (let xx = bx + 2 + (yy % 4 ? 1 : 0); xx < bx + bw2 - 2; xx += 2) c.fillRect(xx, yy, 1, 1, withAlpha(C.hi, 0.5));
            T(c, n, bx + 10, 24, 16);
        });
        field(c, ox + S.w - tw, 4, tw, g.bar - 8, C.face);
    }, cv.textScale), x0, y);
    const c = CLOCK.now();
    T(cv, c.time + ' ' + c.ampm, S.x + S.w - 10, y + 24, 16, C.dark, { align: 'right' });
}

module.exports = {
    id: 'desktop',
    name: "Desktop '98",
    blurb: 'A late-90s desktop: bevelled grey windows, progress bars, a taskbar with the time',
    palette,
    ui: {
        txt: FONT, num: FONT, size: 18, spacing: 1, upper: false, radius: 0, nameFont: FONT, nameSize: 24,
        // big numbers drawn as rects (pixel-exact), the baked atlas below 40 px
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
        cv.fillRect(x, y, w, h, withAlpha(C.face, 0.92)); bevel(cv, x, y, w, h, !on);
        if (on) cv.strokeRoundRect(x + 3, y + 3, w - 6, h - 6, 0, 1, C.dark);
    },
    cardBg(cv, t, x, y, w, h) { cv.fillRect(x, y, w, h, C.desk); },
    panelPlate(cv, t, x, y, w, h) { cv.fillRect(x, y, w, h, C.face); bevel(cv, x, y, w, h, true); },
    gButton(cv, t, r, lit, down) {
        const x = r.x + 10, y = r.y + 12, w = r.w - 20, h = r.h - 24;
        button(cv, x, y, w, h, down);
        if (lit && !down) cv.strokeRoundRect(x + 4, y + 4, w - 8, h - 8, 0, 1, C.dark);
        const bh = 22, bw = L.badgeWidth(bh);
        L.badge(cv, x + (w - bw) / 2 + (down ? 1 : 0), y + (h + bh) / 2 + (down ? 1 : 0), bh, '#000000');
    },
    /** The gallery card: a little window with a progress bar and a number */
    swatch(cv, t, x, y, w, h) {
        const wx = x + 10, wy = y + 14, ww = w - 20, wh = h - 18;
        cv.fillRect(wx, wy, ww, wh, C.face); bevel(cv, wx, wy, ww, wh, true);
        cv.gradientRect(wx + 3, wy + 3, ww - 6, 16, [[0, C.title0], [1, C.title1]]);
        button(cv, wx + ww - 19, wy + 5, 14, 12, false);
        field(cv, wx + 8, wy + 26, ww - 16, wh - 60);
        P.text(cv, '88', wx + ww / 2, wy + 26 + (wh - 60 - 35) / 2, 5, C.dark, { align: 'center' });
        field(cv, wx + 8, wy + wh - 28, ww - 16, 18);
        const n = Math.floor((ww - 22) / 9);
        for (let i = 0; i < Math.round(n * 0.62); i++) cv.fillRect(wx + 11 + i * 9, wy + wh - 25, 7, 12, i > n * 0.5 ? C.amber : C.navy);
    },

    panelRect(S) { const g = geo(S); return { x: g.rx + 8, y: g.top + 36, w: g.r1 - g.rx - 16, h: g.bottom - g.top - 44 }; },

    draw(cv, S) {
        const g = geo(S);
        engine(cv, S, g);
        const gw = gearWin(cv, S, g);
        temps(cv, S, g);
        if (S.strobe) shiftDialog(cv, S, g);
        taskbar(cv, S, g);
        S.zones = {
            speed: { x: g.x0 + 14, y: g.top + 44, w: 300, h: 150 }, gear: { x: gw.x + 14, y: g.top + 44, w: gw.w - 28, h: 88 },
            toast: { x: g.x0 + 170, y: g.top + 170 }, chip: { x: gw.x + gw.w - 30, y: g.top + 60 }, star: { x: gw.x + 60, y: g.top + 20 },
        };
        if (S.panel && S.panel !== 'g') return;
        gWin(cv, S, g);
    },
};
