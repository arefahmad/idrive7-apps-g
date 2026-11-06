'use strict';
/**
 * Aura - anime battle energy (original art: no characters, names or emblems). A dusk sky over rocky mesas
 * with faint energy-burst rays; the tach is a ring wrapped in an aura of flickering flames that powers up
 * with the revs - a calm blue-white glow at idle, blazing gold as the rpm climbs, lightning crackling round
 * it from the shift lights on. The flames lean with the g-force and shed rising embers; anime speed lines
 * streak past, more of them the faster the car goes. The rpm reads as a power level, the gear sits in a
 * glowing energy orb, the g-meter is an amber scanner with a sweeping radar. Saira Italic numerals,
 * Chakra Petch labels (open fonts the app already ships).
 * Static parts (sky, mesas, rays, scales) are cached layers; per frame the flames (~110 small triangles),
 * embers, speed lines and readouts are drawn. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');

const { withAlpha, clamp, isNum } = L;
const NUM = 'gs_m_num', GEAR = 'gs_m_gear', TXT = 'gs_gt_txt';
const C = {
    sky0: '#07050f', sky1: '#1a0c26', sky2: '#4a1a22', dusk: '#a8461f', mesa: '#0d0810', mesa2: '#1a0f1a',
    ink: '#fff7e8', label: '#c9a988', faint: '#4a3226', edge: '#6b3f1e',
    calm: '#bfe8ff', gold: '#ffd23f', hot: '#ff9a1f', white: '#fffbe6', bolt: '#9fe8ff',
    shift: '#ffb21f', crit: '#ff3b2f', amber: '#ffb347', scan: '#ffcf6a',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'Aura',
    bg: C.sky0, panelTop: '#1d1018', panelBottom: '#0a060c', panelEdge: C.edge,
    track: '#2a1a16', tick: C.faint, text: C.ink, dim: C.label,
    accent: C.gold, accent2: C.calm, ok: C.gold, warn: C.shift, crit: C.crit, cold: C.calm,
    stripes: [C.calm, C.gold, C.hot], sel: C.gold, selText: C.sky0, marker: C.hot,
});
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col, Object.assign({ font: NUM, spacing: 0, literal: true }, o || {}));
const lbl = (cv, s, x, y, col, o) => cv.text(s, x, y, 15, col || C.label, Object.assign({ font: TXT, spacing: 3, literal: true }, o || {}));
/** a steady per-index random number (0..1) */
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------------- what drives the energy: set by draw(), read by the background ---------------- */
const MOTION = { rpm: 0, power: 0.2, gLat: 0, gLong: 0, mph: 0, at: 0 };
const fresh = (now) => now - MOTION.at < 1500;

