'use strict';
/**
 * Arcade - the dash as an 80s coin-op racing cabinet (original art in that spirit: no game's name, logo,
 * characters or sprites). A night road in pseudo-3D that runs towards a blocky skyline: red and white
 * rumble strips and lane dashes rush past with the speed, the road bends against the cornering g, and a
 * little pixel car (drawn for G's Dash) drifts with it, its tail lights flaring under braking. Over it the
 * cabinet's HUD: 1UP with a score that counts up as you drive, HI-SCORE (beat it and it follows you),
 * 2UP with INSERT COIN blinking, CREDIT 00; the speed in big pixel numerals, the gear as the STAGE, the
 * revs as a POWER bar of blocks, oil and coolant as small block bars, a BONUS card of the g-force peaks.
 * Standing still: PLAYER 1 / PRESS START blinks over the road; at the shift point SHIFT UP! flashes. CRT
 * scanlines over it all. The G's Dash pixel font (px.js, as Pixel and Pocket). Static parts (sky, skyline,
 * scanlines, frames) are cached layers. Node 8: no ?., no ??, no object spread.
 */
const G = require('./kit/gauges');
const L = require('./lib');
const P = require('./px');

const { withAlpha, clamp, isNum } = L;
const FONT = 'gs_p_px';
const C = {
    bg: '#000000', red: '#ff3030', yellow: '#ffd800', cyan: '#22e4ff', magenta: '#ff38c8', white: '#ffffff', green: '#3cff5a',
    blue: '#2a4bff', road: '#3a3a46', road2: '#44444f', grass: '#0c3a1a', grass2: '#0f4a20', sky0: '#05001a', sky1: '#1a0640',
    city: '#140a2e', win: '#ffd800', dim: '#8a8aa8', box: '#000000',
};
const palette = Object.assign({}, require('./kit/themes').theme('m_tricolour'), {
    name: 'Arcade',
    bg: C.bg, panelTop: '#0a0a14', panelBottom: '#000000', panelEdge: C.cyan,
    track: '#1a1a26', tick: '#4a4a66', text: C.white, dim: C.dim,
    accent: C.cyan, accent2: C.yellow, ok: C.green, warn: C.yellow, crit: C.red, cold: C.blue,
    stripes: [C.red, C.yellow, C.cyan], sel: C.yellow, selText: C.bg, marker: C.magenta,
});
const T = (cv, s, x, y, size, col, o) => cv.text(s, x, y, size, col || C.white, Object.assign({ font: FONT, literal: true }, o || {}));
const numCell = (size) => Math.max(2, Math.round(size / 9));
const rnd = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
const pad = (n, k) => { let s = String(Math.max(0, Math.floor(n))); while (s.length < k) s = '0' + s; return s.slice(-k); };

