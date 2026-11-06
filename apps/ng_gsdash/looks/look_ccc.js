'use strict';
/**
 * iDrive CCC - the dash as the first iDrive's start screen (the 2003-era CCC head unit), redrawn from
 * scratch: no picture, logo or file of the car maker's is used. A cross of taupe tiles on black - one
 * above, one below and one each side of a silver centre button, ribbed tiles in the corners - with the
 * four coloured chevrons round the button (blue up, green right, red left, orange down), white type in
 * a Helvetica-like sans, and the status bar under it.
 *
 * What each place shows: the tile above, the speed; the one below, the rpm (the tile fills with the
 * revs, amber over the shift lights, red past the shift point); left, oil and coolant; right, the
 * g-force now with the session peaks on the ribbed tiles beside it (the right panel: Spotify or the
 * Logo take that column instead); the centre button, the gear in the serif type of its "i" (the "i"
 * itself with no gear). The chevrons flash at the shift point. The status bar: the drive mode where
 * the radio's frequency sat, the speaker mark, the time and the date. Liberation Sans / Serif (SIL OFL,
 * Arial / Times metrics), baked as gs_c_*. Static parts (the tiles, the button) are cached layers.
 * Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');
const CLOCK = new (require('./clock').Clock)();

const { withAlpha, clamp, isNum } = L;
const TXT = 'gs_c_txt', REG = 'gs_c_reg', SER = 'gs_c_ser';
/* the screen's colours, measured off a photo of one (away from its glare): cool lavender-grey tiles, the
   middle column a shade lighter, lavender-grey ribs, a blue-tinted silver button, near-white type */
const C = {
    bg: '#000000', face: '#756f79', mid: '#7f7c8c', top0: '#837f8e', top1: '#7a7686', bot0: '#837f8e', bot1: '#7a7686', glare: '#d6e4ff',
    rib: ['#837a82', '#7f767e', '#786f77', '#6d656c', '#645d64', '#6a636a', '#736b73', '#7c747c'],
    line: '#2f2e3d', hi: '#c5cffe', text: '#f8fcfd', shadow: '#2a2a38', bar: '#030403', sep: '#505468',
    groove: '#8a9bb2', rim: '#4c546c', blue: '#20a2fd', green: '#38b087', red: '#e62d4b', orange: '#f5ab7a',
    amber: '#f5ab7a', crit: '#e62d4b',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'iDrive CCC',
    bg: C.bg, panelTop: C.top0, panelBottom: C.face, panelEdge: C.hi,
    track: '#4c4a5a', tick: '#828194', text: C.text, dim: '#d4d8ea',
    accent: C.blue, accent2: C.orange, ok: C.green, warn: C.orange, crit: C.red, cold: C.blue,
    stripes: [C.blue, C.green, C.red], sel: '#dfe6ff', selText: '#2a2a38', marker: C.orange,
});
/** white type with the screen's soft dark shadow */
const T = (cv, s, x, y, size, col, font, o) => {
    const f = Object.assign({ font: font || TXT, literal: true }, o || {});
    cv.text(s, x + 1.5, y + 1.5, size, withAlpha(C.shadow, 0.8), f);
    return cv.text(s, x, y, size, col || C.text, f);
};

