'use strict';
/**
 * Vector - clean and technical: a fine measuring grid with registration crosses, a straight tach
 * scale across the page (hairline ticks every 250 rpm, numerals on the thousands, thin segments, one
 * cursor), crisp wide numerals (Saira, width 125) inside corner brackets, data in ruled tables and a
 * reticle g-meter. Glow kept to a faint underlay on lit segments. Colour variants (tints.js
 * VARIANTS.vector): Ice (default), Motorsport (light blue / dark blue / red as colours only), Amber, White.
 * Static parts (grid, scale, brackets) are cached layers keyed by the variant. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');
const TINTS = require('./tints');

const { withAlpha, clamp, isNum } = L;
const NUM = 'gs_v_num', GEAR = 'gs_v_gear';
let TINT = '', C = TINTS.VARIANTS.vector[0].c;
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), { name: 'Vector' });
function applyTint(v) {
    if (!v || v.id === TINT) return;
    TINT = v.id; C = v.c;
    Object.assign(palette, { bg: C.bg0, panelTop: C.bg1, panelBottom: C.bg0, panelEdge: C.edge,
        track: C.track, tick: C.faint, text: C.ink, dim: C.label, accent: C.lit, accent2: C.lit2, ok: C.lit, warn: C.shift, crit: C.crit,
        cold: C.lit2, stripes: [C.lit, C.lit2, C.shift], sel: C.lit, selText: C.bg0, marker: C.shift });
}
applyTint(TINTS.VARIANTS.vector[0]);
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col, Object.assign({ font: NUM, spacing: 2, literal: true }, o || {}));

/** corner brackets (registration marks) round a box */
function brackets(cv, x, y, w, h, k, col, lw) {
    lw = lw || 1.5;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach((c) => {
        cv.fillRect(c[2] > 0 ? c[0] : c[0] - k, c[1] - (c[3] > 0 ? 0 : lw), k, lw, col);
        cv.fillRect(c[0] - (c[2] > 0 ? 0 : lw), c[3] > 0 ? c[1] : c[1] - k, lw, k, col);
    });
}
const label = (cv, idx, s, x, y, col) => { T(cv, idx, x, y, 13, C.faint, { spacing: 1 }); T(cv, s, x + 28, y, 13, col || C.label, { spacing: 3 }); };

function background(cv, t, reach) {
    cv.blit(G.layer('gs-v-bg|' + TINT + '|' + reach, 1600, reach, (c) => {
        c.gradientRect(0, 0, 1600, reach, [[0, C.bg1], [1, C.bg0]]);
        for (let x = 0; x <= 1600; x += 40) c.fillRect(x, 0, 1, reach, withAlpha(C.grid, x % 160 ? 0.55 : 1));
        for (let y = 0; y <= reach; y += 40) c.fillRect(0, y, 1600, 1, withAlpha(C.grid, y % 160 ? 0.55 : 1));
        for (let x = 160; x < 1600; x += 160) for (let y = 160; y < reach; y += 160) { c.fillRect(x - 5, y, 11, 1, C.faint); c.fillRect(x, y - 5, 1, 11, C.faint); }
        c.gradientRect(0, reach - 120, 1600, 120, [[0, withAlpha('#000000', 0)], [1, withAlpha('#000000', 0.5)]]);
    }), 0, 0);
}

function geo(S) {
    const x0 = S.x + 20, x1 = S.x + S.w - 20, top = S.y + 14, bottom = S.y + S.h - 10;
    return { x0, x1, top, bottom, scale: { x: x0 + 8, w: x1 - x0 - 16, y: top + 70 }, mid: top + 132, rx: S.x + 1080 };
}