/* ---------------- the scene: sky, skyline, the road in pseudo-3D ---------------- */
function geo(S) {
    return { hy: S.y + 150, by: S.y + S.h - 64, cx: S.x + S.w / 2, x0: S.x, x1: S.x + S.w };
}
/** the night sky over the horizon (hy: the horizon, page px): stars, a blocky skyline with lit windows */
function sky(c, w, hy) {
    for (let y = 0; y < hy; y += 6) c.fillRect(0, y, w, 6, L.mix(C.sky0, C.sky1, y / hy));
    for (let i = 0; i < 90; i++) { const x = Math.floor(rnd(i, 1) * w / 3) * 3, y = Math.floor(rnd(i, 2) * (hy - 70) / 3) * 3, s = rnd(i, 3) < 0.2 ? 6 : 3; c.fillRect(x, y, s, s, withAlpha(C.white, 0.35 + 0.6 * rnd(i, 4))); }
    // a big pixel moon
    const mx = w * 0.66, my = hy * 0.36;
    for (let dy = -30; dy <= 30; dy += 6) for (let dx = -30; dx <= 30; dx += 6) if (dx * dx + dy * dy <= 900) c.fillRect(mx + dx, my + dy, 6, 6, (dx + dy) > 18 ? '#c9c2a0' : '#f4efd0');
    // the skyline: blocks on the horizon, a few windows lit
    let x = 0, k = 0;
    while (x < w) {
        const bw = 36 + Math.floor(rnd(k, 5) * 8) * 6, bh = 18 + Math.floor(rnd(k, 6) * 9) * 6;
        c.fillRect(x, hy - bh, bw, bh, C.city);
        for (let wy = hy - bh + 6; wy < hy - 6; wy += 12) for (let wx = x + 6; wx < x + bw - 6; wx += 12) if (rnd(wx, wy) < 0.22) c.fillRect(wx, wy, 6, 6, withAlpha(C.win, 0.7));
        x += bw; k++;
    }
}
/** the CRT: a dark line every third px, darker corners */
function scan(c, w, h) {
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1, withAlpha('#000000', 0.28));
    for (let i = 0; i < 8; i++) { const a = 0.06 * (1 - i / 8); c.fillRect(i * 6, 0, 6, h, withAlpha('#000000', a)); c.fillRect(w - (i + 1) * 6, 0, 6, h, withAlpha('#000000', a)); }
}
let travel = 0, lastAt = 0, score = 0, hiScore = 50000, bend = 0, carX = 0;
const ROW = 4;
/** the road from the horizon down: each 4 px row a slice at its depth; stripes move with travel */
function road(cv, S, g) {
    const H = g.by - g.hy, x0 = g.x0, w = g.x1 - g.x0;
    for (let y = g.hy; y < g.by; y += ROW) {
        const p = (y - g.hy + ROW) / H, depth = 1 / (p + 0.04), band = Math.floor(depth * 0.9 + travel) % 2 === 0;
        const hw = 18 + p * 520, mid = g.cx + bend * 260 * (1 - p) * (1 - p) - carX * p * 0.6, rw = hw * 0.11;
        cv.fillRect(x0, y, w, ROW, band ? C.grass : C.grass2);
        cv.fillRect(mid - hw - rw, y, rw, ROW, band ? C.red : C.white);
        cv.fillRect(mid + hw, y, rw, ROW, band ? C.red : C.white);
        cv.fillRect(mid - hw, y, 2 * hw, ROW, band ? C.road : C.road2);
        if (band) { const dw = Math.max(2, hw * 0.035); [-1 / 3, 1 / 3].forEach((f) => cv.fillRect(mid + f * 2 * hw - dw / 2, y, dw, ROW, withAlpha(C.white, 0.85))); }
    }
}
/* the player's car, rear view, 16 x 10 cells (drawn for G's Dash) */
const CAR = ['....RRRRRRRR....', '...RWWWWWWWWR...', '..RWWWWWWWWWWR..', '.RRRRRRRRRRRRRR.', 'RRLLRRRRRRRRLLRR', 'RRLLRRDDDDRRLLRR', 'RRRRRRDDDDRRRRRR', 'GGGGGGGGGGGGGGGG', 'KKK..........KKK', 'KKK..........KKK'];
function car(cv, x, y, u, brake) {
    const col = { R: '#e8202a', D: '#7a0a12', W: '#1f6fa8', L: brake ? '#ffef5a' : '#ff6a2a', G: '#9a9aa8', K: '#101014' };
    cv.fillRect(x - 8 * u + u, y + 10 * u - u, 16 * u - 2 * u, u * 1.5, withAlpha('#000000', 0.5));
    CAR.forEach((row, r) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') cv.fillRect(x - 8 * u + i * u, y + r * u, u + 0.5, u + 0.5, col[row[i]]); });
    if (brake) [2, 12].forEach((i) => cv.fillRect(x - 8 * u + i * u - u, y + 4 * u - u, 4 * u, 4 * u, withAlpha('#ff3030', 0.35)));
}
/** a neon-edged black box, square corners, as the cabinet's HUD draws them */
function box(cv, x, y, w, h, edge) {
    cv.fillRect(x, y, w, h, withAlpha(C.box, 0.82));
    cv.fillRect(x, y, w, 3, edge); cv.fillRect(x, y + h - 3, w, 3, edge); cv.fillRect(x, y, 3, h, edge); cv.fillRect(x + w - 3, y, 3, h, edge);
}
/** n blocks across w, the first k lit in col(i) */
function blocks(cv, x, y, w, h, n, k, col, off) {
    const bw = (w - (n - 1) * 4) / n;
    for (let i = 0; i < n; i++) cv.fillRect(x + i * (bw + 4), y, bw, h, i < k ? col(i) : off);
}
function bonus(cv, S, x, y, w, h) {
    box(cv, x, y, w, h, C.magenta);
    T(cv, 'BONUS', x + w / 2, y + 40, 26, C.magenta, { align: 'center', spacing: 2 });
    const tot = isNum(S.gLat) && isNum(S.gLong) ? Math.sqrt(S.gLat * S.gLat + S.gLong * S.gLong) : null;
    [['G NOW', tot == null ? '-.--' : tot.toFixed(2), C.white], ['LAUNCH', S.peak.acc.toFixed(2), C.green], ['BRAKE', S.peak.brk.toFixed(2), C.red], ['CORNER', S.peak.lat.toFixed(2), C.cyan], ['TIME', L.clock(S.session), C.yellow]].forEach((r, i) => {
        const ry = y + 86 + i * 44;
        T(cv, r[0], x + 22, ry, 20, C.dim);
        T(cv, r[1], x + w - 22, ry, 22, r[2], { align: 'right' });
    });
    L.sessionTap(cv, S, x + 8, y + 86 + 4 * 44 - 30, w - 16, 40, C.yellow, 0);
}

module.exports = {
    id: 'arcade',
    name: 'Arcade',
    blurb: 'An 80s racing cabinet: a night road, 1UP and HI-SCORE, INSERT COIN, PLAYER 1',
    palette,
    ui: {
        txt: FONT, num: FONT, size: 18, spacing: 1, upper: true, radius: 0, nameFont: FONT, nameSize: 24,
        numText: (cv, s, x, y, size, c, o) => {
            o = o || {};
            if (size < 40) return cv.text(String(s), x, y, size, c, Object.assign({ font: FONT, literal: true }, o));
            const u = numCell(size);
            return P.text(cv, String(s), x, y - 7 * u, u, c, { align: o.align });
        },
        numWidth: (cv, s, size) => (size < 40 ? cv.textWidth(String(s), size, { font: FONT, literal: true }) : P.width(String(s), numCell(size))),
    },
    badgeLetter: '#ffffff',

    background(cv, t, reach) {
        cv.fillRect(0, 0, 1600, reach, C.bg);
        cv.blit(G.layer('gs-ar-sky|' + reach, 1600, 202, (c) => sky(c, 1600, 202)), 0, 0);
    },
    card(cv, t, x, y, w, h, on) { box(cv, x, y, w, h, on ? C.yellow : withAlpha(C.cyan, 0.7)); },
    cardBg(cv, t, x, y, w, h) {
        // night sky, the road to the horizon, then black under it for the name
        cv.fillRect(x, y, w, h, C.bg);
        const hy = y + h * 0.36, ry = y + h * 0.7;
        for (let yy = y; yy < hy; yy += 4) cv.fillRect(x, yy, w, 4, L.mix(C.sky0, C.sky1, (yy - y) / (hy - y)));
        for (let yy = hy; yy < ry; yy += 4) {
            const p = (yy - hy + 4) / (ry - hy), hw = 4 + p * w * 0.42, band = Math.floor(1 / (p + 0.05) * 0.9) % 2 === 0, mid = x + w / 2;
            cv.fillRect(x, yy, w, 4, band ? C.grass : C.grass2);
            cv.fillRect(mid - hw - hw * 0.12, yy, hw * 0.12, 4, band ? C.red : C.white); cv.fillRect(mid + hw, yy, hw * 0.12, 4, band ? C.red : C.white);
            cv.fillRect(mid - hw, yy, 2 * hw, 4, C.road);
        }
        cv.fillRect(x, ry, w, 3, C.cyan);
    },
    panelPlate(cv, t, x, y, w, h) { box(cv, x, y, w, h, C.magenta); },
    gButton(cv, t, r, lit, down) {
        box(cv, r.x + 10, r.y + 12, r.w - 20, r.h - 24, lit || down ? C.yellow : C.cyan);
        const bh = 22, bw = L.badgeWidth(bh);
        L.badge(cv, r.x + (r.w - bw) / 2, r.y + (r.h + bh) / 2 + (down ? 1 : 0), bh, '#ffffff');
    },
    /** The gallery card: 1UP and a score, a big 88 in yellow, INSERT COIN */
    swatch(cv, t, x, y, w, h) {
        T(cv, '1UP', x + 12, y + 18, 14, C.red);
        T(cv, 'HI', x + w - 12, y + 18, 14, C.red, { align: 'right' });
        const u = Math.max(3, Math.floor(Math.min(w, h) / 26));
        P.text(cv, '88', x + w / 2, y + 30, u, C.yellow, { align: 'center', shadow: C.red });
        T(cv, 'INSERT COIN', x + w / 2, y + 30 + 7 * u + 26, 12, C.cyan, { align: 'center' });
        car(cv, x + w / 2, y + h * 1.06 - 30, 3, false);
    },

    panelRect(S) { return { x: S.x + S.w - 396, y: S.y + 86, w: 384, h: 300 }; },

    draw(cv, S) {
        const now = Date.now(), g = geo(S), mph = isNum(S.mph) ? S.mph : isNum(S.speed) ? (S.imperial ? S.speed : S.speed / 1.609344) : 0;
        const dt = lastAt ? clamp((now - lastAt) / 1000, 0, 0.25) : 0; lastAt = now;
        travel = (travel + dt * mph * 0.18) % 1000;
        score += dt * mph * 5;
        const hiNow = score >= hiScore;
        if (hiNow) hiScore = score;
        bend = G.smooth('gs-ar-bend', clamp(-(S.gLat || 0), -1, 1), 3);
        carX = G.smooth('gs-ar-carx', clamp(S.gLat || 0, -1, 1) * 70, 4);
        // the scene
        road(cv, S, g);
        car(cv, g.cx + carX, g.by - 96, 6, (S.gLong || 0) < -0.25);
        const blink = Math.floor(now / 500) % 2 === 0, fast = Math.floor(now / 160) % 2 === 0;
        // top row: 1UP, HI-SCORE, 2UP
        const ty = S.y + 26;
        T(cv, '1UP', S.x + 40, ty, 22, C.red);
        T(cv, pad(score, 6), S.x + 40, ty + 30, 26, C.white);
        T(cv, 'HI-SCORE', g.cx, ty, 22, C.red, { align: 'center' });
        T(cv, pad(hiScore, 6), g.cx, ty + 30, 26, hiNow && blink ? C.yellow : C.white, { align: 'center' });
        T(cv, '2UP', S.x + S.w - 40, ty, 22, C.red, { align: 'right' });
        if (blink) T(cv, 'INSERT COIN', S.x + S.w - 40, ty + 30, 22, C.cyan, { align: 'right' });
        // left: speed, stage (the gear), fluids
        const lx = S.x + 24, lw = 330;
        box(cv, lx, S.y + 86, lw, 300, C.cyan);
        T(cv, 'SPEED', lx + 22, S.y + 122, 20, C.cyan);
        const sp = isNum(S.speed) ? String(Math.round(S.speed)) : '--';
        let su = 11; while (su > 6 && P.width(sp, su) > lw - 40) su--;
        P.text(cv, sp, lx + lw - 22, S.y + 136, su, S.strobe && fast ? C.red : C.yellow, { align: 'right', shadow: C.red });
        T(cv, (S.unit || 'MPH').toUpperCase(), lx + lw - 22, S.y + 136 + 7 * su + 28, 18, C.dim, { align: 'right' });
        T(cv, 'STAGE', lx + 22, S.y + 268, 20, C.magenta);
        let gu = 8; while (gu > 4 && P.width(S.gearText, gu) > 120) gu--;
        P.text(cv, S.gearText, lx + 22, S.y + 282, gu, S.strobe && fast ? C.red : C.white, { shadow: C.magenta });
        [['OIL', S.oil], ['H2O', S.cool]].forEach((r, i) => {
            const fx = lx + 170, fy = S.y + 280 + i * 46, zg = L.tempGauge(r[1], { cold: C.blue, ok: C.green, hot: C.red }, '#222', 0.3);
            T(cv, r[0] + ' ' + L.tempText(r[1]), fx, fy + 4, 14, C.dim);
            blocks(cv, fx, fy + 14, 140, 14, 8, zg.on ? Math.max(1, Math.round(zg.pos * 8)) : 0, () => zg.on || C.green, '#1c1c28');
        });
        // bottom: POWER (the revs) as blocks, the rpm, CREDIT
        const py = g.by + 18, px = S.x + 170, pw = S.w - 170 - 420, lo = S.shift - S.range;
        box(cv, S.x + 24, py - 12, S.w - 48, 54, withAlpha(C.cyan, 0.6));
        T(cv, 'POWER', S.x + 44, py + 22, 20, C.green);
        const N = 36, rpm = isNum(S.rpm) ? G.smooth('gs-ar-rpm', S.rpm, 14) : 0, k = Math.round(N * clamp(rpm / S.maxRpm, 0, 1));
        blocks(cv, px, py, pw, 30, N, k, (i) => {
            const v = (i + 1) / N * S.maxRpm;
            if (S.strobe) return fast ? C.red : C.white;
            return v >= S.shift ? C.red : v >= lo ? C.yellow : C.green;
        }, '#1a1a26');
        T(cv, L.rpmText(S.rpm) + ' RPM', px + pw + 24, py + 22, 18, C.white);
        T(cv, 'CREDIT 00', S.x + S.w - 44, py + 22, 18, C.dim, { align: 'right' });
        // the attract text over the road: standing still, the shift point, a new high score
        const mid = g.cx, my = S.y + 220;
        if (S.strobe) { if (fast) T(cv, 'SHIFT UP!', mid, my, 52, C.red, { align: 'center' }); }
        else if (mph < 1) {
            T(cv, 'PLAYER 1', mid, my - 26, 34, C.yellow, { align: 'center' });
            if (blink) T(cv, 'PRESS START', mid, my + 24, 28, C.white, { align: 'center' });
        } else if (hiNow && score - 50000 < 2000 && score >= 50000) { if (blink) T(cv, 'NEW HI-SCORE!', mid, my, 34, C.yellow, { align: 'center' }); }
        if (S.mode) T(cv, S.mode, mid, S.y + 108, 16, S.modeTone === 'sport+' || S.modeTone === 'track' ? C.red : S.modeTone === 'sport' ? C.yellow : C.dim, { align: 'center' });
        // the right panel: BONUS
        const pr = module.exports.panelRect(S);
        if (!S.panel || S.panel === 'g') bonus(cv, S, pr.x, pr.y, pr.w, pr.h);
        // the CRT over the lot
        cv.blit(G.layer(['gs-ar-scan', S.w, S.h].join('|'), S.w + 24, S.h + 16, (c) => scan(c, S.w + 24, S.h + 16), cv.textScale), S.x - 12, S.y - 8);
        S.zones = {
            speed: { x: lx, y: S.y + 86, w: lw, h: 160 }, gear: { x: lx, y: S.y + 246, w: 160, h: 140 },
            toast: { x: mid, y: S.y + 300 }, chip: { x: lx + lw - 30, y: S.y + 100 }, star: { x: lx + 140, y: S.y + 104 },
        };
    },
};