/* ---------------- the sky ---------------- */
function glow(c, x, y, r, col, a, steps) {
    steps = steps || 14;
    for (let i = steps; i >= 1; i--) { const f = i / steps; c.circle(x, y, r * f, withAlpha(col, a * (1 - f) * (1 - f) * 6 / steps)); }
}
/** a rocky skyline: flat-topped mesas and spires, from x0 to x1 above baseline y (seeded) */
function mesas(c, w, y, seed, hmin, hmax, col) {
    const pts = [[0, y + 40]];
    let x = 0, k = seed;
    while (x < w + 40) {
        const kind = rnd(k, 1), h = hmin + rnd(k, 2) * (hmax - hmin), wd = 40 + rnd(k, 3) * 140;
        if (kind < 0.55) {                                  // a mesa: slope up, flat top, slope down
            pts.push([x + wd * 0.18, y - h], [x + wd * 0.82, y - h * (0.92 + 0.08 * rnd(k, 4))], [x + wd, y - h * 0.15]);
        } else if (kind < 0.8) {                            // a spire
            pts.push([x + wd * 0.42, y - h * 1.25], [x + wd * 0.58, y - h * 1.2], [x + wd, y - h * 0.1]);
        } else pts.push([x + wd * 0.5, y - h * 0.35], [x + wd, y - h * 0.1]);
        x += wd; k++;
    }
    pts.push([w + 40, y + 40]);
    c.fillUnder(pts, y + 600, col);
}
function backdrop(c, w, h) {
    c.gradientRect(0, 0, w, h, [[0, C.sky0], [0.45, C.sky1], [0.8, C.sky2], [1, C.dusk]]);
    glow(c, w * 0.62, h * 0.86, 520, '#ff7a2a', 0.32, 20);
    // energy-burst rays from behind the tach
    const ox = 230, oy = h * 0.55;
    for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2, b = a + 0.045, R = 1400;
        c.quad([[ox, oy], [ox + Math.cos(a) * R, oy + Math.sin(a) * R], [ox + Math.cos(b) * R, oy + Math.sin(b) * R], [ox, oy]], withAlpha('#ffcf6a', i % 2 ? 0.025 : 0.045));
    }
    mesas(c, w, h * 0.86, 3, 40, 110, withAlpha(C.mesa2, 1));
    mesas(c, w, h * 0.95, 41, 30, 80, withAlpha(C.mesa, 1));
    c.fillRect(0, h * 0.95, w, h * 0.05 + 2, C.mesa);
}
/** anime speed lines: thin streaks racing left, more and longer with speed (and with acceleration) */
function speedLines(cv, reach, now) {
    const v = fresh(now) && isNum(MOTION.mph) ? clamp(MOTION.mph, 0, 160) : 0;
    const push = fresh(now) && isNum(MOTION.gLong) ? clamp(MOTION.gLong, 0, 1) : 0;
    const k = clamp((v - 25) / 90 + push * 0.6, 0, 1);
    if (k <= 0) return;
    const n = Math.round(6 + 26 * k), ts = now / 1000;
    for (let i = 0; i < n; i++) {
        const sp = 900 + rnd(i, 5) * 900, len = (120 + rnd(i, 6) * 320) * (0.5 + k), y = 30 + rnd(i, 7) * (reach - 60);
        const x = 1700 - ((ts * sp * (0.4 + k) + rnd(i, 8) * 2000) % 2100);
        cv.fillRect(x, y, len, rnd(i, 9) < 0.3 ? 2 : 1, withAlpha('#fff3d6', (0.05 + 0.12 * rnd(i, 10)) * (0.4 + 0.6 * k)));
    }
}
function background(cv, t, reach) {
    cv.blit(G.layer('gs-au-bg|' + reach, 1600, reach, (c) => backdrop(c, 1600, reach)), 0, 0);
    speedLines(cv, reach, Date.now());
}

/* ---------------- the aura ---------------- */
/** the aura's colour for a power 0..1+: calm blue-white, then gold, then hot orange-gold */
function auraCol(p) { return p < 0.45 ? L.mix(C.calm, C.gold, clamp((p - 0.25) / 0.2, 0, 1)) : L.mix(C.gold, C.hot, clamp((p - 0.75) / 0.3, 0, 1)); }
/**
 * Flames round a ring (cx, cy, r): tongues from the ring's edge that flicker, grow with the power and curl
 * upward (an aura rises), leaning opposite to the lateral g. Each tongue is two triangles (base, a bulge
 * either side, the tip), of its own width and length; a soft haze pass, then a bright inner pass.
 */