/* ---------------- the screen's parts ---------------- */
function geo(S) {
    const th = Math.round(S.h * 0.85), x = S.x, w = S.w;
    const cx = [x, x + Math.round(w * 0.3264), x + Math.round(w * 0.6717), x + w];
    const ry = [S.y, S.y + Math.round(th * 0.33), S.y + Math.round(th * 0.673), S.y + th];
    const ccx = (cx[1] + cx[2]) / 2, ccy = (ry[1] + ry[2]) / 2, R = Math.round((ry[2] - ry[1]) * 0.7);
    return { cx, ry, ccx, ccy, R, sy: S.y + th + 6, sh: S.h - th - 6 };
}
/** a tile's bevel: a light line top and left, a dark one bottom and right */
function bevel(c, x, y, w, h) {
    c.fillRect(x, y, w, 2, withAlpha(C.hi, 0.7)); c.fillRect(x, y, 2, h, withAlpha(C.hi, 0.45));
    c.fillRect(x, y + h - 2, w, 2, withAlpha(C.line, 0.9)); c.fillRect(x + w - 2, y, 2, h, withAlpha(C.line, 0.9));
}
/** the ribs: a soft light-to-dark wave every 8 px */
function ribbed(c, x, y, w, h) {
    for (let yy = 0; yy < h; yy++) c.fillRect(x, y + yy, w, 1, C.rib[yy % 8]);
    c.fillRect(x, y, w, 1, withAlpha('#000000', 0.5)); c.fillRect(x, y + h - 1, w, 1, withAlpha('#000000', 0.5));
}
function flat(c, x, y, w, h, col) { c.fillRect(x, y, w, h, col || C.face); bevel(c, x, y, w, h); }
function raised(c, x, y, w, h, a, b) { c.gradientRect(x, y, w, h, [[0, a], [1, b]]); bevel(c, x, y, w, h); }
/*
 * The glare: the photo of the screen this look is matched to has a cool sheen across it - bright on the
 * right of the tile above the button and the left of the one below, a halo either side of the button.
 * Each tile's share of it across its width, as [position 0..1, strength 0..1] (measured off the photo),
 * drawn as a fade from side to side in a pale blue.
 */
