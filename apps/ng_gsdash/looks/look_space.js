'use strict';
/**
 * Space - deep space behind the dash: a dark violet sky with nebula clouds and a faint Milky Way band, a
 * planet's glowing horizon rising at the bottom right, a ringed planet and a moon, and three depths of
 * stars that twinkle and drift slowly past (a little faster with the car's speed). The stars and planets
 * sway opposite to the g-force, the nearest the most, as if the car's motion moved you through them.
 * The tach is an orbit (a satellite rides it to the rpm, the speed in its middle), the gear sits on a
 * planet inside a tilted ring, the g-meter is a star chart. Saira numerals, Jost labels (open fonts).
 * Static parts (sky, planets, rings, scales) are cached layers; per frame only the stars (a few hundred
 * small marks), the lit arc and the readouts are drawn. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');

const { withAlpha, clamp, isNum } = L;
const NUM = 'gs_v_num', GEAR = 'gs_v_gear', TXT = 'gs_h_txt';
const C = {
    bg0: '#03040b', bg1: '#080b1e', bg2: '#120b2a', ink: '#eef3ff', label: '#8f9bc4', faint: '#2b3360', edge: '#26305c',
    cyan: '#4fe3ff', blue: '#5b8cff', violet: '#9b6bff', magenta: '#d65cff', shift: '#ffb547', crit: '#ff4d6a',
    gold: '#e8b86a', star: '#f4f7ff', warm: '#ffe2b8', cool: '#cfe0ff',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'Space',
    bg: C.bg0, panelTop: '#0c1030', panelBottom: '#05060f', panelEdge: C.edge,
    track: '#151a3a', tick: C.faint, text: C.ink, dim: C.label,
    accent: C.cyan, accent2: C.violet, ok: C.cyan, warn: C.shift, crit: C.crit, cold: C.blue,
    stripes: [C.cyan, C.violet, C.magenta], sel: C.cyan, selText: C.bg0, marker: C.magenta,
});
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col, Object.assign({ font: NUM, spacing: 1, literal: true }, o || {}));
const lbl = (cv, s, x, y, col, o) => cv.text(s, x, y, 15, col || C.label, Object.assign({ font: TXT, spacing: 4, literal: true }, o || {}));

/* ---------------- the sky: stars that move ---------------- */
/** a seeded generator, so the sky is the same every start */
function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; s ^= s >>> 12; return (s >>> 0) / 4294967296; }; }
const SKY_W = 1600, SKY_H = 720;          // stars wrap within this (the page is 1600 wide, at most ~700 tall)
/*
 * Three depths: d (parallax and drift factor), n stars, size range, brightness. Near stars are few, larger,
 * with a soft halo; the brightest of them carry a small four-point sparkle.
 */
const DEPTHS = [{ d: 0.25, n: 150, r: [0.55, 0.9], a: [0.25, 0.55] }, { d: 0.55, n: 70, r: [0.8, 1.3], a: [0.45, 0.8] }, { d: 1, n: 26, r: [1.2, 2.0], a: [0.75, 1] }];
const STARS = (function () {
    const R = rng(0x5ace), tints = [C.star, C.star, C.star, C.cool, C.cool, C.warm];
    return DEPTHS.map((D, k) => {
        const out = [];
        for (let i = 0; i < D.n; i++) {
            out.push({ x: R() * SKY_W, y: R() * SKY_H, r: D.r[0] + R() * (D.r[1] - D.r[0]), a: D.a[0] + R() * (D.a[1] - D.a[0]),
                tw: 0.6 + R() * 2.2, ph: R() * 6.283, c: tints[Math.floor(R() * tints.length)], sparkle: k === 2 && R() < 0.35 });
        }
        return out;
    });
}());
/* what moves the sky: the car's g-force and speed, set by draw() (the background is drawn before it) */
const MOTION = { gLat: 0, gLong: 0, mph: 0, at: 0 };
let travel = 0, lastAt = 0;
/** px the sky has drifted (the stars move left: travelling on), a little faster with speed */
function drift(now) {
    const dt = lastAt ? clamp((now - lastAt) / 1000, 0, 0.25) : 0;
    lastAt = now;
    const fresh = now - MOTION.at < 1500;
    travel += dt * (5 + (fresh && isNum(MOTION.mph) ? clamp(MOTION.mph, 0, 160) * 0.3 : 0));
    if (travel > 1e6) travel -= 1e6;
    return travel;
}
/** the sky's sway (px at depth 1) from the g-force: opposite to it, as the body is pushed; eased */
function sway(now) {
    const fresh = now - MOTION.at < 1500;
    const gx = fresh && isNum(MOTION.gLat) ? clamp(MOTION.gLat, -1.5, 1.5) : 0, gy = fresh && isNum(MOTION.gLong) ? clamp(MOTION.gLong, -1.5, 1.5) : 0;
    return [G.smooth('gs-sp-sx', -gx * 34, 3.5), G.smooth('gs-sp-sy', gy * 26, 3.5)];
}
const wrap = (v, m) => ((v % m) + m) % m;