function flames(cv, cx, cy, r, now, p, lean) {
    const ts = now / 1000, col = auraCol(p), inner = L.mix(col, C.white, 0.6);
    const base = 12 + 58 * clamp(p, 0, 1.2);
    // the plume: a soft teardrop of light rising over the ring
    for (let i = 0; i < 9; i++) { const f = i / 8; cv.circle(cx + lean * r * 0.25 * f, cy - r * 0.55 * f * (0.6 + 0.6 * p), r * (1.25 - 0.55 * f) + base * 0.4, withAlpha(col, 0.035 + 0.03 * p)); }
    [[40, 1.0, 0.13, col, 1.8], [40, 0.78, 0.24, col, 1.1], [30, 0.5, 0.42, inner, 0.8]].forEach((pass, pi) => {
        const N = pass[0];
        for (let i = 0; i < N; i++) {
            const j = i + pi * 97, a = (i + rnd(j, 4) * 0.8) / N * Math.PI * 2;
            const w = Math.PI / N * pass[4] * (0.7 + 0.8 * rnd(j, 5));
            const fl = 0.5 + 0.5 * Math.sin(ts * (5 + rnd(j, 1) * 6) + rnd(j, 2) * 6.28) * (0.6 + 0.4 * Math.sin(ts * (1.7 + rnd(j, 3) * 2) + j));
            const up = Math.max(0, -Math.sin(a));                        // 1 on top, 0 below the middle
            const len = base * pass[1] * (0.35 + 0.65 * fl) * (0.45 + 0.85 * up + 0.3 * rnd(j, 6));
            const ox = Math.cos(a), oy = Math.sin(a);
            // the tip: outward, pulled up (more the higher it reaches) and leaning
            let dx = ox * 0.55 + lean * 0.5, dy = oy * 0.55 - 0.9;
            const dl = Math.sqrt(dx * dx + dy * dy); dx /= dl; dy /= dl;
            const b0 = [cx + Math.cos(a - w) * r, cy + Math.sin(a - w) * r], b1 = [cx + Math.cos(a + w) * r, cy + Math.sin(a + w) * r];
            const m = [cx + ox * r + dx * len * 0.45, cy + oy * r + dy * len * 0.45], bw = r * w * 0.9;
            const c0 = [m[0] - dy * bw, m[1] + dx * bw], c1 = [m[0] + dy * bw, m[1] - dx * bw];
            const sway = Math.sin(ts * 7 + j) * len * 0.12;
            const tip = [cx + ox * r + dx * len - dy * sway, cy + oy * r + dy * len + dx * sway];
            const k = withAlpha(pass[3], pass[2] * (0.55 + 0.45 * fl));
            cv.quad([b0, c0, tip, tip], k); cv.quad([b1, c1, tip, tip], k); cv.quad([b0, c0, c1, b1], k);
        }
    });
}
/** embers: sparks rising off the aura, more with power */
function embers(cv, cx, cy, r, now, p) {
    const ts = now / 1000, n = Math.round(10 + 36 * clamp(p, 0, 1)), col = auraCol(p);
    for (let i = 0; i < n; i++) {
        const life = (ts * (0.35 + rnd(i, 11) * 0.5) + rnd(i, 12)) % 1, a = rnd(i, 13) * Math.PI * 2;
        const x = cx + Math.cos(a) * (r + 8) + Math.sin(ts * 3 + i) * 6, y = cy + Math.sin(a) * (r + 8) - life * (60 + 90 * p);
        cv.circle(x, y, 1.2 + rnd(i, 14) * 1.6, withAlpha(i % 3 ? col : C.white, (1 - life) * 0.8));
    }
}
/** lightning: jagged bolts flicking round the ring (a new set every 90 ms) */
function lightning(cv, cx, cy, r, now, k) {
    const frame = Math.floor(now / 90);
    for (let b = 0; b < 3; b++) {
        if (rnd(frame, b + 20) > 0.55 + 0.4 * k) continue;
        const a0 = rnd(frame, b + 30) * Math.PI * 2, span = 0.5 + rnd(frame, b + 40) * 0.6, pts = [];
        for (let s = 0; s <= 9; s++) {
            const a = a0 + span * s / 9, rr = r + 6 + (rnd(frame * 13 + b, s) - 0.3) * 36;
            pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
        }
        cv.polyline(pts, 6, withAlpha(C.bolt, 0.18));
        cv.polyline(pts, 2, withAlpha('#e9fbff', 0.9));
    }
}