const GLARE = {
    '1,0': [[0, 0.03], [0.25, 0.24], [0.5, 0.46], [0.8, 0.64], [1, 0.62]],
    '1,1': [[0, 0.3], [0.2, 0.3], [0.8, 0.25], [1, 0.1]],
    '1,2': [[0, 0.26], [0.1, 0.44], [0.3, 0.38], [0.45, 0.25], [0.6, 0.12], [0.8, 0.05], [1, 0]],
    '0,1': [[0, 0], [0.3, 0.06], [0.55, 0.13], [0.77, 0.23], [0.92, 0.32], [1, 0.37]],
    '2,1': [[0, 0.22], [0.15, 0.15], [0.35, 0.1], [0.6, 0.07], [1, 0]],
};
function glareAt(pts, u) {
    for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const a = pts[i - 1], b = pts[i], t = (u - a[0]) / (b[0] - a[0] || 1); return a[1] + (b[1] - a[1]) * t; }
    return pts[pts.length - 1][1];
}
function glare(c, x, y, w, h, pts) {
    const N = 13, stops = [];
    for (let i = 0; i < N; i++) stops.push(withAlpha(C.glare, glareAt(pts, i / (N - 1))));
    c.rampRect(x, y, w, h, 0, stops, x, w);
}
/** the tiles (page px relative to the layer at S.x, S.y); right: false leaves the right column to a panel */
function tiles(c, g, S, right) {
    const X = (v) => v - S.x, Y = (v) => v - S.y, cx = g.cx, ry = g.ry;
    c.fillRect(0, 0, S.w, g.ry[3] - S.y, C.bg);
    const cols = right ? [0, 1, 2] : [0, 1];
    cols.forEach((col) => [0, 1, 2].forEach((row) => {
        const x = X(cx[col]) + 1, y = Y(ry[row]) + 1, w = cx[col + 1] - cx[col] - 2, h = ry[row + 1] - ry[row] - 2;
        if (col !== 1 && row !== 1) ribbed(c, x, y, w, h);
        else if (col === 1 && row === 0) raised(c, x, y, w, h, C.top0, C.top1);
        else if (col === 1 && row === 2) raised(c, x, y, w, h, C.bot0, C.bot1);
        else flat(c, x, y, w, h, col === 1 ? C.mid : C.face);
        const gl = GLARE[col + ',' + row];
        if (gl) glare(c, x + 2, y + 2, w - 4, h - 4, gl);
    }));
}
/** a silver disc lit from above: offset circles, each a little lighter, rising inside the last */
function disc(c, x, y, R, cols) {
    const steps = [[0, 1], [0.05, 0.95], [0.13, 0.86], [0.24, 0.73], [0.36, 0.58]];
    cols.forEach((col, i) => { const st = steps[i]; c.circle(x, y - st[0] * R, st[1] * R, col); });
}
const SILVER = ['#a4b8d8', '#b8c8de', '#c9d5e2', '#dbe9f2', '#eafefe'];
const SILVER_IN = ['#e2f2fb', '#cbd8e8', '#b6c6dc', '#a6b7d4', '#a0b1d2'];
/** the silver centre button (its own layer, centre at (o, o)) */
function button(c, R) {
    const o = R + 6;
    c.circle(o, o + 3, R + 2, withAlpha('#000000', 0.45));
    c.circle(o, o, R + 1, C.rim);
    disc(c, o, o, R, SILVER);
    const r1 = R * 0.74, r2 = R * 0.56;
    // the groove, the raised inner disc (lit from below: it is dished), the ring round the "i"
    c.arc(o, o, r1, r1 + 3, 0, 360, C.groove);
    c.arc(o, o, r1 + 3, r1 + 4.5, 0, 360, withAlpha('#ffffff', 0.5));
    c.circle(o, o, r1, '#c1ced8');
    [[0, 1, '#9fb0cc'], [-0.05, 0.95, '#b2c2da'], [-0.12, 0.86, '#c4d2e2'], [-0.2, 0.76, '#d2e0ec']].forEach((st) => c.circle(o, o + st[0] * r1 * -1, st[1] * r1, st[2]));
    c.arc(o, o, r2, r2 + 3, 0, 360, '#8492ab');
    c.arc(o, o, r2 + 3, r2 + 4.5, 0, 360, withAlpha('#daf2fd', 0.75));
    disc(c, o, o, r2, ['#8492ab', '#93a3c0', '#a0b1d2', '#acbdda', '#b6c6e0']);
}
/** a glossy chevron pointing dir ('u', 'd', 'l', 'r') at (x, y), size s */
function chevron(cv, x, y, s, dir, col, lit) {
    const t = s * 0.5, P = (a, b) => (dir === 'u' ? [x + a, y + b] : dir === 'd' ? [x + a, y - b] : dir === 'l' ? [x + b, y + a] : [x - b, y + a]);
    const tip = P(0, -s * 0.5), l0 = P(-s, s * 0.5), l1 = P(-s + t * 1.2, s * 0.5), r0 = P(s, s * 0.5), r1 = P(s - t * 1.2, s * 0.5), in0 = P(0, -s * 0.5 + t * 1.15);
    const sh = (p) => [p[0] + 1.5, p[1] + 2];
    [[l0, tip, in0, l1], [tip, r0, r1, in0]].forEach((q) => cv.quad(q.map(sh), withAlpha('#000000', 0.45)));
    const base = lit ? L.mix(col, '#ffffff', 0.55) : col;
    cv.quad([l0, tip, in0, l1], base); cv.quad([tip, r0, r1, in0], L.mix(base, '#000000', 0.18));
    // the gloss: a light strip along the upper edges
    const k = 0.35, mid = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    cv.quad([l0, tip, mid(tip, in0), mid(l0, l1)], withAlpha('#ffffff', 0.35));
}
/** the loudspeaker mark of the status bar, crossed out (as the screen shows it) */
function speaker(cv, x, y, col) {
    cv.fillRect(x, y - 6, 6, 12, col);
    cv.quad([[x + 6, y - 6], [x + 15, y - 13], [x + 15, y + 13], [x + 6, y + 6]], col);
    [[20, 6], [26, 11], [32, 15]].forEach((a, i) => { cv.line(x + a[0], y - a[1], x + a[0] + 3, y, 2, col); cv.line(x + a[0] + 3, y, x + a[0], y + a[1], 2, col); });
    cv.line(x + 18, y + 12, x + 34, y - 12, 2.5, col);
}
/** the date as the screen writes it: mm/dd/yyyy in mph, dd.mm.yyyy in km/h */
function dateText(us) {
    const now = Date.now(), off = -new Date(now).getTimezoneOffset(), d = new Date(now + off * 60000);
    const p = (v) => (v < 10 ? '0' : '') + v, dd = p(d.getUTCDate()), mm = p(d.getUTCMonth() + 1), yy = d.getUTCFullYear();
    return us ? mm + '/' + dd + '/' + yy : dd + '.' + mm + '.' + yy;
}
const cap = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : s);