function sky(cv, reach, now) {
    const tr = drift(now), sw = sway(now), ts = now / 1000;
    STARS.forEach((list, k) => {
        const D = DEPTHS[k], ox = sw[0] * D.d, oy = sw[1] * D.d, dx = tr * D.d;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            const x = wrap(s.x - dx + ox, SKY_W), y = wrap(s.y + oy, SKY_H);
            if (y > reach + 4) continue;
            const a = s.a * (0.62 + 0.38 * Math.sin(ts * s.tw + s.ph));
            if (k === 0) { cv.fillRect(x, y, s.r * 1.6, s.r * 1.6, withAlpha(s.c, a)); continue; }
            if (k === 2) cv.circle(x, y, s.r * 3.2, withAlpha(s.c, a * 0.13));
            cv.circle(x, y, s.r, withAlpha(s.c, a));
            if (s.sparkle) {
                const l = s.r * (3.5 + 2 * Math.sin(ts * s.tw * 0.7 + s.ph));
                cv.fillRect(x - l, y - 0.35, 2 * l, 0.7, withAlpha(s.c, a * 0.55));
                cv.fillRect(x - 0.35, y - l, 0.7, 2 * l, withAlpha(s.c, a * 0.55));
            }
        }
    });
}

/* soft round glow: concentric discs, faint to the edge (in a layer, drawn once) */
function glow(c, x, y, r, col, a, steps) {
    steps = steps || 14;
    for (let i = steps; i >= 1; i--) { const f = i / steps; c.circle(x, y, r * f, withAlpha(col, a * (1 - f) * (1 - f) * 2 / steps * 3)); }
}
/** the backdrop: the sky's colour, nebulae, the Milky Way band, a dust of static far stars */
function backdrop(c, w, h) {
    c.gradientRect(0, 0, w, h, [[0, C.bg1], [0.55, C.bg0], [1, C.bg2]]);
    glow(c, 330, 120, 420, '#5a2bd6', 0.42, 22);
    glow(c, 620, 360, 300, '#1f6fd8', 0.30, 18);
    glow(c, 1050, 180, 360, '#b0359e', 0.24, 20);
    glow(c, 1450, 330, 260, '#2b59d6', 0.22, 16);
    // the band: dust along a diagonal
    const R = rng(0xb417);
    for (let i = 0; i < 900; i++) {
        const u = R(), v = (R() + R() + R() - 1.5) * 0.55, x = u * w, y = h * 0.82 - u * h * 0.7 + v * 120;
        if (y < 0 || y > h) continue;
        c.fillRect(x, y, 1, 1, withAlpha(R() < 0.2 ? C.cool : C.star, 0.08 + R() * 0.22));
    }
    for (let i = 0; i < 220; i++) c.fillRect(R() * w, R() * h, 1, 1, withAlpha(C.star, 0.10 + R() * 0.25));
}
/** a lit sphere: body, the night side, an atmosphere rim; light from the upper left */
function sphere(c, x, y, r, body, dark, rim) {
    c.circle(x, y, r, body);
    for (let i = 0; i < 18; i++) {
        const f = i / 18;
        c.circle(x + r * 0.35 * (1 - f) + r * 0.25, y + r * 0.3 * (1 - f) + r * 0.2, r * (0.55 + 0.45 * (1 - f)), withAlpha(dark, 0.07));
    }
    c.arc(x, y, r - 1.5, r + 0.5, 0, 360, withAlpha(rim, 0.55));
    for (let i = 1; i <= 8; i++) c.arc(x, y, r, r + i * 2.2, 0, 360, withAlpha(rim, 0.09 * (1 - i / 9)));
}
/** a striped gas giant (stripes clipped to its disc by drawing chords) with a ring, tilted */
function ringed(c, x, y, r) {
    const tilt = -0.32, ring = (back) => {
        const pts = [], n = 90;
        for (let i = 0; i <= n; i++) {
            const t = (back ? Math.PI : 0) + Math.PI * i / n, rx = r * 1.9, ry = r * 0.42;
            const px = Math.cos(t) * rx, py = Math.sin(t) * ry;
            pts.push([x + px * Math.cos(tilt) - py * Math.sin(tilt), y + px * Math.sin(tilt) + py * Math.cos(tilt)]);
        }
        c.polyline(pts, 3, withAlpha(C.gold, back ? 0.35 : 0.75));
        c.polyline(pts, 1, withAlpha('#fff1d6', back ? 0.25 : 0.6));
    };
    ring(true);
    c.circle(x, y, r, '#b98a52');
    for (let k = -4; k <= 4; k++) {
        const yy = k * r / 5 + r * 0.06, half = Math.sqrt(Math.max(0, r * r - yy * yy)) - 1;
        if (half <= 0) continue;
        const h = r / 9;
        c.quad([[x - half, y + yy - h / 2], [x + half, y + yy - h / 2], [x + half, y + yy + h / 2], [x - half, y + yy + h / 2]], withAlpha(k % 2 ? '#7a4f2c' : '#e6c08a', 0.35));
    }
    for (let i = 0; i < 14; i++) { const f = i / 14; c.circle(x + r * 0.32 * (1 - f) + r * 0.2, y + r * 0.28 * (1 - f) + r * 0.15, r * (0.6 + 0.4 * (1 - f)), withAlpha('#0b0710', 0.08)); }
    c.arc(x, y, r - 1, r + 0.5, 0, 360, withAlpha('#ffd9a0', 0.35));
    ring(false);
}
/** the planet rising at the bottom right: a dark disc, its lit rim and atmosphere glowing over the horizon */
function horizon(c, w, h) {
    const cx = 1300, cy = h + 640, r = 760;
    for (let i = 1; i <= 16; i++) c.arc(cx, cy, r, r + i * 3.2, -70, 70, withAlpha(C.cyan, 0.05 * (1 - i / 17)));
    c.arc(cx, cy, 0, r, -70, 70, '#060a1c');
    for (let i = 0; i < 10; i++) c.arc(cx, cy, r - 40 + i * 4, r - 36 + i * 4, -70, 70, withAlpha('#1d3d8f', 0.06 + i * 0.012));
    c.arc(cx, cy, r - 2.5, r + 1, -70, 70, withAlpha('#9ff0ff', 0.85));
    c.arc(cx, cy, r - 7, r - 2.5, -70, 70, withAlpha(C.cyan, 0.35));
}