/** The tach scale: static ticks and numerals (a layer), then the segments and the cursor. */
function tach(cv, S, g) {
    const sc = g.scale, max = S.maxRpm, X = (v) => sc.x + sc.w * clamp(v / max, 0, 1), y = sc.y;
    cv.blit(G.layer(['gs-v-tach', TINT, sc.w, max, S.redline, S.shift].join('|'), sc.w + 80, 110, (c) => {
        const ox = 40, X2 = (v) => ox + sc.w * v / max, by = 64;
        c.fillRect(ox, by, sc.w, 1, C.label);
        c.fillRect(X2(S.redline), by - 1, X2(max) - X2(S.redline), 3, withAlpha(C.crit, 0.8));
        for (let v = 0; v <= max; v += 250) {
            const maj = v % 1000 === 0, half = v % 500 === 0, red = v >= S.redline;
            c.fillRect(X2(v) - (maj ? 1 : 0.5), by - (maj ? 18 : half ? 11 : 7), maj ? 2 : 1, maj ? 18 : half ? 11 : 7, red ? C.crit : maj ? C.ink : C.label);
            if (maj) c.text(String(v / 1000), X2(v) + 6, by - 24, 26, red ? C.crit : C.ink, { font: NUM, literal: true });
        }
        // the shift point: a small notch under the line
        c.quad([[X2(S.shift) - 6, by + 12], [X2(S.shift) + 6, by + 12], [X2(S.shift), by + 4], [X2(S.shift), by + 4]], C.shift);
    }, cv.textScale), sc.x - 40, y - 64);
    // segments under the line: 2 px gaps, lit up to the rpm
    const rpm = isNum(S.rpm) ? G.smooth('gs-v-rpm', S.rpm, 14) : 0, n = 96, sw = sc.w / n, sy = y + 14, sh = 26, lo = S.shift - S.range;
    const ov = S.strobe;
    let lit = 0;
    for (let i = 0; i < n; i++) {
        const v0 = max * i / n, on = v0 < rpm;
        // the shift band as every look (and the HUD) has it: the shift lights' range (S.range, 2000 rpm) before the
        // shift point in the shift colour, from the shift point on the critical colour (0.14.0; was the shift colour to redline)
        let c = v0 >= S.shift ? C.crit : v0 >= lo ? C.shift : L.mix(C.lit2, C.lit, Math.min(1, v0 / lo));
        if (ov) c = S.blink ? C.crit : withAlpha(C.crit, 0.35);
        if (on) lit = i + 1;
        cv.fillRect(sc.x + i * sw + 1, sy, sw - 2, sh, on ? c : withAlpha(v0 >= S.redline ? C.crit : C.lit, v0 >= S.redline ? 0.10 : 0.06));
    }
    if (lit) cv.fillRect(sc.x, sy + sh + 3, lit * sw - 1, 2, withAlpha(ov || rpm >= S.shift ? C.crit : rpm >= lo ? C.shift : C.lit, 0.35));
    T(cv, 'x1000 r/min', sc.x + sc.w, sy + sh + 24, 13, C.label, { align: 'right', spacing: 3 });
    // the cursor: a hairline through the scale, its readout above
    if (isNum(S.rpm)) {
        const cx = X(rpm);
        cv.fillRect(cx - 0.5, y - 28, 1, 70, C.ink);
        cv.quad([[cx - 5, y + 46], [cx + 5, y + 46], [cx, y + 40], [cx, y + 40]], C.ink);
    }
}

/** Oil / coolant: a ruled row, a thin zoned scale with ticks, a marker */
const ZONES = () => ({ cold: C.lit2, ok: C.lit, hot: C.crit });
function fluid(cv, x, y, w, idx, name, v) {
    const zg = L.tempGauge(v, ZONES(), C.track, 0.35), mk = L.zoneMarks(v);
    label(cv, idx, name, x, y);
    T(cv, L.tempText(v), x + w, y + 4, 30, zg.on ? (zg.zone === 'ok' ? C.ink : zg.on) : C.label, { align: 'right', spacing: 1 });
    const ty = y + 22;
    cv.fillRect(x, ty, w, 1, C.faint);
    [[0, mk[0], 'cold'], [mk[0], mk[1], 'ok'], [mk[1], 1, 'hot']].forEach((z) => cv.fillRect(x + w * z[0], ty + 3, w * (z[1] - z[0]) - 2, 3, withAlpha(zg.C[z[2]], 0.25)));
    for (let i = 0; i <= 10; i++) cv.fillRect(x + w * i / 10, ty - (i % 5 ? 3 : 6), 1, i % 5 ? 3 : 6, C.label);
    if (zg.on) { const px = x + w * zg.pos; cv.fillRect(x, ty + 3, px - x, 3, zg.on); cv.fillRect(px - 1, ty - 8, 2, 18, C.ink); }
}

function reticle(cv, S, cx, cy, r) {
    const max = S.gMax;
    cv.blit(G.layer(['gs-v-gm', TINT, r, max].join('|'), 2 * r + 40, 2 * r + 40, (c) => {
        const x = r + 20, y = r + 20;
        for (let q = 0.5; q <= max + 1e-6; q += 0.5) { const rr = q / max * r; c.arc(x, y, rr - 0.5, rr + 0.5, 0, 360, q % 1 === 0 ? C.label : C.faint); }
        c.fillRect(x - r - 10, y, 2 * r + 20, 1, C.faint); c.fillRect(x, y - r - 10, 1, 2 * r + 20, C.faint);
        for (let a = 0; a < 360; a += 15) L.tick(c, x, y, r + 2, r + (a % 90 ? 6 : 12), a, 1, a % 90 ? C.faint : C.ink);
    }, cv.textScale), cx - r - 20, cy - r - 20);
    const P = (lat, lon) => [cx + clamp(lat / max, -1.05, 1.05) * r, cy - clamp(lon / max, -1.05, 1.05) * r];
    S.trail.forEach((p, i) => { if (isNum(p[0]) && isNum(p[1])) { const q = P(p[0], p[1]); cv.fillRect(q[0] - 1, q[1] - 1, 2, 2, withAlpha(C.lit, 0.1 + 0.5 * i / S.trail.length)); } });
    const lat = G.smooth('gs-v-lat', S.gLat, 12), lon = G.smooth('gs-v-lon', S.gLong, 12);
    if (isNum(lat) && isNum(lon)) {
        const q = P(lat, lon);
        cv.fillRect(q[0] - 14, q[1], 9, 1.5, C.ink); cv.fillRect(q[0] + 6, q[1], 9, 1.5, C.ink);
        cv.fillRect(q[0], q[1] - 14, 1.5, 9, C.ink); cv.fillRect(q[0], q[1] + 6, 1.5, 9, C.ink);
        cv.circle(q[0] + 0.75, q[1] + 0.75, 3, C.lit);
    }
}