/* ---------------- the dash ---------------- */
function geo(S) {
    const top = S.y + 6, bottom = S.y + S.h, r = Math.min(178, (bottom - top) / 2 - 40);
    return { tx: S.x + 30 + r + 40, ty: top + (bottom - top) / 2 + 14, r, px: S.x + 960, top, bottom };
}
const A0 = -135, A1 = 135;
function powerRing(cv, S, g, now) {
    const max = S.maxRpm, r = g.r, cx = g.tx, cy = g.ty, A = (v) => A0 + (A1 - A0) * clamp(v / max, 0, 1);
    const rpm = isNum(S.rpm) ? G.smooth('gs-au-rpm', S.rpm, 14) : 0, lo = S.shift - S.range;
    const p = clamp(rpm / Math.max(1, S.shift), 0.12, 1.15);
    const lean = G.smooth('gs-au-lean', fresh(now) && isNum(S.gLat) ? -clamp(S.gLat, -1.5, 1.5) * 0.7 : 0, 4);
    // the aura behind the ring, then the ring's face over its inner half
    glow(cv, cx, cy, r + 40 + 40 * p, auraCol(p), 0.18 + 0.12 * p, 10);
    flames(cv, cx, cy, r + 6, now, p, lean);
    const sz = Math.ceil(r + 10);
    cv.blit(G.layer(['gs-au-ring', r, max, S.redline, S.shift].join('|'), 2 * sz, 2 * sz, (c) => {
        const x = sz, y = sz;
        c.circle(x, y, r + 4, '#120a10');
        c.arc(x, y, r - 2, r + 4, 0, 360, withAlpha(C.gold, 0.55));
        c.arc(x, y, r - 30, r - 6, A0, A1, '#22140f');
        c.arc(x, y, r - 30, r - 6, A(S.redline), A1, withAlpha(C.crit, 0.25));
        for (let v = 0; v <= max; v += 500) {
            const maj = v % 1000 === 0, a = A(v), red = v >= S.redline;
            L.tick(c, x, y, r - (maj ? 44 : 38), r - 34, a, maj ? 2.5 : 1.2, red ? C.crit : maj ? C.ink : C.label);
            if (maj) { const q = L.pt(x, y, r - 62, a); c.text(String(v / 1000), q[0], q[1] + 9, 26, red ? C.crit : C.ink, { font: NUM, align: 'center', literal: true }); }
        }
        glow(c, x, y, r * 0.7, '#ff8a2a', 0.12, 10);
    }, cv.textScale), cx - sz, cy - sz);
    if (isNum(S.rpm) && A(rpm) > A0 + 0.5) {
        const a = A(rpm), hot = rpm >= lo, col = S.strobe ? (S.blink ? C.crit : withAlpha(C.crit, 0.45)) : rpm >= S.shift ? C.crit : hot ? C.shift : null;
        cv.arc(cx, cy, r - 30, r - 6, A0, a, withAlpha(col || C.gold, 0.25));
        if (col) cv.arc(cx, cy, r - 26, r - 10, A0, a, col);
        else cv.arc(cx, cy, r - 26, r - 10, A0, a, C.gold, { ramp: [C.calm, '#ffe680', C.gold, C.hot], rampFrom: A0, rampTo: A(lo) });
        const q = L.pt(cx, cy, r - 18, a);
        cv.circle(q[0], q[1], 13, withAlpha(col || C.white, 0.25)); cv.circle(q[0], q[1], 6, C.white);
    }
    embers(cv, cx, cy, r + 6, now, p);
    if (isNum(S.rpm) && rpm >= lo) lightning(cv, cx, cy, r + 6, now, clamp((rpm - lo) / Math.max(1, S.shift - lo), 0, 1));
    return p;
}
/** the gear in an energy orb: a white-hot core in blue light, breathing; the letter dark on it */
function orb(cv, S, x, y, R, now, gcol, hot) {
    const k = 1 + 0.035 * Math.sin(now / 1000 * 4.2), col = hot ? C.gold : '#4fb8ff', rr = R * k;
    for (let i = 10; i >= 1; i--) { const f = i / 10; cv.circle(x, y, rr * (1 + 0.6 * f), withAlpha(col, 0.05 * (1 - f) + 0.01)); }
    cv.circle(x, y, rr, withAlpha(col, 0.85));
    for (let i = 1; i <= 8; i++) cv.circle(x - rr * 0.08 * i / 8, y - rr * 0.1 * i / 8, rr * (1 - i * 0.1), withAlpha('#ffffff', 0.12));
    cv.circle(x - rr * 0.15, y - rr * 0.18, rr * 0.3, withAlpha('#ffffff', 0.5));
    const gs = L.gearFit(cv, S.gearText, Math.min(150, R * 1.45), R * 1.6, { font: GEAR, spacing: 0 });
    T(cv, S.gearText, x, y + gs * 0.36, gs, gcol, { font: GEAR, align: 'center' });
}
function fluid(cv, x, y, w, name, v) {
    const zg = L.tempGauge(v, { cold: C.calm, ok: C.gold, hot: C.crit }, '#2a1a16', 0.35), mk = L.zoneMarks(v);
    lbl(cv, name, x, y);
    T(cv, L.tempText(v), x + w, y + 2, 28, zg.on ? (zg.zone === 'ok' ? C.ink : zg.on) : C.label, { align: 'right' });
    const ty = y + 16;
    [[0, mk[0], 'cold'], [mk[0], mk[1], 'ok'], [mk[1], 1, 'hot']].forEach((z) => cv.quad([[x + w * z[0] + 4, ty], [x + w * z[1] - 2, ty], [x + w * z[1] - 6, ty + 5], [x + w * z[0], ty + 5]], withAlpha(zg.C[z[2]], 0.3)));
    if (zg.on) { const px = x + w * zg.pos; cv.quad([[x + 4, ty], [px, ty], [px - 4, ty + 5], [x, ty + 5]], zg.on); cv.circle(px, ty + 2.5, 8, withAlpha(zg.on, 0.3)); }
}
/** the scanner: an amber radar with a sweeping beam and the g as a locked target */
function scanner(cv, S, cx, cy, r, now) {
    const max = S.gMax;
    cv.blit(G.layer(['gs-au-sc', r, max].join('|'), 2 * r + 40, 2 * r + 40, (c) => {
        const x = r + 20, y = r + 20;
        c.circle(x, y, r + 6, withAlpha('#1c0f06', 0.7));
        for (let q = 0.5; q <= max + 1e-6; q += 0.5) { const rr = q / max * r; c.arc(x, y, rr - 0.6, rr + 0.6, 0, 360, withAlpha(C.scan, q % 1 === 0 ? 0.55 : 0.25)); }
        c.fillRect(x - r, y - 0.5, 2 * r, 1, withAlpha(C.scan, 0.3)); c.fillRect(x - 0.5, y - r, 1, 2 * r, withAlpha(C.scan, 0.3));
        for (let a = 0; a < 360; a += 15) L.tick(c, x, y, r + 1, r + (a % 45 ? 4 : 9), a, 1.2, withAlpha(C.scan, a % 45 ? 0.4 : 0.85));
    }, cv.textScale), cx - r - 20, cy - r - 20);
    // the sweep: a beam turning once every 2.4 s with a fading trail
    const sa = (now / 2400 % 1) * 360;
    for (let i = 0; i < 10; i++) cv.arc(cx, cy, 0, r, sa - (i + 1) * 4, sa - i * 4, withAlpha(C.scan, 0.11 * (1 - i / 10)));
    const P = (lat, lon) => [cx + clamp(lat / max, -1.05, 1.05) * r, cy - clamp(lon / max, -1.05, 1.05) * r];
    S.trail.forEach((pt, i) => { if (isNum(pt[0]) && isNum(pt[1])) { const q = P(pt[0], pt[1]); cv.circle(q[0], q[1], 1.5, withAlpha(C.scan, 0.1 + 0.5 * i / S.trail.length)); } });
    const lat = G.smooth('gs-au-lat', S.gLat, 12), lon = G.smooth('gs-au-lon', S.gLong, 12);
    if (isNum(lat) && isNum(lon)) {
        const q = P(lat, lon), b = 13;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((d) => {
            cv.fillRect(q[0] + d[0] * b - (d[0] < 0 ? 0 : 6), q[1] + d[1] * b - (d[1] < 0 ? 0 : 1.5), 6, 1.5, C.scan);
            cv.fillRect(q[0] + d[0] * b - (d[0] < 0 ? 0 : 1.5), q[1] + d[1] * b - (d[1] < 0 ? 0 : 6), 1.5, 6, C.scan);
        });
        cv.circle(q[0], q[1], 9, withAlpha(C.crit, 0.25)); cv.circle(q[0], q[1], 4, C.crit);
    }
}
/** a chamfered, see-through amber plate */
function plate(cv, x, y, w, h, edge) {
    const k = 16, pts = [[x + k, y], [x + w, y], [x + w, y + h - k], [x + w - k, y + h], [x, y + h], [x, y + k]];
    cv.quad([pts[0], pts[1], pts[2], pts[5]], withAlpha('#120a08', 0.66));
    cv.quad([pts[5], pts[2], pts[3], pts[4]], withAlpha('#120a08', 0.66));
    cv.polyline(pts.concat([pts[0]]), 1.2, edge || withAlpha(C.amber, 0.45));
}

