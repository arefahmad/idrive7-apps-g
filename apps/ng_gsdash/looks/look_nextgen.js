'use strict';
/**
 * Next Gen - the dash in the style of a current games console's home screen (original art in that spirit:
 * no maker's name, logo, button symbols or artwork). A deep blue background where soft bands of light
 * flow slowly across and glowing particles drift up; frosted-glass cards with round corners; the tach as
 * a thin glowing ring with the speed large in its middle; the gear in its own card; a light bar along the
 * bottom that brightens with the revs and turns amber, then red, at the shift point; and an achievement
 * card that slides in when a session peak (acceleration, braking, cornering) is beaten. Saira numerals,
 * Jost labels (open fonts the app already ships). Static parts (the sky, the cards' glass, scales) are
 * cached layers; per frame the light bands, particles, ring and readouts. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');

const { withAlpha, clamp, isNum } = L;
const NUM = 'gs_v_num', GEAR = 'gs_v_gear', TXT = 'gs_h_txt';
const C = {
    sky0: '#00031f', sky1: '#001052', sky2: '#0a3a9e', band: '#3d8bff', band2: '#8fd0ff', white: '#ffffff', ink: '#f4f7ff',
    dim: '#9fb0d8', faint: '#3a4f8c', glass: '#0b1a4a', edge: '#ffffff', blue: '#2f7bff', ice: '#9fdcff', amber: '#ffb03a', red: '#ff4646', gold: '#ffd76a',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'Next Gen',
    bg: C.sky0, panelTop: '#0d1d52', panelBottom: '#06102e', panelEdge: '#2a3f7a',
    track: '#1a2a60', tick: C.faint, text: C.ink, dim: C.dim,
    accent: C.ice, accent2: C.blue, ok: C.ice, warn: C.amber, crit: C.red, cold: C.blue,
    stripes: [C.white, C.ice, C.blue], sel: C.white, selText: C.sky0, marker: C.ice,
});
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col || C.ink, Object.assign({ font: NUM, spacing: 0, literal: true }, o || {}));
const lbl = (cv, s, x, y, col, o) => cv.text(s, x, y, 15, col || C.dim, Object.assign({ font: TXT, spacing: 2, literal: true }, o || {}));
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------------- the background: flowing light and drifting particles ---------------- */
function sky(c, w, h) {
    c.gradientRect(0, 0, w, h, [[0, C.sky0], [0.55, C.sky1], [1, C.sky2]]);
    for (let i = 14; i >= 1; i--) { const f = i / 14; c.circle(w * 0.7, h * 1.05, 700 * f, withAlpha('#1f6bff', 0.05 * (1 - f) * 2.2)); }
}
/** one band of light: a soft wave across the page (several thin layers, the middle brightest) */
function band(cv, w, h, ts, k) {
    const amp = 40 + 26 * k, y0 = h * (0.45 + 0.13 * k), sp = 0.08 + 0.05 * k, fr = 0.0028 + 0.0011 * k;
    for (let layer = 0; layer < 5; layer++) {
        const off = (layer - 2) * 6, pts = [];
        for (let x = -20; x <= w + 20; x += 40) {
            const y = y0 + off + Math.sin(x * fr + ts * sp * 6.28 + k * 1.7) * amp + Math.sin(x * fr * 2.3 - ts * sp * 4 + k) * amp * 0.35;
            pts.push([x, y]);
        }
        cv.polyline(pts, 3 + (2 - Math.abs(layer - 2)) * 2, withAlpha(k % 2 ? C.band2 : C.band, 0.07 + 0.08 * (2 - Math.abs(layer - 2))));
    }
}
function particles(cv, w, h, ts) {
    for (let i = 0; i < 34; i++) {
        const sp = 8 + rnd(i, 1) * 18, life = ((ts * sp + rnd(i, 2) * h) % (h + 40)) / (h + 40);
        const x = rnd(i, 3) * w + Math.sin(ts * 0.6 + i) * 14, y = h + 20 - life * (h + 40), r = 1.5 + rnd(i, 4) * 3.5;
        const a = 0.12 + 0.3 * rnd(i, 5) * Math.sin(life * 3.1416);
        cv.circle(x, y, r * 2.6, withAlpha(C.band2, a * 0.25)); cv.circle(x, y, r, withAlpha(C.white, a));
    }
}
function background(cv, t, reach) {
    const ts = Date.now() / 1000;
    cv.blit(G.layer('gs-ng-sky|' + reach, 1600, reach, (c) => sky(c, 1600, reach)), 0, 0);
    for (let k = 0; k < 3; k++) band(cv, 1600, reach, ts, k);
    particles(cv, 1600, reach, ts);
}

