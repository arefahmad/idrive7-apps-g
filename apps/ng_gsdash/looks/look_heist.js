'use strict';
/**
 * Heist - the dash as an open-world crime game's HUD (original art in that spirit: no game's name, logo,
 * font, characters or catchphrases). A posterized sunset city behind it: a striped sun, a skyline of lit
 * windows, palm trees. A round radar in the corner whose streets scroll past the car's arrow as it drives,
 * the revs as a ring round it; the speed big in outlined type with a five-star "wanted" level that climbs
 * (and flashes) with the speed; at three stars and up searchlights sweep the sky and, at four, red and blue
 * lights pulse at the page's edges; the gear in a box; a pause-menu STATS card of the g-force peaks;
 * mission-style subtitles. Titillium (open font the app already ships). Static parts (the city, the radar's
 * frame, cards) are cached layers. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');

const { withAlpha, clamp, isNum } = L;
const BIG = 'gs_s_gear', NUM = 'gs_s_num', TXT = 'gs_s_txt';
const C = {
    sky0: '#22104a', sky1: '#6e2a8c', sky2: '#ff6f61', sky3: '#ffb347', sun0: '#ffe066', sun1: '#ff5e7e',
    city: '#1b0d33', city2: '#2c1450', win: '#ffd36b', palm: '#0e0620',
    white: '#ffffff', black: '#000000', ink: '#f5f5f5', dim: '#c9c3d8', green: '#5fd068', yellow: '#ffd23a', red: '#ff3b3b',
    blue: '#4aa3ff', map: '#1f2533', road: '#5b6475', road2: '#8a93a5', panel: '#0b0b10',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'Heist',
    bg: C.sky0, panelTop: '#1a1424', panelBottom: '#0b0b10', panelEdge: '#3a2f4a',
    track: '#2a2433', tick: '#5a5266', text: C.ink, dim: C.dim,
    accent: C.green, accent2: C.yellow, ok: C.green, warn: C.yellow, crit: C.red, cold: C.blue,
    stripes: [C.sun1, C.sky2, C.yellow], sel: C.green, selText: C.black, marker: C.yellow,
});
/** text in white (or col) with a black outline, as game HUDs draw it */
function out(cv, s, x, y, size, col, font, o, w) {
    const f = Object.assign({ font: font || TXT, literal: true }, o || {});
    w = w || Math.max(1.5, size / 24);
    [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]].forEach((d) => cv.text(s, x + d[0] * w, y + d[1] * w, size, C.black, f));
    cv.text(s, x, y, size, col || C.white, f);
}
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------------- the city at sunset ---------------- */
/** a leaf: a tapering chain of quads along a curve from (x, y), heading a (radians), bending by bend per step */
function leaf(c, x, y, a, len, w0, bend, col) {
    const n = 7, step = len / n;
    let px = x, py = y, pw = w0;
    for (let k = 0; k < n; k++) {
        a += bend;
        const nx = px + Math.cos(a) * step, ny = py + Math.sin(a) * step, nw = w0 * (1 - (k + 1) / n) + 0.6;
        const ox = -Math.sin(a), oy = Math.cos(a);
        c.quad([[px + ox * pw, py + oy * pw], [nx + ox * nw, ny + oy * nw], [nx - ox * nw, ny - oy * nw], [px - ox * pw, py - oy * pw]], col);
        px = nx; py = ny; pw = nw;
    }
}
function palm(c, tx, ty, th, lean, col) {
    const pts = [];
    for (let k = 0; k <= 12; k++) { const f = k / 12; pts.push([tx + lean * th * 0.22 * f * f, ty - th * f]); }
    for (let k = 1; k < pts.length; k++) { const w = 9 - k * 0.35; c.quad([[pts[k - 1][0] - w, pts[k - 1][1]], [pts[k][0] - w + 0.7, pts[k][1]], [pts[k][0] + w - 0.7, pts[k][1]], [pts[k - 1][0] + w, pts[k - 1][1]]], col); }
    const top = pts[pts.length - 1];
    // fronds fanned round the crown, each drooping away from the top
    [[-3.2, -0.13], [-2.8, -0.15], [-2.35, -0.13], [-1.9, -0.08], [-1.35, 0.08], [-0.85, 0.13], [-0.4, 0.15], [0.05, 0.13]].forEach((f, i) => {
        leaf(c, top[0], top[1], f[0], 115 + (i % 3) * 20, 9, f[1], col);
    });
    c.circle(top[0], top[1] + 4, 10, col);
}
function city(c, w, h) {
    c.gradientRect(0, 0, w, h, [[0, C.sky0], [0.35, C.sky1], [0.68, C.sky2], [0.86, C.sky3]]);
    // the sun: big and low, its lower half cut by bands of sky
    const sx = w * 0.68, sy = h * 0.68, sr = 170;
    for (let i = 12; i >= 1; i--) c.circle(sx, sy, sr + i * 10, withAlpha(C.sun0, 0.03));
    c.circle(sx, sy, sr, C.sun0);
    c.arc(sx, sy, 0, sr, 100, 260, withAlpha(C.sun1, 0.45));
    for (let i = 0; i < 7; i++) c.fillRect(sx - sr - 2, sy + 4 + i * 20, 2 * sr + 4, 3 + i * 1.8, C.sky2);
    // the skyline: a far row in haze, a near row, lit windows
    [[C.city2, 0.18, 0.30, 3, 0.10], [C.city, 0.10, 0.24, 11, 0.24]].forEach((row) => {
        let x = -10, k = row[3];
        while (x < w) {
            const bw = 46 + rnd(k, 1) * 84, bh = h * (row[1] + rnd(k, 2) * row[2]), by = h - bh;
            c.fillRect(x, by, bw, bh, row[0]);
            if (rnd(k, 3) < 0.3) c.fillRect(x + bw * 0.45, by - 22, 3, 22, row[0]);
            if (rnd(k, 4) < 0.25) c.quad([[x, by], [x + bw / 2, by - 18], [x + bw / 2, by - 18], [x + bw, by]], row[0]);
            for (let wy = by + 10; wy < h - 8; wy += 15) for (let wx = x + 7; wx < x + bw - 9; wx += 13) if (rnd(wx * 0.37 + k, wy * 0.13) < row[4]) c.fillRect(wx, wy, 5, 7, withAlpha(C.win, 0.45 + 0.45 * rnd(wx, wy)));
            x += bw + 3 + rnd(k, 5) * 10; k++;
        }
    });
    // palms in front
    palm(c, w * 0.30, h, h * 0.62, 1, C.palm);
    palm(c, w * 0.84, h, h * 0.70, -1, C.palm);
    palm(c, w * 0.995, h, h * 0.55, -1, C.palm);
}
/* what the speed does to the scene (set by draw, read by the background) */
const MOTION = { stars: 0, at: 0 };
function background(cv, t, reach) {
    const now = Date.now();
    cv.blit(G.layer('gs-hs-city|' + reach, 1600, reach, (c) => city(c, 1600, reach)), 0, 0);
    const stars = now - MOTION.at < 1500 ? MOTION.stars : 0;
    if (stars >= 3) {                                                     // searchlights sweeping the sky
        [[420, 0.7], [1180, 1.1]].forEach((b, i) => {
            const a = Math.sin(now / 1000 * b[1] + i * 2) * 0.5 - Math.PI / 2, x0 = b[0], y0 = reach * 0.8, len = 900;
            const l = [x0 + Math.cos(a - 0.06) * len, y0 + Math.sin(a - 0.06) * len], r = [x0 + Math.cos(a + 0.06) * len, y0 + Math.sin(a + 0.06) * len];
            cv.quad([[x0, y0], l, r, [x0, y0]], withAlpha('#fff6d0', 0.10));
        });
    }
}