function background(cv, t, reach) {
    const now = Date.now(), sw = sway(now);
    cv.blit(G.layer('gs-sp-bg|' + reach, 1600, reach, (c) => backdrop(c, 1600, reach)), 0, 0);
    // planets: far ones barely sway, the horizon a little
    cv.blit(G.layer('gs-sp-ringed', 260, 160, (c) => ringed(c, 130, 80, 30)), 382 + sw[0] * 0.12, 6 + sw[1] * 0.12);
    cv.blit(G.layer('gs-sp-moon', 60, 60, (c) => sphere(c, 30, 30, 13, '#9aa6c4', '#05060f', '#cfe0ff')), 880 + sw[0] * 0.18, 330 + sw[1] * 0.18);
    sky(cv, reach, now);
    cv.blit(G.layer('gs-sp-hz|' + reach, 1600, reach, (c) => horizon(c, 1600, reach)), sw[0] * 0.3, Math.max(0, sw[1] * 0.3));
}

/* ---------------- the dash ---------------- */
function geo(S) {
    const top = S.y + 6, bottom = S.y + S.h;
    const r = Math.min(196, (bottom - top) / 2 - 22);
    return { tx: S.x + 18 + r + 22, ty: top + (bottom - top) / 2 + 4, r, px: S.x + 960, top, bottom };
}
const A0 = -135, A1 = 135;
/** the orbit tach: a dotted orbit, numerals, the lit arc, a satellite at the rpm */
function orbit(cv, S, g) {
    const max = S.maxRpm, r = g.r, cx = g.tx, cy = g.ty, A = (v) => A0 + (A1 - A0) * clamp(v / max, 0, 1);
    const sz = Math.ceil(r + 30);
    cv.blit(G.layer(['gs-sp-orbit', r, max, S.redline, S.shift].join('|'), 2 * sz, 2 * sz, (c) => {
        const x = sz, y = sz;
        c.arc(x, y, r - 22, r + 8, A0, A1, withAlpha('#0b1030', 0.55));
        for (let a = A0; a <= A1 + 1e-6; a += 3) c.arc(x, y, r + 5, r + 7, a - 0.6, a + 0.6, withAlpha(C.label, 0.55));
        c.arc(x, y, r - 22, r - 21, A0, A1, withAlpha(C.faint, 1));
        c.arc(x, y, r - 20, r + 2, A(S.redline), A1, withAlpha(C.crit, 0.12));
        for (let v = 0; v <= max; v += 500) {
            const maj = v % 1000 === 0, a = A(v), red = v >= S.redline;
            L.tick(c, x, y, r - (maj ? 34 : 28), r - 24, a, maj ? 2 : 1, red ? C.crit : maj ? C.ink : C.label);
            if (maj) { const p = L.pt(x, y, r - 52, a); c.text(String(v / 1000), p[0], p[1] + 9, 26, red ? C.crit : C.ink, { font: NUM, align: 'center', literal: true }); }
        }
        // the shift point: a small diamond on the orbit
        const sp = L.pt(x, y, r + 14, A(S.shift));
        c.quad([[sp[0], sp[1] - 6], [sp[0] + 5, sp[1]], [sp[0], sp[1] + 6], [sp[0] - 5, sp[1]]], C.shift);
        glow(c, x, y, r * 0.62, C.violet, 0.10, 10);
    }, cv.textScale), cx - sz, cy - sz);
    if (!isNum(S.rpm)) return;
    const rpm = G.smooth('gs-sp-rpm', S.rpm, 14), a = A(rpm), lo = S.shift - S.range;
    const hot = rpm >= lo, past = rpm >= S.shift;
    const col = S.strobe ? (S.blink ? C.crit : withAlpha(C.crit, 0.4)) : past ? C.crit : hot ? C.shift : null;
    if (a > A0 + 0.5) {
        cv.arc(cx, cy, r - 24, r + 10, A0, a, withAlpha(col || C.violet, 0.16));
        if (col) cv.arc(cx, cy, r - 18, r + 2, A0, a, col, { round: true });
        else cv.arc(cx, cy, r - 18, r + 2, A0, a, C.cyan, { round: true, ramp: [C.blue, C.cyan, C.violet, C.magenta], rampFrom: A0, rampTo: A(lo) });
    }
    // the satellite: a bright body with a halo, a short trail behind it along the orbit
    const p = L.pt(cx, cy, r - 8, a), hc = col || C.cyan;
    cv.arc(cx, cy, r - 10, r - 6, Math.max(A0, a - 14), a, withAlpha('#ffffff', 0.35), { round: true });
    cv.circle(p[0], p[1], 15, withAlpha(hc, 0.18));
    cv.circle(p[0], p[1], 9, withAlpha(hc, 0.45));
    cv.circle(p[0], p[1], 5.5, '#ffffff');
}
/** the gear's planet: a lit sphere in a tilted ring (its back half behind, its front half over it) */
function gearPlanet(cv, S, x, y, R, gcol) {
    const tilt = -0.2, ring = (back) => {
        const pts = [];
        for (let i = 0; i <= 60; i++) {
            const t = (back ? Math.PI : 0) + Math.PI * i / 60, px = Math.cos(t) * R * 1.62, py = Math.sin(t) * R * 0.3;
            pts.push([x + px * Math.cos(tilt) - py * Math.sin(tilt), y + px * Math.sin(tilt) + py * Math.cos(tilt)]);
        }
        return pts;
    };
    const sz = Math.ceil(R * 1.75);
    cv.blit(G.layer(['gs-sp-gp', R].join('|'), 2 * sz, 2 * sz, (c) => {
        const o = (pts) => pts.map((q) => [q[0] - x + sz, q[1] - y + sz]);
        c.polyline(o(ring(true)), 4, withAlpha(C.cyan, 0.30));
        c.polyline(o(ring(true)), 1, withAlpha('#e6fbff', 0.35));
        sphere(c, sz, sz, R, '#1b1f55', '#03040b', C.blue);
        glow(c, sz - R * 0.3, sz - R * 0.35, R * 0.9, C.violet, 0.22, 10);
    }, cv.textScale), x - sz, y - sz);
    const gs = L.gearFit(cv, S.gearText, Math.min(150, R * 1.5), R * 1.55, { font: GEAR, spacing: 0 });
    T(cv, S.gearText, x, y + gs * 0.36, gs, gcol, { font: GEAR, align: 'center', spacing: 0 });
    cv.polyline(ring(false), 4, withAlpha(C.cyan, 0.55));
    cv.polyline(ring(false), 1.2, withAlpha('#e6fbff', 0.8));
}
/** oil / coolant: a label, the value, a thin zoned track with a glowing marker */
function fluid(cv, x, y, w, name, v) {
    const zg = L.tempGauge(v, { cold: C.blue, ok: C.cyan, hot: C.crit }, '#151a3a', 0.35), mk = L.zoneMarks(v);
    lbl(cv, name, x, y);
    T(cv, L.tempText(v), x + w, y + 2, 26, zg.on ? (zg.zone === 'ok' ? C.ink : zg.on) : C.label, { align: 'right' });
    const ty = y + 16;
    [[0, mk[0], 'cold'], [mk[0], mk[1], 'ok'], [mk[1], 1, 'hot']].forEach((z) => cv.fillRect(x + w * z[0], ty, w * (z[1] - z[0]) - 2, 3, withAlpha(zg.C[z[2]], 0.28)));
    if (zg.on) { const px = x + w * zg.pos; cv.fillRect(x, ty, px - x, 3, zg.on); cv.circle(px, ty + 1.5, 7, withAlpha(zg.on, 0.3)); cv.circle(px, ty + 1.5, 3.5, '#ffffff'); }
}
/** the g-meter as a star chart: rings, a crosshair, constellation lines of the trail, the g as a star */
function chart(cv, S, cx, cy, r) {
    const max = S.gMax;
    cv.blit(G.layer(['gs-sp-gm', r, max].join('|'), 2 * r + 40, 2 * r + 40, (c) => {
        const x = r + 20, y = r + 20;
        c.circle(x, y, r + 4, withAlpha('#05071a', 0.6));
        for (let q = 0.5; q <= max + 1e-6; q += 0.5) { const rr = q / max * r; c.arc(x, y, rr - 0.5, rr + 0.5, 0, 360, withAlpha(q % 1 === 0 ? C.label : C.faint, q % 1 === 0 ? 0.7 : 1)); }
        c.fillRect(x - r - 8, y - 0.5, 2 * r + 16, 1, withAlpha(C.faint, 1)); c.fillRect(x - 0.5, y - r - 8, 1, 2 * r + 16, withAlpha(C.faint, 1));
        for (let a = 0; a < 360; a += 10) L.tick(c, x, y, r + 1, r + (a % 90 ? 4 : 9), a, 1, a % 90 ? C.faint : C.label);
    }, cv.textScale), cx - r - 20, cy - r - 20);
    const P = (lat, lon) => [cx + clamp(lat / max, -1.05, 1.05) * r, cy - clamp(lon / max, -1.05, 1.05) * r];
    const tr = S.trail.filter((p) => isNum(p[0]) && isNum(p[1]));
    const step = Math.max(1, Math.floor(tr.length / 12)), pts = [];
    for (let i = 0; i < tr.length; i += step) pts.push(P(tr[i][0], tr[i][1]));
    if (pts.length > 1) cv.polyline(pts, 1, withAlpha(C.cyan, 0.25));
    pts.forEach((q, i) => cv.circle(q[0], q[1], 1.6, withAlpha(C.star, 0.2 + 0.5 * i / pts.length)));
    const lat = G.smooth('gs-sp-lat', S.gLat, 12), lon = G.smooth('gs-sp-lon', S.gLong, 12);
    if (isNum(lat) && isNum(lon)) {
        const q = P(lat, lon);
        cv.circle(q[0], q[1], 14, withAlpha(C.cyan, 0.16));
        cv.fillRect(q[0] - 11, q[1] - 0.6, 22, 1.2, withAlpha('#ffffff', 0.7)); cv.fillRect(q[0] - 0.6, q[1] - 11, 1.2, 22, withAlpha('#ffffff', 0.7));
        cv.circle(q[0], q[1], 4, '#ffffff');
    }
}
/** a rounded, see-through plate (the sky shows through) */
function plate(cv, x, y, w, h, edge) {
    cv.roundRect(x, y, w, h, 14, withAlpha('#060818', 0.62));
    cv.strokeRoundRect(x, y, w, h, 14, 1, edge || withAlpha(C.blue, 0.35));
}