/* ---------------- frosted cards ---------------- */
/** a frosted-glass card: a soft shadow, a translucent body, a faint top light and a hairline edge */
function glass(cv, x, y, w, h, r, edge) {
    cv.roundRect(x + 3, y + 8, w, h, r, withAlpha('#000010', 0.28));
    cv.roundRect(x, y, w, h, r, withAlpha(C.glass, 0.62));
    cv.card(x, y, w, h * 0.5, r, [[0, withAlpha('#ffffff', 0.10)], [1, withAlpha('#ffffff', 0)]]);
    cv.strokeRoundRect(x, y, w, h, r, 1, edge || withAlpha(C.edge, 0.22));
}
function geo(S) {
    const top = S.y + 8, bottom = S.y + S.h - 30, x0 = S.x + 8;
    return { top, bottom, x0, tw: 560, gx: x0 + 576, gw: 300, rx: x0 + 576 + 316, r1: S.x + S.w - 8 };
}
const A0 = -140, A1 = 140;
/** the tach: a thin ring and its glow, ticks, the speed big in the middle, the rpm under it */
function ring(cv, S, g) {
    const x = g.x0, y = g.top, w = g.tw, h = g.bottom - g.top, cx = x + w / 2, cy = y + h / 2 + 12, r = Math.min(w, h) / 2 - 40;
    cv.blit(G.layer(['gs-ng-ringc', w, h, S.maxRpm, S.redline].join('|'), w + 20, h + 20, (c) => {
        glass(c, 10, 2, w, h, 26);
        const cx2 = w / 2 + 10, cy2 = h / 2 + 14, A = (v) => A0 + (A1 - A0) * clamp(v / S.maxRpm, 0, 1);
        c.arc(cx2, cy2, r - 3, r + 3, A0, A1, withAlpha('#ffffff', 0.10), { round: true });
        c.arc(cx2, cy2, r - 3, r + 3, A(S.redline), A1, withAlpha(C.red, 0.35), { round: true });
        for (let v = 0; v <= S.maxRpm; v += 1000) {
            const a = A(v), p = L.pt(cx2, cy2, r - 30, a);
            L.tick(c, cx2, cy2, r - 16, r - 9, a, 2, v >= S.redline ? C.red : withAlpha('#ffffff', 0.7));
            c.text(String(v / 1000), p[0], p[1] + 8, 22, v >= S.redline ? C.red : C.dim, { font: NUM, align: 'center', literal: true });
        }
    }, cv.textScale), x - 10, y - 2);
    const A = (v) => A0 + (A1 - A0) * clamp(v / S.maxRpm, 0, 1), lo = S.shift - S.range;
    if (isNum(S.rpm)) {
        const rpm = G.smooth('gs-ng-rpm', S.rpm, 14), a = A(rpm), col = S.strobe ? (S.blink ? C.red : withAlpha(C.red, 0.4)) : rpm >= S.shift ? C.red : rpm >= lo ? C.amber : null;
        if (a > A0 + 0.5) {
            cv.arc(cx, cy, r - 12, r + 12, A0, a, withAlpha(col || C.blue, 0.16), { round: true });
            if (col) cv.arc(cx, cy, r - 3, r + 3, A0, a, col, { round: true });
            else cv.arc(cx, cy, r - 3, r + 3, A0, a, C.ice, { round: true, ramp: [C.blue, C.ice, C.white], rampFrom: A0, rampTo: A(lo) });
            const p = L.pt(cx, cy, r, a);
            cv.circle(p[0], p[1], 12, withAlpha(col || C.ice, 0.25)); cv.circle(p[0], p[1], 5, C.white);
        }
    }
    const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--';
    T(cv, sp, cx, cy + 46, sp.length > 2 ? 120 : 140, C.white, { align: 'center' });
    lbl(cv, (S.unit || 'mph').toLowerCase(), cx, cy + 82, C.dim, { align: 'center', spacing: 4 });
    T(cv, L.rpmText(S.rpm) + ' rpm', cx, cy + r - 6, 22, S.strobe ? C.red : isNum(S.rpm) && S.rpm >= lo ? C.amber : C.ice, { align: 'center' });
    return { cx, cy };
}
function gearCard(cv, S, g) {
    const x = g.gx, y = g.top, w = g.gw, h = 250;
    cv.blit(G.layer(['gs-ng-gc', w, h].join('|'), w + 10, h + 12, (c) => glass(c, 0, 0, w, h, 22), cv.textScale), x, y);
    lbl(cv, 'Gear', x + 22, y + 32);
    const hot = isNum(S.rpm) && S.rpm >= S.shift - S.range;
    const gs = L.gearFit(cv, S.gearText, 150, w - 60, { font: GEAR, spacing: 0 });
    T(cv, S.gearText, x + w / 2, y + 62 + (h - 62) / 2 + gs * 0.36 - 10, gs, S.strobe ? (S.blink ? C.red : C.white) : hot ? C.amber : C.white, { font: GEAR, align: 'center' });
    if (S.guessed) lbl(cv, 'est.', x + w - 22, y + 32, C.dim, { align: 'right' });
    if (S.mode) {
        const tw = cv.textWidth(S.mode, 14, { font: TXT, spacing: 2, literal: true }), mc = S.modeTone === 'sport+' || S.modeTone === 'track' ? C.red : S.modeTone === 'sport' ? C.amber : C.ice;
        cv.roundRect(x + w - tw - 46, y + h - 44, tw + 28, 28, 14, withAlpha(mc, 0.18));
        cv.text(S.mode, x + w - 32, y + h - 25, 14, mc, { font: TXT, spacing: 2, align: 'right', literal: true });
    }
    return { x, y, w, h };
}
function fluids(cv, S, g) {
    const x = g.gx, y = g.top + 264, w = g.gw, h = g.bottom - y;
    cv.blit(G.layer(['gs-ng-fc', w, h].join('|'), w + 10, h + 12, (c) => glass(c, 0, 0, w, h, 22), cv.textScale), x, y);
    [['Oil', S.oil], ['Coolant', S.cool]].forEach((r, i) => {
        const ry = y + 34 + i * 58, zg = L.tempGauge(r[1], { cold: C.blue, ok: C.ice, hot: C.red }, '#1a2a60', 0.35);
        lbl(cv, r[0], x + 22, ry);
        T(cv, L.tempText(r[1]), x + w - 22, ry + 2, 26, zg.zone === 'hot' ? C.red : C.white, { align: 'right' });
        cv.roundRect(x + 22, ry + 14, w - 44, 6, 3, withAlpha('#ffffff', 0.12));
        if (zg.on) cv.roundRect(x + 22, ry + 14, Math.max(6, (w - 44) * zg.pos), 6, 3, zg.on);
    });
}
/** the light bar along the bottom: soft blue, brighter with the revs, amber then red at the shift point */
function lightBar(cv, S, g) {
    const y = S.y + S.h - 14, x0 = S.x + 160, x1 = S.x + S.w - 160, lo = S.shift - S.range;
    const rpm = isNum(S.rpm) ? S.rpm : 0, k = clamp(rpm / Math.max(1, S.shift), 0.15, 1);
    const col = S.strobe ? (S.blink ? C.red : withAlpha(C.red, 0.3)) : rpm >= S.shift ? C.red : rpm >= lo ? C.amber : C.ice;
    for (let i = 6; i >= 1; i--) cv.roundRect(x0 - i * 3, y - i * 2, x1 - x0 + i * 6, 4 + i * 4, 2 + i * 2, withAlpha(col, 0.03 * k));
    cv.roundRect(x0, y, x1 - x0, 4, 2, withAlpha(col, 0.35 + 0.6 * k));
}
/* the achievement card: when a session peak is beaten (by 0.03 g or more), for ACH_MS */
const ACH_MS = 4200, ACH = { acc: 0, brk: 0, lat: 0, shown: null, at: 0, started: false };
function achievement(cv, S, g, now) {
    const p = S.peak || {}, names = { acc: 'Launch', brk: 'Hard stop', lat: 'Cornering' };
    if (!ACH.started) { ACH.acc = p.acc || 0; ACH.brk = p.brk || 0; ACH.lat = p.lat || 0; ACH.started = true; }
    ['acc', 'brk', 'lat'].forEach((k) => {
        const v = Number(p[k]) || 0;
        if (v < ACH[k] - 0.2) ACH[k] = v;                      // the peaks were reset
        if (v >= ACH[k] + 0.03 && v >= 0.3) { ACH[k] = v; ACH.shown = { name: names[k], v }; ACH.at = now; }
    });
    if (!ACH.shown || now - ACH.at > ACH_MS) return;
    const t = (now - ACH.at) / ACH_MS, slide = t < 0.1 ? t / 0.1 : t > 0.88 ? (1 - t) / 0.12 : 1;
    const w = 380, h = 74, x = g.r1 - w - 6, y = S.y + 10 - (1 - slide) * 90;
    cv.roundRect(x, y, w, h, 18, withAlpha('#06102e', 0.94));
    glass(cv, x, y, w, h, 18, withAlpha(C.gold, 0.6));
    cv.circle(x + 38, y + h / 2, 22, withAlpha(C.gold, 0.22));
    // a small cup: a bowl, a stem, a base
    cv.quad([[x + 26, y + 24], [x + 50, y + 24], [x + 45, y + 40], [x + 31, y + 40]], C.gold);
    cv.fillRect(x + 36, y + 40, 4, 7, C.gold); cv.fillRect(x + 30, y + 47, 16, 4, C.gold);
    cv.text('Achievement unlocked', x + 74, y + 30, 15, C.gold, { font: TXT, spacing: 1, literal: true });
    cv.text(ACH.shown.name + ' - ' + ACH.shown.v.toFixed(2) + ' g', x + 74, y + 56, 22, C.white, { font: TXT, spacing: 0, literal: true });
}
function gPanel(cv, S, g) {
    const x = g.rx, y = g.top, w = g.r1 - g.rx, h = g.bottom - g.top;
    cv.blit(G.layer(['gs-ng-gp', w, h].join('|'), w + 10, h + 12, (c) => glass(c, 0, 0, w, h, 26), cv.textScale), x, y);
    lbl(cv, 'G-force', x + 24, y + 34);
    const r = 104, cx = x + 34 + r, cy = y + 60 + r, max = S.gMax;
    cv.blit(G.layer(['gs-ng-gm', r, max].join('|'), 2 * r + 20, 2 * r + 20, (c) => {
        const ox = r + 10, oy = r + 10;
        for (let q = 0.5; q <= max + 1e-6; q += 0.5) { const rr = q / max * r; c.arc(ox, oy, rr - 0.6, rr + 0.6, 0, 360, withAlpha('#ffffff', q % 1 === 0 ? 0.28 : 0.12)); }
        c.fillRect(ox - r, oy - 0.5, 2 * r, 1, withAlpha('#ffffff', 0.12)); c.fillRect(ox - 0.5, oy - r, 1, 2 * r, withAlpha('#ffffff', 0.12));
    }, cv.textScale), cx - r - 10, cy - r - 10);
    const P = (lat, lon) => [cx + clamp(lat / max, -1.05, 1.05) * r, cy - clamp(lon / max, -1.05, 1.05) * r];
    S.trail.forEach((p, i) => { if (isNum(p[0]) && isNum(p[1])) { const q = P(p[0], p[1]); cv.circle(q[0], q[1], 2, withAlpha(C.ice, 0.08 + 0.4 * i / S.trail.length)); } });
    const lat = G.smooth('gs-ng-lat', S.gLat, 12), lon = G.smooth('gs-ng-lon', S.gLong, 12);
    if (isNum(lat) && isNum(lon)) { const q = P(lat, lon); cv.circle(q[0], q[1], 16, withAlpha(C.ice, 0.18)); cv.circle(q[0], q[1], 7, C.white); }
    const tx = cx + r + 40, tw = x + w - 24 - tx;
    const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
    [['Now', tot == null ? '-.--' : tot.toFixed(2), C.white], ['Accel', S.peak.acc.toFixed(2), C.ice], ['Brake', S.peak.brk.toFixed(2), C.amber], ['Lateral', S.peak.lat.toFixed(2), C.ice]].forEach((p, i) => {
        const yy = y + 76 + i * 56;
        lbl(cv, p[0], tx, yy);
        T(cv, p[1], tx + tw, yy + 2, 30, p[2], { align: 'right' });
        cv.fillRect(tx, yy + 18, tw, 1, withAlpha('#ffffff', 0.12));
    });
    lbl(cv, 'Session', x + 24, y + h - 26);
    T(cv, L.clock(S.session), x + w - 24, y + h - 22, 28, C.white, { align: 'right' });
    L.sessionTap(cv, S, x + 10, y + h - 54, w - 20, 50, C.ice, 14);
}