/* ---------------- the HUD ---------------- */
function geo(S) {
    const R = Math.min(150, (S.h - 40) / 2 - 20);
    return { R, cx: S.x + 30 + R, cy: S.y + S.h - R - 22, rx: S.x + S.w, top: S.y + 6, bottom: S.y + S.h };
}
const A0 = -135, A1 = 135;
/** the radar: a dark disc, streets scrolling down past the car's arrow, a few blips, N on the rim; the rpm as a ring */
let travel = 0, lastAt = 0;
function radar(cv, S, g, now) {
    const R = g.R, cx = g.cx, cy = g.cy, mph = isNum(S.mph) ? S.mph : 0;
    const dt = lastAt ? clamp((now - lastAt) / 1000, 0, 0.25) : 0; lastAt = now;
    travel = (travel + dt * (4 + mph * 1.1)) % 100000;
    cv.blit(G.layer(['gs-hs-rad', R].join('|'), 2 * R + 60, 2 * R + 60, (c) => {
        const x = R + 30, y = R + 30;
        c.circle(x, y, R + 22, withAlpha(C.black, 0.55));
        c.circle(x, y, R, C.map);
    }, cv.textScale), cx - R - 30, cy - R - 30);
    const half = (d) => Math.sqrt(Math.max(0, R * R - d * d)) - 2;
    // cross streets every 70 px, scrolling down; the car's avenue straight up the middle, a side avenue
    const off = travel % 70;
    for (let k = -3; k <= 3; k++) { const yy = cy - 210 + k * 70 + off + 210 - 210; const d = yy - cy; if (Math.abs(d) < R - 4) { const hw = half(d); cv.fillRect(cx - hw, yy - 4, 2 * hw, 8, C.road); } }
    [[0, 18, C.road2], [-92, 9, C.road], [96, 9, C.road]].forEach((av) => { const hh = half(av[0]); cv.fillRect(cx + av[0] - av[1] / 2, cy - hh, av[1], 2 * hh, av[2]); });
    // blips: they come down the map as the car drives
    [[C.yellow, -92, 0.2], [C.blue, 96, 0.55], [C.green, 0, 0.85]].forEach((b) => {
        const yy = cy - R + ((travel * 0.7 + b[2] * 2 * R) % (2 * R)), d = Math.hypot(b[1], yy - cy);
        if (d < R - 10) { cv.circle(cx + b[1], yy, 8, C.black); cv.circle(cx + b[1], yy, 6, b[0]); }
    });
    // the car: a white arrow, black outlined
    cv.quad([[cx, cy - 18], [cx + 13, cy + 14], [cx, cy + 7], [cx - 13, cy + 14]], C.black);
    cv.quad([[cx, cy - 13], [cx + 9, cy + 10], [cx, cy + 4], [cx - 9, cy + 10]], C.white);
    // N on the rim
    cv.circle(cx, cy - R, 12, C.black); out(cv, 'N', cx, cy - R + 6, 16, C.white, TXT, { align: 'center' }, 1);
    // the rpm ring: green, yellow over the shift lights, red past the shift point
    const A = (v) => A0 + (A1 - A0) * clamp(v / S.maxRpm, 0, 1), lo = S.shift - S.range;
    cv.arc(cx, cy, R + 6, R + 18, A0, A1, withAlpha(C.black, 0.6));
    if (isNum(S.rpm)) {
        const rpm = G.smooth('gs-hs-rpm', S.rpm, 14), a = A(rpm);
        const col = S.strobe ? (S.blink ? C.red : withAlpha(C.red, 0.4)) : rpm >= S.shift ? C.red : rpm >= lo ? C.yellow : C.green;
        if (a > A0 + 0.5) cv.arc(cx, cy, R + 8, R + 16, A0, a, col);
    }
    for (let v = 1000; v < S.maxRpm; v += 1000) L.tick(cv, cx, cy, R + 6, R + 18, A(v), 2, C.black);
    out(cv, L.rpmText(S.rpm), cx, cy + R + 6, 20, S.strobe ? C.red : C.white, NUM, { align: 'center' }, 2);
}
/** a five-point star */
function star(cv, x, y, r, col, edge) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    for (let i = 0; i < 5; i++) cv.quad([[x, y], pts[(i * 2 + 9) % 10], pts[i * 2], pts[i * 2 + 1]], col);
    cv.circle(x, y, r * 0.42, col);
    if (edge) cv.polyline(pts.concat([pts[0]]), 2, edge);
}
/** stars for the speed (mph): none under 35, one more every 15 mph, five at 95 and over */
const wanted = (mph) => (isNum(mph) && mph >= 35 ? clamp(Math.floor((mph - 35) / 15) + 1, 0, 5) : 0);
function card(cv, x, y, w, h) { cv.roundRect(x, y, w, h, 6, withAlpha(C.panel, 0.82)); }
function stats(cv, S, x, y, w, h) {
    card(cv, x, y, w, h);
    cv.fillRect(x, y, w, 40, C.black);
    cv.text('STATS', x + 18, y + 29, 22, C.white, { font: TXT, spacing: 2, literal: true });
    const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
    [['G-force now', tot == null ? '-.--' : tot.toFixed(2) + ' g'], ['Best launch', S.peak.acc.toFixed(2) + ' g'], ['Hardest braking', S.peak.brk.toFixed(2) + ' g'], ['Fastest corner', S.peak.lat.toFixed(2) + ' g'], ['Time on the road', L.clock(S.session)]].forEach((r, i) => {
        const ry = y + 50 + i * 42;
        if (i % 2 === 0) cv.fillRect(x + 6, ry, w - 12, 38, withAlpha('#ffffff', 0.05));
        cv.text(r[0], x + 18, ry + 26, 20, C.dim, { font: TXT, literal: true });
        cv.text(r[1], x + w - 18, ry + 27, 22, C.white, { font: NUM, align: 'right', literal: true });
    });
    L.sessionTap(cv, S, x + 6, y + 50 + 4 * 42, w - 12, 38, C.green, 4);
}
/** the subtitle: what the moment calls for */
function subtitle(S, stars) {
    const lo = S.shift - S.range;
    if (S.strobe) return 'Shift up!';
    if (stars >= 4) return 'Lose the heat.';
    if (isNum(S.rpm) && S.rpm >= lo) return 'Almost there...';
    if (stars >= 1) return 'Keep it moving.';
    return isNum(S.mph) && S.mph > 2 ? 'Cruise the city.' : 'Get rolling.';
}