module.exports = {
    id: 'vector',
    name: 'Vector',
    blurb: 'Technical: a measuring grid, a straight tach scale, crisp numerals; four colours',
    palette,
    tints: TINTS.VARIANTS.vector,
    applyTint,
    ui: { txt: NUM, num: NUM, size: 18, spacing: 2, upper: true, radius: 2, nameFont: NUM, nameSize: 28 },
    badgeLetter: '#ffffff',

    background(cv, t, reach) { background(cv, t, reach); },
    card(cv, t, x, y, w, h, on) {
        cv.fillRect(x, y, w, h, withAlpha(C.bg0, 0.82));
        cv.strokeRoundRect(x, y, w, h, 2, 1, on ? C.lit : C.edge);
        brackets(cv, x - 3, y - 3, w + 6, h + 6, 12, on ? C.ink : C.label, 1.5);
    },
    cardBg(cv, t, x, y, w, h) {
        cv.gradientRect(x, y, w, h, [[0, C.bg1], [1, C.bg0]]);
        for (let gx = 0; gx <= w; gx += 20) cv.fillRect(x + gx, y, 1, h, withAlpha(C.grid, 0.9));
        for (let gy = 0; gy <= h; gy += 20) cv.fillRect(x, y + gy, w, 1, withAlpha(C.grid, 0.9));
    },
    panelPlate(cv, t, x, y, w, h) { cv.fillRect(x, y, w, h, withAlpha(C.bg0, 0.85)); cv.strokeRoundRect(x, y, w, h, 2, 1, C.edge); brackets(cv, x - 3, y - 3, w + 6, h + 6, 12, C.label); },
    gButton(cv, t, r, lit, down) {
        cv.fillRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16, withAlpha(C.bg0, down ? 0.6 : 0.9));
        brackets(cv, r.x + 8, r.y + 8, r.w - 16, r.h - 16, 10, lit || down ? C.lit : C.label, 1.5);
        const h = 26, bw = L.badgeWidth(h);
        L.badge(cv, r.x + (r.w - bw) / 2, r.y + (r.h + h) / 2, h, '#ffffff');
    },

    /** The gallery card: a short tach scale with its cursor and a bracketed numeral. */
    swatch(cv, t, x, y, w, h) {
        const sx = x + 20, sw = w - 40, by = y + 34, n = 24;
        cv.fillRect(sx, by, sw, 1, C.label);
        for (let i = 0; i <= 8; i++) cv.fillRect(sx + sw * i / 8 - 0.5, by - (i % 2 ? 5 : 10), 1, i % 2 ? 5 : 10, i >= 7 ? C.crit : C.ink);
        for (let i = 0; i < n; i++) { const f = i / n; cv.fillRect(sx + sw * f + 0.5, by + 6, sw / n - 1.5, 12, f < 0.62 ? L.mix(C.lit2, C.lit, f / 0.62) : f < 0.66 ? C.shift : withAlpha(C.lit, 0.08)); }
        cv.fillRect(sx + sw * 0.66, by - 14, 1, 38, C.ink);
        brackets(cv, x + w / 2 - 54, y + h * 0.52, 108, 62, 10, C.label, 1.5);
        T(cv, '88', x + w / 2, y + h * 0.52 + 52, 52, C.ink, { align: 'center', spacing: 1 });
    },

    panelRect(S) { const g = geo(S); return { x: g.rx + 10, y: g.mid - 6, w: g.x1 - g.rx - 10, h: g.bottom - g.mid - 78 }; },

    draw(cv, S) {
        const g = geo(S), lo = S.shift - S.range, hot = isNum(S.rpm) && S.rpm >= lo && !S.strobe;
        tach(cv, S, g);
        T(cv, L.rpmText(S.rpm), g.x0 + 8, g.top + 4 + 14, 22, S.strobe ? C.crit : hot ? C.shift : C.ink, { spacing: 1 });
        T(cv, 'RPM', g.x0 + 8 + cv.textWidth(L.rpmText(S.rpm), 22, { font: NUM, spacing: 1, literal: true }) + 10, g.top + 18, 13, C.label, { spacing: 3 });
        // speed: the hero, bracketed
        const sy = g.mid + 8, sh = g.bottom - sy - 96, sx = g.x0 + 8, swd = 470;
        label(cv, '01', 'SPEED', sx, sy + 16);
        brackets(cv, sx, sy + 28, swd, sh - 28, 18, C.label);
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--', big = Math.min(200, sh - 40);
        T(cv, sp, sx + swd - 24, sy + 28 + (sh - 28) / 2 + big * 0.36, big, C.ink, { align: 'right', spacing: 0 });
        T(cv, (S.unit || 'MPH').toUpperCase(), sx + 22, sy + sh - 18, 15, C.label, { spacing: 4 });
        // gear: a square frame, ticks on its edges
        const gx = sx + swd + 34, gw = 250;
        label(cv, '02', 'GEAR', gx, sy + 16);
        if (S.guessed) T(cv, 'EST', gx + gw, sy + 16, 13, C.label, { align: 'right', spacing: 3 });
        const gcol = S.strobe ? (S.blink ? C.crit : C.ink) : hot ? C.shift : C.ink;
        cv.strokeRoundRect(gx, sy + 28, gw, sh - 28, 2, 1, hot || S.strobe ? gcol : C.edge);
        brackets(cv, gx, sy + 28, gw, sh - 28, 18, hot || S.strobe ? gcol : C.label);
        for (let i = 1; i < 10; i++) cv.fillRect(gx + gw * i / 10, sy + 28, 1, i % 5 ? 4 : 8, C.faint);
        const gs = L.gearFit(cv, S.gearText, Math.min(220, sh - 50), gw - 40, { font: GEAR, spacing: 0 });     // 0.14.1: DS / M3 fit the box
        T(cv, S.gearText, gx + gw / 2, sy + 28 + (sh - 28) / 2 + gs * 0.36, gs, gcol, { font: GEAR, align: 'center', spacing: 0 });
        if (S.mode) {
            const tw = cv.textWidth(S.mode, 14, { font: NUM, spacing: 3, literal: true }), mc = S.modeTone === 'sport+' || S.modeTone === 'track' ? C.crit : S.modeTone === 'sport' ? C.shift : C.label;
            cv.strokeRoundRect(gx + gw - tw - 28, sy + sh - 36, tw + 20, 26, 2, 1, mc);
            T(cv, S.mode, gx + gw - 18, sy + sh - 17, 14, mc, { align: 'right', spacing: 3 });
        }
        // fluids: under the speed and the gear
        const fy = g.bottom - 52;
        fluid(cv, sx, fy, swd, '03', 'OIL', S.oil);
        fluid(cv, gx, fy, gw, '04', 'COOLANT', S.cool);
        S.zones = {
            speed: { x: sx, y: sy + 28, w: swd, h: sh - 28 }, gear: { x: gx, y: sy + 28, w: gw, h: sh - 28 },
            toast: { x: sx + swd / 2, y: sy + sh - 40 }, chip: { x: gx + gw - 26, y: sy + 50 }, star: { x: sx + 140, y: sy + 16 },
        };
        if (S.panel === 'spotify') return;
        // right: the reticle and a ruled table of peaks
        const px = g.rx + 10, pw = g.x1 - px, py = g.mid - 6, ph = g.bottom - py - 78;
        label(cv, '05', 'G-FORCE', px, sy + 16);
        const r = Math.min(98, (ph - 60) / 2), cx = px + 20 + r, cy = sy + 28 + (sh - 28) / 2 + 20;
        reticle(cv, S, cx, cy, r);
        const tx = cx + r + 40, tw = px + pw - tx;
        const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
        [['G NOW', tot == null ? '-.--' : tot.toFixed(2), C.ink], ['ACCEL', S.peak.acc.toFixed(2), C.lit], ['BRAKE', S.peak.brk.toFixed(2), C.shift], ['LATERAL', S.peak.lat.toFixed(2), C.lit]].forEach((p, i) => {
            const y = sy + 34 + i * 54;
            cv.fillRect(tx, y + 44, tw, 1, C.faint);
            T(cv, p[0], tx, y + 34, 13, C.label, { spacing: 3 });
            T(cv, p[1], tx + tw, y + 38, 30, p[2], { align: 'right', spacing: 1 });
        });
        const ssy = g.bottom - 52;
        label(cv, '06', 'SESSION', px, ssy);
        T(cv, L.clock(S.session), px, ssy + 34, 30, C.ink, { spacing: 1 });
        L.sessionTap(cv, S, px - 6, ssy - 20, 200, 66, C.lit, 2);
    },
};