module.exports = {
    id: 'nextgen',
    name: 'Next Gen',
    blurb: 'A games-console home screen: flowing light, frosted cards, a light bar, achievements',
    palette,
    ui: { txt: TXT, num: NUM, size: 18, spacing: 1, upper: false, radius: 16, nameFont: TXT, nameSize: 30 },
    badgeLetter: '#ffffff',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) { glass(cv, x, y, w, h, 16, on ? withAlpha(C.white, 0.9) : null); },
    cardBg(cv, t, x, y, w, h) {
        cv.gradientRect(x, y, w, h, [[0, C.sky0], [0.6, C.sky1], [1, C.sky2]]);
        for (let k = 0; k < 2; k++) {
            const pts = [];
            for (let i = 0; i <= 12; i++) pts.push([x + w * i / 12, y + h * (0.55 + 0.1 * k) + Math.sin(i * 0.7 + k * 2) * h * 0.06]);
            cv.polyline(pts, 3, withAlpha(k ? C.band2 : C.band, 0.35));
        }
    },
    panelPlate(cv, t, x, y, w, h) { glass(cv, x, y, w, h, 22); },
    gButton(cv, t, r, lit, down) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rr = Math.min(r.w, r.h) / 2 - 8;
        cv.circle(cx, cy, rr + 6, withAlpha(C.ice, lit || down ? 0.25 : 0.1));
        cv.circle(cx, cy, rr, withAlpha(C.glass, down ? 0.7 : 0.85));
        cv.arc(cx, cy, rr - 1, rr + 0.5, 0, 360, withAlpha('#ffffff', lit || down ? 0.9 : 0.35));
        const h = 22, bw = L.badgeWidth(h);
        L.badge(cv, cx - bw / 2, cy + h / 2, h, '#ffffff');
    },
    /** The gallery card: a frosted card with a glowing ring and a number */
    swatch(cv, t, x, y, w, h) {
        const cx = x + w / 2, cy = y + h * 0.55, r = Math.min(w, h) * 0.36;
        cv.roundRect(x + 10, y + 12, w - 20, h - 16, 14, withAlpha(C.glass, 0.6));
        cv.strokeRoundRect(x + 10, y + 12, w - 20, h - 16, 14, 1, withAlpha('#ffffff', 0.25));
        cv.arc(cx, cy, r - 2, r + 2, A0, A1, withAlpha('#ffffff', 0.12), { round: true });
        cv.arc(cx, cy, r - 2, r + 2, A0, 40, C.ice, { round: true, ramp: [C.blue, C.ice, C.white], rampFrom: A0, rampTo: 40 });
        T(cv, '88', cx, cy + 12, Math.round(r * 0.8), C.white, { align: 'center' });
    },

    panelRect(S) { const g = geo(S); return { x: g.rx + 14, y: g.top + 14, w: g.r1 - g.rx - 28, h: g.bottom - g.top - 28 }; },

    draw(cv, S) {
        const now = Date.now(), g = geo(S);
        ring(cv, S, g);
        const gc = gearCard(cv, S, g);
        fluids(cv, S, g);
        lightBar(cv, S, g);
        S.zones = {
            speed: { x: g.x0 + 130, y: g.top + 140, w: 300, h: 160 }, gear: { x: gc.x + 20, y: gc.y + 50, w: gc.w - 40, h: gc.h - 70 },
            toast: { x: g.x0 + g.tw / 2, y: g.top + 300 }, chip: { x: gc.x + gc.w - 30, y: gc.y + 60 }, star: { x: gc.x + 90, y: gc.y + 32 },
        };
        if (!S.panel || S.panel === 'g') gPanel(cv, S, g);
        achievement(cv, S, g, now);
    },
};