module.exports = {
    id: 'heist',
    name: 'Heist',
    blurb: 'An open-world crime game: a sunset city, a radar, wanted stars that climb with the speed',
    palette,
    ui: { txt: TXT, num: NUM, size: 20, spacing: 1, upper: false, radius: 6, nameFont: TXT, nameSize: 30 },
    badgeLetter: '#ffffff',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) { cv.roundRect(x, y, w, h, 6, withAlpha(C.panel, 0.72)); if (on) cv.strokeRoundRect(x, y, w, h, 6, 2, C.green); },
    cardBg(cv, t, x, y, w, h) {
        cv.gradientRect(x, y, w, h, [[0, C.sky0], [0.45, C.sky1], [0.8, C.sky2], [1, C.sky3]]);
        cv.circle(x + w * 0.5, y + h * 0.7, w * 0.3, C.sun0);
        for (let i = 0; i < 8; i++) { const bw = w / 8; cv.fillRect(x + i * bw, y + h * (0.62 + 0.18 * rnd(i, 9)), bw - 2, h, C.city); }
    },
    panelPlate(cv, t, x, y, w, h) { card(cv, x, y, w, h); },
    gButton(cv, t, r, lit, down) {
        cv.roundRect(r.x + 10, r.y + 12, r.w - 20, r.h - 24, 6, withAlpha(C.panel, down ? 0.6 : 0.8));
        if (lit || down) cv.strokeRoundRect(r.x + 10, r.y + 12, r.w - 20, r.h - 24, 6, 2, C.green);
        const h = 22, bw = L.badgeWidth(h);
        L.badge(cv, r.x + (r.w - bw) / 2, r.y + (r.h + h) / 2, h, '#ffffff');
    },
    /** The gallery card: a radar with its arrow, three stars, a big number */
    swatch(cv, t, x, y, w, h) {
        const n = Math.min(w, h), sr = n * 0.08, gap = sr * 2.5;
        for (let i = 0; i < 3; i++) star(cv, x + w / 2 + (i - 1) * gap, y + sr + 8, sr, C.white, C.black);
        out(cv, '88', x + w / 2, y + h * 0.66, Math.round(n * 0.42), C.white, BIG, { align: 'center' }, 2);
        const R = n * 0.13, cx = x + R + 10, cy = y + h - R - 2;
        cv.circle(cx, cy, R + 4, C.black); cv.circle(cx, cy, R, C.map); cv.arc(cx, cy, R + 1, R + 4, -135, 60, C.green);
        cv.fillRect(cx - 2.5, cy - R, 5, 2 * R, C.road2); cv.fillRect(cx - R, cy - 2, 2 * R, 4, C.road);
        cv.quad([[cx, cy - 7], [cx + 5, cy + 6], [cx, cy + 3], [cx - 5, cy + 6]], C.white);
    },

    panelRect(S) { return { x: S.x + 560, y: S.y + 20, w: 430, h: 280 }; },

    draw(cv, S) {
        const now = Date.now(), g = geo(S), mph = isNum(S.mph) ? S.mph : S.imperial ? S.speed : isNum(S.speed) ? S.speed / 1.609344 : null;
        const stars = wanted(mph);
        MOTION.stars = stars; MOTION.at = now;
        // four stars and up: red and blue lights pulsing at the page's edges
        if (stars >= 4) {
            const ph = Math.floor(now / 250) % 2;
            for (let i = 0; i < 10; i++) {
                const a = 0.3 * (1 - i / 10) * (1 - i / 10);
                cv.fillRect(S.x - 12 + i * 12, S.y - 6, 12, S.h + 12, withAlpha(ph ? C.red : C.blue, a));
                cv.fillRect(S.x + S.w + 12 - (i + 1) * 12, S.y - 6, 12, S.h + 12, withAlpha(ph ? C.blue : C.red, a));
            }
        }
        radar(cv, S, g, now);
        // fluids beside the radar: green (coolant) and blue (oil) bars
        [['ENGINE', S.cool, C.green], ['OIL', S.oil, C.blue]].forEach((r, i) => {
            const x = g.cx + g.R + 56, y = g.bottom - 92 + i * 40, w = 320, zg = L.tempGauge(r[1], { cold: C.blue, ok: r[2], hot: C.red }, '#333', 0.35);
            cv.fillRect(x - 2, y - 2, w + 4, 16, C.black); cv.fillRect(x, y, w, 12, withAlpha(r[2], 0.25));
            if (zg.on) cv.fillRect(x, y, w * zg.pos, 12, zg.on);
            out(cv, r[0] + '  ' + L.tempText(r[1]), x, y - 6, 16, C.white, TXT, null, 1.5);
        });
        // top right: the gear box, the speed, the wanted stars
        const rx = g.rx - 10;
        card(cv, rx - 190, g.top + 6, 190, 120);
        cv.text('GEAR', rx - 172, g.top + 32, 16, C.dim, { font: TXT, spacing: 2, literal: true });
        const gs = L.gearFit(cv, S.gearText, 96, 150, { font: BIG, spacing: 0 });
        out(cv, S.gearText, rx - 95, g.top + 112, gs, S.strobe && S.blink ? C.red : C.white, BIG, { align: 'center' }, 3);
        if (S.mode) out(cv, S.mode, rx - 200, g.top + 112, 18, S.modeTone === 'sport+' || S.modeTone === 'track' ? C.red : S.modeTone === 'sport' ? C.yellow : C.white, TXT, { align: 'right' }, 1.5);
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--';
        out(cv, sp, rx, g.top + 260, 128, C.white, BIG, { align: 'right' }, 4);
        out(cv, (S.unit || 'MPH').toUpperCase(), rx, g.top + 290, 22, C.green, TXT, { align: 'right' }, 2);
        const blink = stars >= 3 && Math.floor(now / 300) % 2 === 0;
        for (let i = 0; i < 5; i++) {
            const sx = rx - 22 - (4 - i) * 46, sy = g.top + 330, on = i < stars;
            star(cv, sx, sy, 18, on ? (blink ? C.yellow : C.white) : '#4a4458', C.black);
        }
        // the subtitle
        out(cv, subtitle(S, stars), S.x + S.w * 0.58, g.bottom - 20, 26, S.strobe ? C.yellow : C.white, TXT, { align: 'center' }, 2);
        S.zones = {
            speed: { x: rx - 300, y: g.top + 150, w: 300, h: 140 }, gear: { x: rx - 190, y: g.top + 6, w: 190, h: 120 },
            toast: { x: S.x + S.w * 0.58, y: g.bottom - 70 }, chip: { x: rx - 30, y: g.top + 30 }, star: { x: rx - 240, y: g.top + 40 },
        };
        if (!S.panel || S.panel === 'g') stats(cv, S, S.x + 560, S.y + 20, 430, 270);
    },
};