module.exports = {
    id: 'space',
    name: 'Space',
    blurb: 'Deep space: drifting stars that sway with the g-force, planets, an orbit tach',
    palette,
    ui: { txt: TXT, num: NUM, size: 18, spacing: 4, upper: true, radius: 14, nameFont: TXT, nameSize: 30 },
    badgeLetter: '#f2f6ff',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) {
        plate(cv, x, y, w, h, on ? C.cyan : withAlpha(C.blue, 0.35));
        if (on) cv.strokeRoundRect(x - 3, y - 3, w + 6, h + 6, 16, 1, withAlpha(C.cyan, 0.35));
    },
    cardBg(cv, t, x, y, w, h) {
        cv.gradientRect(x, y, w, h, [[0, C.bg1], [0.6, C.bg0], [1, C.bg2]]);
        const R = rng(0xca7d);
        for (let i = 0; i < Math.round(w * h / 900); i++) { const s = R(); cv.fillRect(x + R() * w, y + R() * h, s < 0.85 ? 1 : 2, s < 0.85 ? 1 : 2, withAlpha(C.star, 0.25 + R() * 0.6)); }
    },
    panelPlate(cv, t, x, y, w, h) { plate(cv, x, y, w, h); },
    gButton(cv, t, r, lit, down) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rr = Math.min(r.w, r.h) / 2 - 6;
        cv.circle(cx, cy, rr + 6, withAlpha(lit || down ? C.cyan : C.blue, 0.16));
        cv.circle(cx, cy, rr, withAlpha('#060818', down ? 0.6 : 0.9));
        cv.arc(cx, cy, rr - 1, rr + 0.5, 0, 360, lit || down ? C.cyan : withAlpha(C.blue, 0.6));
        const h = 24, bw = L.badgeWidth(h);
        L.badge(cv, cx - bw / 2, cy + h / 2, h, '#f2f6ff');
    },

    /** The gallery card: a small orbit with its satellite, a ringed planet and stars */
    swatch(cv, t, x, y, w, h) {
        const R = rng(0x51a7);
        for (let i = 0; i < 40; i++) cv.circle(x + R() * w, y + R() * h, 0.6 + R() * 0.9, withAlpha(C.star, 0.3 + R() * 0.6));
        const cx = x + w * 0.4, cy = y + h * 0.56, r = Math.min(w, h) * 0.42;
        cv.arc(cx, cy, r - 6, r, A0, A1, withAlpha(C.faint, 1));
        cv.arc(cx, cy, r - 6, r, A0, 50, C.cyan, { round: true, ramp: [C.blue, C.cyan, C.violet], rampFrom: A0, rampTo: 50 });
        const p = L.pt(cx, cy, r - 3, 50);
        cv.circle(p[0], p[1], 8, withAlpha(C.cyan, 0.3)); cv.circle(p[0], p[1], 4, '#ffffff');
        T(cv, '88', cx, cy + 11, 30, C.ink, { align: 'center' });
        const px = x + w * 0.8, py = y + h * 0.3, pr = Math.min(w, h) * 0.11;
        cv.circle(px, py, pr, '#b98a52');
        cv.line(px - pr * 2, py + pr * 0.5, px + pr * 2, py - pr * 0.5, 2, withAlpha(C.gold, 0.8));
    },

    panelRect(S) { const g = geo(S); return { x: g.px, y: g.top + 10, w: S.x + S.w - g.px, h: g.bottom - g.top - 92 }; },

    draw(cv, S) {
        MOTION.gLat = S.gLat; MOTION.gLong = S.gLong; MOTION.mph = isNum(S.mph) ? S.mph : S.imperial ? S.speed : isNum(S.speed) ? S.speed / 1.609344 : null; MOTION.at = Date.now();
        const g = geo(S), lo = S.shift - S.range, hot = isNum(S.rpm) && S.rpm >= lo && !S.strobe;
        orbit(cv, S, g);
        // the speed in the orbit's middle, the rpm over it
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--';
        T(cv, sp, g.tx, g.ty + 52, sp.length > 2 ? 116 : 140, C.ink, { align: 'center', spacing: 0 });
        lbl(cv, (S.unit || 'MPH').toUpperCase(), g.tx, g.ty + 92, C.label, { align: 'center', spacing: 6 });
        T(cv, L.rpmText(S.rpm), g.tx, g.ty - 96, 24, S.strobe ? C.crit : hot ? C.shift : C.cyan, { align: 'center' });
        lbl(cv, 'RPM', g.tx, g.ty - 72, C.label, { align: 'center', spacing: 6 });
        // the gear on its planet
        const gx = g.tx + g.r + 245, gy = g.top + 170, R = 92;
        const gcol = S.strobe ? (S.blink ? C.crit : C.ink) : hot ? C.shift : C.ink;
        lbl(cv, 'GEAR', gx, g.top + 34, C.label, { align: 'center', spacing: 6 });
        if (S.guessed) lbl(cv, 'EST', gx + R + 40, g.top + 34, C.label, { align: 'right' });
        gearPlanet(cv, S, gx, gy, R, gcol);
        if (S.mode) {
            const tw = cv.textWidth(S.mode, 14, { font: TXT, spacing: 4, literal: true }), mc = S.modeTone === 'sport+' || S.modeTone === 'track' ? C.crit : S.modeTone === 'sport' ? C.shift : C.cyan;
            cv.roundRect(gx - tw / 2 - 14, gy + R + 34, tw + 28, 26, 13, withAlpha('#060818', 0.75));
            cv.strokeRoundRect(gx - tw / 2 - 14, gy + R + 34, tw + 28, 26, 13, 1, mc);
            cv.text(S.mode, gx, gy + R + 52, 14, mc, { font: TXT, spacing: 4, align: 'center', literal: true });
        }
        // fluids under the planet
        const fx = gx - 150, fw = 300, fy = g.bottom - 82;
        fluid(cv, fx, fy, fw, 'OIL', S.oil);
        fluid(cv, fx, fy + 44, fw, 'COOLANT', S.cool);
        S.zones = {
            speed: { x: g.tx - 150, y: g.ty - 50, w: 300, h: 160 }, gear: { x: gx - R, y: gy - R, w: 2 * R, h: 2 * R },
            toast: { x: g.tx, y: g.ty + 40 }, chip: { x: gx + R - 6, y: gy - R + 16 }, star: { x: gx + 46, y: g.top + 34 },
        };
        if (S.panel && S.panel !== 'g') return;
        // right: the star chart and the peaks
        const px = g.px, pw = S.x + S.w - px, r = 112, cx = px + 24 + r, cy = g.top + 32 + r + 14;
        lbl(cv, 'G-FORCE', px + 4, g.top + 34);
        chart(cv, S, cx, cy, r);
        const tx = cx + r + 46, tw = px + pw - tx;
        const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
        [['G NOW', tot == null ? '-.--' : tot.toFixed(2), C.ink], ['ACCEL', S.peak.acc.toFixed(2), C.cyan], ['BRAKE', S.peak.brk.toFixed(2), C.shift], ['LATERAL', S.peak.lat.toFixed(2), C.violet]].forEach((p, i) => {
            const y = g.top + 40 + i * 58;
            cv.fillRect(tx, y + 46, tw, 1, withAlpha(C.faint, 1));
            lbl(cv, p[0], tx, y + 36);
            T(cv, p[1], tx + tw, y + 40, 32, p[2], { align: 'right' });
        });
        // the session clock: on the planet's night side, under the peaks
        const ssy = g.bottom - 58;
        lbl(cv, 'MISSION TIME', tx, ssy);
        T(cv, L.clock(S.session), tx + tw, ssy + 36, 32, C.ink, { align: 'right' });
        L.sessionTap(cv, S, tx - 8, ssy - 20, tw + 16, 66, C.cyan, 12);
    },
};