module.exports = {
    id: 'ccc',
    name: 'iDrive CCC',
    blurb: "The first iDrive's start screen: taupe tiles, a silver centre button, four coloured arrows",
    palette,
    ui: { txt: TXT, num: TXT, size: 20, spacing: 0, upper: false, radius: 2, nameFont: TXT, nameSize: 26 },
    badgeLetter: '#ffffff',

    background(cv, t, reach) { cv.fillRect(0, 0, 1600, reach, C.bg); },
    card(cv, t, x, y, w, h, on) {
        cv.gradientRect(x, y, w, h, [[0, on ? C.bot0 : C.top0], [1, on ? C.bot1 : C.top1]]);
        cv.fillRect(x, y, w, 2, withAlpha(C.hi, 0.8)); cv.fillRect(x, y, 2, h, withAlpha(C.hi, 0.6));
        cv.fillRect(x, y + h - 2, w, 2, C.line); cv.fillRect(x + w - 2, y, 2, h, C.line);
    },
    cardBg(cv, t, x, y, w, h) {
        cv.fillRect(x, y, w, h, C.bg);
        // the cross in miniature: ribbed corners, taupe tiles, the button, the four chevrons
        const tw = w / 3, rh = (h - 54) / 3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            const xx = x + i * tw + 1, yy = y + j * rh + 1, ww = tw - 2, hh = rh - 2;
            if (i !== 1 && j !== 1) for (let k = 0; k < hh; k++) cv.fillRect(xx, yy + k, ww, 1, C.rib[k % 8]);
            else if (i === 1 && j === 0) cv.gradientRect(xx, yy, ww, hh, [[0, C.top0], [1, C.top1]]);
            else if (i === 1 && j === 2) cv.gradientRect(xx, yy, ww, hh, [[0, C.bot0], [1, C.bot1]]);
            else cv.fillRect(xx, yy, ww, hh, i === 1 ? C.mid : C.face);
        }
    },
    panelPlate(cv, t, x, y, w, h) { cv.fillRect(x, y, w, h, C.face); cv.fillRect(x, y, w, 2, withAlpha(C.hi, 0.75)); cv.fillRect(x, y + h - 2, w, 2, C.line); },
    gButton(cv, t, r, lit, down) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rr = Math.min(r.w, r.h) / 2 - 6;
        cv.circle(cx, cy + 2, rr + 1, withAlpha('#000000', 0.5));
        disc(cv, cx, cy, rr, down ? SILVER_IN : SILVER);
        if (lit) cv.arc(cx, cy, rr - 3, rr, 0, 360, C.blue);
        const bh = 20, bw = L.badgeWidth(bh);
        L.badge(cv, cx - bw / 2, cy + bh / 2, bh, '#4c546c');
    },
    /** The gallery card: the button and its four chevrons in the middle of the cross */
    swatch(cv, t, x, y, w, h) {
        const ch = 190, rh = (ch - 54) / 3, cx = x + w / 2, cy = y - 6 + rh * 1.5, R = rh * 0.72;
        cv.circle(cx, cy + 2, R + 1, withAlpha('#000000', 0.45));
        disc(cv, cx, cy, R, SILVER);
        disc(cv, cx, cy, R * 0.56, ['#8492ab', '#93a3c0', '#a0b1d2', '#acbdda', '#b6c6e0']);
        cv.arc(cx, cy, R * 0.56, R * 0.56 + 2, 0, 360, '#8492ab');
        const fi = { font: SER, align: 'center', literal: true }, iy = cy + R * 0.34, isz = Math.round(R * 1.0);
        [[-1, 0], [1, 0], [0, -1], [0, 1.5]].forEach((d) => cv.text('i', cx + d[0], iy + d[1], isz, withAlpha('#4c546c', 0.85), fi));
        cv.text('i', cx, iy, isz, '#f3fdfe', fi);
        const s = Math.max(7, R * 0.3);
        chevron(cv, cx, cy - R - s * 0.9, s, 'u', C.blue); chevron(cv, cx, cy + R + s * 0.9, s, 'd', C.orange);
        chevron(cv, cx - R - s * 0.9, cy, s, 'l', C.red); chevron(cv, cx + R + s * 0.9, cy, s, 'r', C.green);
    },

    panelRect(S) { const g = geo(S); return { x: g.cx[2] + 1, y: g.ry[0] + 1, w: g.cx[3] - g.cx[2] - 2, h: g.ry[3] - g.ry[0] - 2 }; },

    draw(cv, S) {
        const now = Date.now(), g = geo(S), cx = g.cx, ry = g.ry, own = !S.panel || S.panel === 'g';
        const flash = S.strobe && Math.floor(now / 120) % 2 === 0;
        cv.blit(G.layer(['gs-ccc-tiles', S.w, S.h, own ? 1 : 0].join('|'), S.w, g.ry[3] - S.y, (c) => tiles(c, g, S, own), cv.textScale), S.x, S.y);
        // below: the rpm, the tile filling with the revs (amber over the shift lights, red past the shift point)
        const bx = cx[1] + 3, by = ry[2] + 3, bw = cx[2] - cx[1] - 6, bh = ry[3] - ry[2] - 6;
        if (isNum(S.rpm)) {
            const rpm = G.smooth('gs-ccc-rpm', S.rpm, 14), f = clamp(rpm / S.maxRpm, 0, 1), lo = S.shift - S.range;
            const col = S.strobe ? (flash ? C.crit : withAlpha(C.crit, 0.5)) : rpm >= S.shift ? C.crit : rpm >= lo ? C.amber : '#ffffff';
            cv.fillRect(bx, by, bw * f, bh, withAlpha(col, col === '#ffffff' ? 0.16 : 0.45));
        }
        // the four chevrons, then the button and the gear on it
        const R = g.R, s = Math.round(R * 0.3);
        chevron(cv, g.ccx, g.ccy - R - s * 0.5 - 7, s, 'u', C.blue, flash);
        chevron(cv, g.ccx, g.ccy + R + s * 0.5 + 7, s, 'd', C.orange, flash);
        chevron(cv, g.ccx - R * 1.6, g.ccy, s, 'l', C.red, flash);
        chevron(cv, g.ccx + R * 1.6, g.ccy, s, 'r', C.green, flash);
        cv.blit(G.layer(['gs-ccc-btn', R].join('|'), 2 * R + 14, 2 * R + 16, (c) => button(c, R), cv.textScale), g.ccx - R - 6, g.ccy - R - 6);
        const gt = S.gearText && S.gearText !== '-' ? S.gearText : 'i';
        const gs = L.gearFit(cv, gt, Math.round(R * 1.02), R * 1.0, { font: SER, spacing: 0 });
        const gy = g.ccy + gs * 0.33;
        const gf = { font: SER, align: 'center', literal: true };
        [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5], [1.5, 2.5]].forEach((d) => cv.text(gt, g.ccx + d[0], gy + d[1], gs, withAlpha('#4c546c', 0.85), gf));
        cv.text(gt, g.ccx, gy, gs, flash ? C.crit : '#f3fdfe', { font: SER, align: 'center', literal: true });
        // above: the speed
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--', unit = (S.unit || 'mph').toLowerCase();
        const tcx = g.ccx, ty = ry[0] + Math.round((ry[1] - ry[0]) * 0.4), ssz = 46;
        const sw = cv.textWidth(sp, ssz, { font: TXT, literal: true }), uw = cv.textWidth(' ' + unit, 28, { font: TXT, literal: true });
        T(cv, sp, tcx - (sw + uw) / 2, ty, ssz);
        T(cv, ' ' + unit, tcx - (sw + uw) / 2 + sw, ty, 28);
        T(cv, L.rpmText(S.rpm) + ' rpm', g.ccx, ry[3] - (ry[3] - ry[2]) * 0.12, 32, S.strobe && flash ? '#ffe0d8' : C.text, TXT, { align: 'center' });
        // left: oil and coolant (blue while cold, red when hot)
        const lx = (cx[0] + cx[1]) / 2, lmid = (ry[1] + ry[2]) / 2;
        [['Oil', S.oil, -1], ['Coolant', S.cool, 1]].forEach((r) => {
            const z = L.tempGauge(r[1], { cold: '#9fd0ff', ok: C.text, hot: '#ff8a80' }, '#ffffff', 0);
            T(cv, r[0] + ' ' + L.tempText(r[1]), lx, lmid + r[2] * 23 + 12, 34, z.on || C.text, TXT, { align: 'center' });
        });
        // right: the g now, the peaks on the ribbed tiles beside it
        if (own) {
            const rx = (cx[2] + cx[3]) / 2, rmid = (ry[1] + ry[2]) / 2;
            const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
            T(cv, (tot == null ? '-.--' : tot.toFixed(2)) + ' g', rx, rmid + 12, 34, C.text, TXT, { align: 'center' });
            [[ry[0], [['Launch', S.peak.acc.toFixed(2) + ' g'], ['Braking', S.peak.brk.toFixed(2) + ' g']]], [ry[2], [['Cornering', S.peak.lat.toFixed(2) + ' g'], ['Session', L.clock(S.session)]]]].forEach((b) => {
                const top = b[0], hh = ry[1] - ry[0];
                b[1].forEach((ln, i) => {
                    const yy = top + hh * (i ? 0.72 : 0.38) + 8;
                    T(cv, ln[0], cx[2] + 26, yy, 24, C.text, TXT);
                    T(cv, ln[1], cx[3] - 26, yy, 24, C.text, TXT, { align: 'right' });
                });
            });
            L.sessionTap(cv, S, cx[2] + 2, ry[2] + 2, cx[3] - cx[2] - 4, ry[3] - ry[2] - 4, '#ffffff', 0);
        }
        // the status bar: the drive mode, the speaker mark, three dividers, the time, the date
        const sy = g.sy + g.sh * 0.62, sc = '#f2fafd';
        cv.fillRect(S.x, g.sy, S.w, g.sh, C.bar);
        cv.text(cap(S.mode) || 'Comfort', S.x + S.w * 0.015, sy, 32, sc, { font: REG, literal: true });
        speaker(cv, S.x + S.w * 0.222, sy - 9, '#d6eaf6');
        [0.367, 0.48, 0.627].forEach((f) => cv.fillRect(S.x + S.w * f, g.sy + g.sh * 0.18, 2, g.sh * 0.6, C.sep));
        const ck = CLOCK.now(now);
        cv.text(ck.time + ' ' + ck.ampm, S.x + S.w * 0.5535, sy, 32, sc, { font: REG, align: 'center', literal: true });
        // the date ends clear of the hub's page dots and G button (bottom right)
        cv.text(dateText(S.imperial !== false), S.x + S.w - 270, sy, 32, sc, { font: REG, align: 'right', literal: true });
        S.zones = {
            speed: { x: cx[1], y: ry[0], w: cx[2] - cx[1], h: ry[1] - ry[0] }, gear: { x: g.ccx - R, y: g.ccy - R, w: 2 * R, h: 2 * R },
            toast: { x: g.ccx, y: ry[1] - 20 }, chip: { x: cx[2] - 40, y: ry[0] + 20 }, star: { x: cx[1] + 40, y: ry[0] + 30 },
        };
    },
};