module.exports = {
    id: 'aura',
    name: 'Aura',
    blurb: 'Anime battle energy: an aura that powers up with the revs, lightning, speed lines',
    palette,
    ui: { txt: TXT, num: NUM, size: 18, spacing: 3, upper: true, radius: 6, nameFont: TXT, nameSize: 30 },
    badgeLetter: '#fff2c2',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) { plate(cv, x, y, w, h, on ? C.gold : withAlpha(C.amber, 0.45)); },
    cardBg(cv, t, x, y, w, h) {
        cv.gradientRect(x, y, w, h, [[0, C.sky0], [0.55, C.sky1], [0.85, C.sky2], [1, C.dusk]]);
        for (let i = 0; i < 9; i++) {
            const yy = y + h * (0.12 + 0.07 * i), ln = w * (0.25 + 0.4 * rnd(i, 50));
            cv.fillRect(x + w - ln - w * 0.05 * rnd(i, 51), yy, ln, 1, withAlpha('#fff3d6', 0.12));
        }
    },
    panelPlate(cv, t, x, y, w, h) { plate(cv, x, y, w, h); },
    gButton(cv, t, r, lit, down) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rr = Math.min(r.w, r.h) / 2 - 6, col = lit || down ? C.gold : C.amber;
        cv.circle(cx, cy, rr + 7, withAlpha(col, lit || down ? 0.28 : 0.14));
        cv.circle(cx, cy, rr, withAlpha('#120a08', down ? 0.6 : 0.9));
        cv.arc(cx, cy, rr - 1, rr + 0.8, 0, 360, col);
        const h = 24, bw = L.badgeWidth(h);
        L.badge(cv, cx - bw / 2, cy + h / 2, h, '#fff2c2');
    },
    /** The gallery card: a powered-up ring in its aura and a power reading */
    swatch(cv, t, x, y, w, h) {
        const cx = x + w * 0.5, cy = y + h * 0.56, r = Math.min(w, h) * 0.36;
        glow(cv, cx, cy, r * 1.9, C.gold, 0.4, 10);
        flames(cv, cx, cy, r, 1700000000000 + 400, 0.95, 0);
        cv.circle(cx, cy, r, '#120a10');
        cv.arc(cx, cy, r - 2, r + 2, 0, 360, C.gold);
        cv.arc(cx, cy, r - 12, r - 5, A0, 70, C.gold, { ramp: [C.calm, C.gold, C.hot], rampFrom: A0, rampTo: 70 });
        T(cv, '88', cx, cy + 12, Math.round(r * 0.75), C.ink, { align: 'center' });
    },

    panelRect(S) { const g = geo(S); return { x: g.px, y: g.top + 10, w: S.x + S.w - g.px, h: g.bottom - g.top - 92 }; },

    draw(cv, S) {
        const now = Date.now();
        MOTION.gLat = S.gLat; MOTION.gLong = S.gLong; MOTION.mph = isNum(S.mph) ? S.mph : S.imperial ? S.speed : isNum(S.speed) ? S.speed / 1.609344 : null; MOTION.at = now;
        const g = geo(S), lo = S.shift - S.range, hot = isNum(S.rpm) && S.rpm >= lo && !S.strobe;
        powerRing(cv, S, g, now);
        // the power level (the rpm) over the speed in the ring's middle
        lbl(cv, 'POWER LEVEL', g.tx, g.ty - 74, C.label, { align: 'center', spacing: 4 });
        T(cv, L.rpmText(S.rpm), g.tx, g.ty - 44, 28, S.strobe ? C.crit : hot ? C.shift : C.gold, { align: 'center' });
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--';
        T(cv, sp, g.tx, g.ty + 58, sp.length > 2 ? 104 : 124, C.ink, { align: 'center' });
        lbl(cv, (S.unit || 'MPH').toUpperCase(), g.tx, g.ty + 88, C.label, { align: 'center', spacing: 5 });
        // the gear in its orb
        const gx = g.tx + g.r + 250, gy = g.top + 168, R = 84;
        const gcol = S.strobe ? (S.blink ? C.crit : '#0e1430') : '#0e1430';
        lbl(cv, 'GEAR', gx, g.top + 34, C.label, { align: 'center', spacing: 5 });
        if (S.guessed) lbl(cv, 'EST', gx + R + 30, g.top + 34, C.label, { align: 'right' });
        orb(cv, S, gx, gy, R, now, gcol, hot || S.strobe);
        if (S.mode) {
            const tw = cv.textWidth(S.mode, 14, { font: TXT, spacing: 3, literal: true }), mc = S.modeTone === 'sport+' || S.modeTone === 'track' ? C.crit : S.modeTone === 'sport' ? C.shift : C.calm;
            plate(cv, gx - tw / 2 - 16, gy + R + 30, tw + 32, 28, mc);
            cv.text(S.mode, gx, gy + R + 49, 14, mc, { font: TXT, spacing: 3, align: 'center', literal: true });
        }
        const fx = gx - 150, fw = 300, fy = g.bottom - 82;
        fluid(cv, fx, fy, fw, 'OIL', S.oil);
        fluid(cv, fx, fy + 44, fw, 'COOLANT', S.cool);
        S.zones = {
            speed: { x: g.tx - 140, y: g.ty - 20, w: 280, h: 130 }, gear: { x: gx - R, y: gy - R, w: 2 * R, h: 2 * R },
            toast: { x: g.tx, y: g.ty + 40 }, chip: { x: gx + R - 6, y: gy - R + 16 }, star: { x: gx + 40, y: g.top + 34 },
        };
        if (S.panel && S.panel !== 'g') return;
        // right: the scanner and the peaks
        const px = g.px, pw = S.x + S.w - px, r = 108, cx = px + 24 + r, cy = g.top + 32 + r + 18;
        lbl(cv, 'SCANNER  G-FORCE', px + 4, g.top + 34, C.amber);
        scanner(cv, S, cx, cy, r, now);
        const tx = cx + r + 46, tw = px + pw - tx;
        const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
        [['G NOW', tot == null ? '-.--' : tot.toFixed(2), C.ink], ['ACCEL', S.peak.acc.toFixed(2), C.gold], ['BRAKE', S.peak.brk.toFixed(2), C.hot], ['LATERAL', S.peak.lat.toFixed(2), C.calm]].forEach((q, i) => {
            const y = g.top + 40 + i * 58;
            cv.quad([[tx, y + 46], [tx + tw, y + 46], [tx + tw - 4, y + 47.5], [tx, y + 47.5]], withAlpha(C.amber, 0.35));
            lbl(cv, q[0], tx, y + 36);
            T(cv, q[1], tx + tw, y + 40, 32, q[2], { align: 'right' });
        });
        const ssy = g.bottom - 58;
        lbl(cv, 'BATTLE TIME', tx, ssy);
        T(cv, L.clock(S.session), tx + tw, ssy + 36, 32, C.ink, { align: 'right' });
        L.sessionTap(cv, S, tx - 8, ssy - 20, tw + 16, 66, C.gold, 6);
    },
};
