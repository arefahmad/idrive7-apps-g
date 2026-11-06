'use strict';
/*
 * logo_core.js - G's Dash 0.13.1: the cluster logo per look (the map area, cluster_logo.js). The G's Dash
 * badge (lib.js badge(): three slanted stripes and the blocky italic G, 184 px tall, k 0.27) drawn by a
 * fragment shader per look on one effect layer, LOGO_W x LOGO_H on opaque black in the middle of the map
 * area - no picture: 0 bytes of the renderer's pixel memory, and a still layer (no u_time, no uniforms):
 * nothing is sent after it is made and the renderer flushes nothing for it.
 *   m          carbon-weave G, a light keyline, the tricolour stripes, a red redline on the G's bar
 *   gt         GT yellow G with a black inline, white / grey / yellow stripes, a 2 px cell rule
 *   digital    the G as VFD segments (teal, the look's own), the unlit ones faint, a dot grid, a glow
 *   simracing  shift-light stripes, a white G with a purple "session best" bar, timing underline
 *   lumen      an ice-blue neon-tube G with a bloom over a deep-blue body, glowing stripes
 *   digital-purple, digital-red (0.14.0)  Digital's in the variant's colours (tints.js)
 *   desktop    a late-90s desktop: a bevelled grey window with a navy gradient title bar on teal, the badge
 *              in it in VGA colours (scaled to fit), a pixel arrow pointer aimed at the G (original art)
 *   pocket     a pocket console's slate bezel with a red power light round a four-shade green dot-matrix
 *              screen, the badge on it in 6 px dots (original art)
 *   ccc        the first iDrive's start screen: the badge in brushed silver with blue / green / red stripes
 *              (its chevrons' colours) on a raised mauve-grey tile between ribbed ones, on black (redrawn)
 *   pod        a mid-2000s pocket music player: a charcoal G and blue stripes on its glossy white front,
 *              a touch wheel's rings behind them (original art)
 *   heist      an open-world crime game: a white G with a thick black outline over a sunset - a banded sun,
 *              a skyline with lit windows, a palm - pink / orange / yellow stripes, three "wanted" stars
 *              (original art)
 * Pixel keeps its pixel-art emblem (px.js, an image), any other look the regular logo (an image).
 * The same looks baked into pictures, logo_<look>.png (tools/bake_gsdash_logos.js, the CPU mirror
 * tools/gsdash_logo_emu.js), are the fallback for a renderer without effect layers or refusing the shader.
 * All original art. Node 8.
 */
const LOGO_W = 448, LOGO_H = 240, H = 184, K = 0.27;
const SW = H * 0.19, SG = H * 0.05, GW = H * 0.93, T = H * 0.245, MID = H * 0.47;
const G0 = 3 * SW + 2 * SG + H * 0.1;
const BW = G0 + GW + K * H;                                   // lib.js badgeWidth(H)
const BX = Math.round((LOGO_W - BW) / 2), BY = Math.round((LOGO_H + H) / 2), OY = BY - H;

/* the badge upright (x right, y down from its top), sheared on screen: x' = BX + x + K (H - y), y' = OY + y */
const STRIPES = [0, 1, 2].map((i) => [i * (SW + SG), 0, SW, H]);
const GPARTS = [[G0, 0, GW, T], [G0, 0, T, H], [G0, H - T, GW, T], [G0 + GW - T, MID, T, H - MID], [G0 + GW * 0.5, MID, GW * 0.5, T * 0.86]];
/* Digital: the G as display segments [x0, y0, x1, y1, horizontal]: lit a f e d c g2, unlit (faint) b g1; stripes two each */
const SEG_T = T * 0.86, SEG_GAP = 2.5, SEG_CUT = 11;
const SEGS = (function () {
    const t = SEG_T, xl = G0, xr = G0 + GW, ym = MID + t * 0.5;
    const lit = [[xl + t / 2, 0, xr - t / 2, t, 1], [xl, t / 2, xl + t, ym, 0], [xl, ym, xl + t, H - t / 2, 0],
        [xl + t / 2, H - t, xr - t / 2, H, 1], [xr - t, ym, xr, H - t / 2, 0], [(xl + xr) / 2, ym - t / 2, xr - t / 2, ym + t / 2, 1]];
    const ghost = [[xr - t, t / 2, xr, ym, 0], [xl + t / 2, ym - t / 2, (xl + xr) / 2, ym + t / 2, 1]];
    const stripes = [0, 1, 2].map((i) => { const x = i * (SW + SG); return [[x, 0, x + SW, H / 2, 0], [x, H / 2, x + SW, H, 0]]; });
    /* trimmed by the gap at the ends -> [x, y, w, h] boxes, cut corners SEG_CUT (at most half the thickness) */
    const box = (s) => (s[4] ? [s[0] + SEG_GAP, s[1], s[2] - s[0] - 2 * SEG_GAP, s[3] - s[1]] : [s[0], s[1] + SEG_GAP, s[2] - s[0], s[3] - s[1] - 2 * SEG_GAP]);
    return { lit: lit.map(box), ghost: ghost.map(box), stripes: stripes.map((p) => p.map(box)) };
}());

const hex = (h) => { const s = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255); };
/* the looks' colours (their look_<id>.js palettes) */
const LOOKS = {
    m: { stripes: ['#5fb4e8', '#1d4f91', '#e2231a'], edge: '#eef1f5', c0: '#15171c', c1: '#3a3f49', red: '#e2231a', red2: '#ff3b2f' },
    gt: { stripes: ['#ffffff', '#4a4a4a', '#ffd400'], g: '#ffd400', rule: '#2e2e2e' },
    digital: { lit: '#41f2cf', acc: '#ffa63a' },
    simracing: { stripes: ['#2fd27a', '#ffc21a', '#ff2a2a'], g: '#f4f6f9', best: '#b45cff', sector: '#2a7dff' },
    lumen: { stripes: ['#7fe3ff', '#2f8bff', '#1b3fd8'], bg0: '#0a1226', deep: '#1b3fd8', blue: '#2f8bff', ice: '#7fe3ff', core: '#e8fbff' },
    desktop: { stripes: ['#0000a8', '#00a8a8', '#a80000'], g: '#000000', desk: '#008080', face: '#c0c0c0', hi: '#ffffff', light: '#dfdfdf',
        shadow: '#808080', title0: '#000080', title1: '#1084d0' },
    pocket: { stripes: ['#306230', '#0f380f', '#306230'], g: '#0f380f', s2: '#8bac0f', s3: '#9bbc0f', bezel: '#5b5f6e', body: '#c4c4c8', led: '#ff2d2d' },
    heist: { stripes: ['#ff5e7e', '#ff9a3d', '#ffd23a'], sky0: '#22104a', sky1: '#6e2a8c', sky2: '#ff6f61', sky3: '#ffb347', sun: '#ffe066',
        city: '#1b0d33', win: '#ffd36b', palm: '#0e0620' },
    ccc: { stripes: ['#20a2fd', '#38b087', '#e62d4b'], face0: '#8a8188', face1: '#776f75', rib0: '#857b80', rib1: '#625b60', hi: '#c5cffe', g0: '#e9eff2', g1: '#9ea9bb' },
    pod: { stripes: ['#6fb1f0', '#3d8ae0', '#2f73cc'], g: '#2b2d31', g2: '#4a4e55', body0: '#fbfbf9', body1: '#d9dad7', ring: '#c9cbc8', wheel: '#ecedeb' },
    arcade: { stripes: ['#ff3030', '#ffd800', '#22e4ff'], g: '#ffd800', shadow: '#7a0a3a', sky0: '#05001a', sky1: '#1a0640', frame: '#22e4ff' },
};
/* 0.14.0: a look's colour variants (tints.js) with their own constants, keyed look-variant (digital-purple) */
(function () {
    const TINTS = require('./tints');
    TINTS.VARIANTS.digital.slice(1).forEach((v) => { LOOKS['digital-' + v.id] = { lit: v.c.lit, acc: v.c.amb }; });
}());
const ORDER = ['m', 'gt', 'digital', 'simracing', 'lumen', 'desktop', 'pocket', 'heist', 'arcade', 'pod', 'ccc'].concat(Object.keys(LOOKS).filter((k) => k.indexOf('-') > 0));
/** the shader body a look (or variant) is drawn with */
const baseOf = (look) => String(look).split('-')[0];
const has = (look) => Object.prototype.hasOwnProperty.call(LOOKS, look);
/** what the logo is for a look: 'fx' (this shader), 'pixel' (px.js emblem), or 'regular' (lib.js badge) */
const kindOf = (look) => (look === 'pixel' ? 'pixel' : has(look) ? 'fx' : 'regular');
const PNG_OF = (look) => 'logo_' + look + '.png';

const f1 = (v) => { const s = String(Math.round(v * 10000) / 10000); return s.indexOf('.') < 0 && s.indexOf('e') < 0 ? s + '.0' : s; };
const v3 = (c) => { const a = typeof c === 'string' ? hex(c) : c; return 'vec3(' + a.map(f1).join(', ') + ')'; };
const v4 = (b) => 'vec4(' + b.map(f1).join(', ') + ')';

const COMMON = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v_uv;',
    'const vec2 SZ = vec2(' + f1(LOGO_W) + ', ' + f1(LOGO_H) + ');',
    'const float BX = ' + f1(BX) + ', OY = ' + f1(OY) + ', BH = ' + f1(H) + ', SK = ' + f1(K) + ';',
    '/* the screen px -> the badge upright */',
    'vec2 badge(vec2 p) { float y = p.y - OY; return vec2(p.x - BX - SK * (BH - y), y); }',
    'float sdBox(vec2 q, vec4 b) { vec2 h = b.zw * 0.5; vec2 d = abs(q - b.xy - h) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }',
    'float sdSeg(vec2 q, vec4 b) { vec2 h = b.zw * 0.5; vec2 d = abs(q - b.xy - h); float c = min(' + f1(SEG_CUT) + ', min(h.x, h.y));',
    '    return max(sdBox(q, b), (d.x + d.y - (h.x + h.y - c)) * 0.7071068); }',
    '/* coverage of a distance (1 px edge), a soft edge as blurred by s px (a logistic for the Gaussian) */',
    'float cov(float d) { return clamp(0.5 - d, 0.0, 1.0); }',
    'float soft(float d, float s) { return 1.0 / (1.0 + exp(clamp(1.702 * d / s, -30.0, 30.0))); }',
    'vec3 paint(vec3 c, float a, vec3 k) { return mix(c, k, clamp(a, 0.0, 1.0)); }',
    '/* a hash without sin (steady on mediump GPUs): 0..1 per cell */',
    'float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    '/* the distance to a line segment */',
    'float sdLine(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * t); }',
    '/* the arrow pointer (Desktop \'98): 12 x 17 cells, outline (black) and fill (white) bits per row */',
    'float curB(float r) { if (r < 0.5) return 1.0; if (r < 1.5) return 3.0; if (r < 2.5) return 5.0; if (r < 3.5) return 9.0; if (r < 4.5) return 17.0; if (r < 5.5) return 33.0; if (r < 6.5) return 65.0; if (r < 7.5) return 129.0; if (r < 8.5) return 257.0; if (r < 9.5) return 513.0; if (r < 10.5) return 1985.0; if (r < 11.5) return 73.0; if (r < 12.5) return 149.0; if (r < 13.5) return 147.0; if (r < 14.5) return 289.0; if (r < 15.5) return 288.0; if (r < 16.5) return 192.0; return 0.0; }',
    'float curW(float r) { if (r < 0.5) return 0.0; if (r < 1.5) return 0.0; if (r < 2.5) return 2.0; if (r < 3.5) return 6.0; if (r < 4.5) return 14.0; if (r < 5.5) return 30.0; if (r < 6.5) return 62.0; if (r < 7.5) return 126.0; if (r < 8.5) return 254.0; if (r < 9.5) return 510.0; if (r < 10.5) return 62.0; if (r < 11.5) return 54.0; if (r < 12.5) return 98.0; if (r < 13.5) return 96.0; if (r < 14.5) return 192.0; if (r < 15.5) return 192.0; if (r < 16.5) return 0.0; return 0.0; }',
    'float bit(float v, float i) { return mod(floor(v / exp2(i)), 2.0); }',
    '/* a five-point star of radius r (point up on screen), rf the inner ratio: the distance (after Inigo Quilez) */',
    'float sdStar5(vec2 p, float r, float rf) { p.y = -p.y; const vec2 k1 = vec2(0.809017, -0.587785); const vec2 k2 = vec2(-0.809017, -0.587785);',
    '    p.x = abs(p.x); p -= 2.0 * max(dot(k1, p), 0.0) * k1; p -= 2.0 * max(dot(k2, p), 0.0) * k2; p.x = abs(p.x); p.y -= r;',
    '    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0); float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);',
    '    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y); }',
];
const gD = () => ['    float g = 100000.0;'].concat(GPARTS.map((b) => '    g = min(g, sdBox(q, ' + v4(b) + '));'));
const stripes = (S) => STRIPES.map((b, i) => '    c = paint(c, cov(sdBox(q, ' + v4(b) + ')), ' + v3(S.stripes[i]) + ');');
const band = (y0, y1, x0, x1, col) => '    if (p.y >= ' + f1(y0) + ' && p.y < ' + f1(y1) + ' && p.x >= ' + f1(x0) + ' && p.x <= ' + f1(x1) + ') c = ' + v3(col) + ';';

const BODY = {
    m(S) {
        const rl = [G0 + GW * 0.5 + 4, MID + 5, GW * 0.5 - 9, 4];
        return stripes(S).concat(gD(), [
            '    float inner = cov(g + 2.5), edge = clamp(cov(g) - inner, 0.0, 1.0);',
            '    vec2 f = fract(p / 9.0), t = floor(p / 9.0);',
            '    float sh = mod(t.x + t.y, 2.0) < 0.5 ? 0.5 - 0.5 * cos(f.x * 6.2831853) : 0.5 - 0.5 * cos(f.y * 6.2831853);',
            '    vec3 carbon = (' + v3(S.c0) + ' + (' + v3(S.c1) + ' - ' + v3(S.c0) + ') * sh * 0.9) * clamp(1.15 - q.y / BH * 0.55, 0.6, 1.15);',
            '    c = paint(c, inner, carbon);',
            '    c = paint(c, edge, ' + v3(S.edge) + ');',
            '    float rl = sdBox(q, ' + v4(rl) + ');',
            '    c = min(c + ' + v3(S.red) + ' * 0.9 * (soft(rl, 3.0) - soft(rl + 4.0, 3.0)) * 1.6, vec3(1.0));',
            '    c = paint(c, cov(rl), ' + v3(S.red2) + ');',
        ]);
    },
    gt(S) {
        return stripes(S).concat(gD(), [
            '    c = paint(c, cov(g), ' + v3(S.g) + ');',
            '    c = paint(c, min(cov(g + 3.5), 1.0 - cov(g + 5.0)), vec3(0.0));',
            band(BY + 14, BY + 16, BX, BX + BW, S.rule),
            band(BY + 13, BY + 17, BX + BW - 60, BX + BW, S.g),
        ]);
    },
    digital(S) {
        const L = ['    float lit = 100000.0, gh = 100000.0, s0 = 100000.0, s1 = 100000.0, s2 = 100000.0;'];
        SEGS.lit.forEach((b) => L.push('    lit = min(lit, sdSeg(q, ' + v4(b) + '));'));
        SEGS.ghost.forEach((b) => L.push('    gh = min(gh, sdSeg(q, ' + v4(b) + '));'));
        SEGS.stripes.forEach((p, i) => p.forEach((b) => L.push('    s' + i + ' = min(s' + i + ', sdSeg(q, ' + v4(b) + '));')));
        return L.concat([
            '    float on = min(lit, min(s0, s1));',
            '    float grid = (mod(p.x, 4.0) < 3.0 && mod(p.y, 4.0) < 3.0) ? 1.0 : 0.25;',
            '    vec3 LC = ' + v3(S.lit) + ', AC = ' + v3(S.acc) + ';',
            '    c += LC * 0.09 * cov(gh) * grid;',
            '    c = min(c + LC * 0.28 * soft(on, 9.0) + AC * 0.28 * soft(s2, 9.0), vec3(1.0));',
            '    c = paint(c, cov(on) * grid, LC);',
            '    c = paint(c, cov(s2) * grid, AC);',
        ]);
    },
    simracing(S) {
        const L = ['    float g = 100000.0;'].concat(GPARTS.slice(0, 4).map((b) => '    g = min(g, sdBox(q, ' + v4(b) + '));'));
        return stripes(S).concat(L, [
            '    c = paint(c, cov(g), ' + v3(S.g) + ');',
            '    c = paint(c, cov(sdBox(q, ' + v4(GPARTS[4]) + ')), ' + v3(S.best) + ');',
            band(BY + 12, BY + 16, BX, BX + G0 - 6 - 0.01, S.sector),
            band(BY + 12, BY + 16, BX + G0, BX + BW, S.best),
        ]);
    },
    lumen(S) {
        const L = STRIPES.map((b, i) => '    { float s = sdBox(q, ' + v4(b) + '); c = min(c + ' + v3(S.stripes[i]) + ' * 0.55 * soft(s, 8.0), vec3(1.0)); c = paint(c, cov(s), ' + v3(S.stripes[i]) + '); }');
        return gD().concat([
            '    float gr = clamp(q.y / BH, 0.0, 1.0);',
            '    c = paint(c, cov(g + 2.0), ' + v3(S.bg0) + ' * (1.0 - gr) + ' + v3(S.deep) + ' * 0.55 * gr);',
            '    float tube = clamp(cov(g) - cov(g + 2.5), 0.0, 1.0);',
            '    float b10 = soft(g, 10.0) - soft(g + 2.5, 10.0), b3 = soft(g, 3.0) - soft(g + 2.5, 3.0);',
            '    c = min(c + ' + v3(S.blue) + ' * 0.9 * b10 + ' + v3(S.ice) + ' * 0.9 * b3, vec3(1.0));',
            '    c = paint(c, tube, ' + v3(S.core) + ');',
        ], L);
    },
    desktop(S) {
        // the window (screen px) and the badge scaled into it: sampled k times finer, its centre moved down
        const wx0 = 30, wy0 = 12, wx1 = LOGO_W - 30, wy1 = LOGO_H - 12, k = 1.42, bcx = LOGO_W / 2, bcy = BY - H / 2, ty = 58 + (wy1 - 58) / 2;
        const inR = (x0, y0, x1, y1) => '(p.x >= ' + f1(x0) + ' && p.x < ' + f1(x1) + ' && p.y >= ' + f1(y0) + ' && p.y < ' + f1(y1) + ')';
        const bev = (x0, y0, x1, y1, a, b) => [
            '    if (' + inR(x0, y0, x1, y0 + 1) + ' || ' + inR(x0, y0, x0 + 1, y1) + ') c = ' + v3(a) + ';',
            '    if (' + inR(x0, y1 - 1, x1, y1) + ' || ' + inR(x1 - 1, y0, x1, y1) + ') c = ' + v3(b) + ';',
        ];
        const btn = (x, y) => ['    if (' + inR(x, y, x + 20, y + 18) + ') c = ' + v3(S.face) + ';'].concat(bev(x, y, x + 20, y + 18, S.hi, '#000000'));
        const bx = wx1 - 4 - 3 * 22 - 2, by = wy0 + 6;
        return [
            '    c = ' + v3(S.desk) + ';',
            '    if (' + inR(wx0 + 6, wy0 + 6, wx1 + 6, wy1 + 6) + ') c = ' + v3(S.desk) + ' * 0.55;',
            '    if (' + inR(wx0, wy0, wx1, wy1) + ') c = ' + v3(S.face) + ';',
        ].concat(bev(wx0, wy0, wx1, wy1, S.hi, '#000000'), bev(wx0 + 1, wy0 + 1, wx1 - 1, wy1 - 1, S.light, S.shadow), [
            // the title bar: a navy gradient, a small window icon
            '    if (' + inR(wx0 + 4, wy0 + 4, wx1 - 4, wy0 + 30) + ') c = mix(' + v3(S.title0) + ', ' + v3(S.title1) + ', (p.x - ' + f1(wx0 + 4) + ') / ' + f1(wx1 - wx0 - 8) + ');',
            '    if (' + inR(wx0 + 9, wy0 + 9, wx0 + 25, wy0 + 25) + ') c = ' + v3(S.face) + ';',
            '    if (' + inR(wx0 + 12, wy0 + 12, wx0 + 22, wy0 + 15) + ') c = ' + v3(S.title0) + ';',
        ], btn(bx, by), btn(bx + 22, by), btn(bx + 46, by), [
            '    if (' + inR(bx + 5, by + 12, bx + 13, by + 14) + ') c = vec3(0.0);',
            '    if (' + inR(bx + 27, by + 4, bx + 37, by + 6) + ' || ' + inR(bx + 27, by + 4, bx + 28, by + 13) + ' || ' + inR(bx + 36, by + 4, bx + 37, by + 13) + ' || ' + inR(bx + 27, by + 12, bx + 37, by + 13) + ') c = vec3(0.0);',
            '    { vec2 x = p - vec2(' + f1(bx + 56) + ', ' + f1(by + 9) + '); if (abs(abs(x.x) - abs(x.y)) < 1.2 && abs(x.x) < 4.5) c = vec3(0.0); }',
            // the client area: a sunken white field holding the badge
            '    if (' + inR(wx0 + 12, 50, wx1 - 12, wy1 - 12) + ') c = vec3(1.0);',
        ], bev(wx0 + 12, 50, wx1 - 12, wy1 - 12, S.shadow, S.hi), [
            '    vec2 pb = (p - vec2(' + f1(bcx) + ', ' + f1(ty) + ')) * ' + f1(k) + ' + vec2(' + f1(bcx) + ', ' + f1(bcy) + ');',
            '    q = badge(pb);',
        ], gD(), STRIPES.map((b, i) => '    c = paint(c, cov(sdBox(q, ' + v4(b) + ') / ' + f1(k) + '), ' + v3(S.stripes[i]) + ');'), [
            '    c = paint(c, cov(g / ' + f1(k) + '), ' + v3(S.g) + ');',
            // the arrow pointer, 3 px cells, its tip on the G's bar
            '    vec2 cc = floor((p - vec2(' + f1(bcx + 52) + ', ' + f1(ty + 4) + ')) / 3.0);',
            '    if (cc.x >= 0.0 && cc.x < 12.0 && cc.y >= 0.0 && cc.y < 17.0) {',
            '        if (bit(curB(cc.y), cc.x) > 0.5) c = vec3(0.0);',
            '        else if (bit(curW(cc.y), cc.x) > 0.5) c = vec3(1.0);',
            '    }',
        ]);
    },
    pocket(S) {
        const bx0 = 18, by0 = 10, bx1 = LOGO_W - 18, by1 = LOGO_H - 10, lx0 = 70, ly0 = 26, lx1 = LOGO_W - 34, ly1 = LOGO_H - 30;
        const k = 1.22, bcx = LOGO_W / 2, bcy = BY - H / 2, scx = (lx0 + lx1) / 2, scy = (ly0 + ly1) / 2;
        return [
            '    c = ' + v3(S.body) + ';',
            // the bezel: rounded, the lower right corner rounder
            '    vec2 bq = clamp(p, vec2(' + f1(bx0 + 14) + ', ' + f1(by0 + 14) + '), vec2(' + f1(bx1 - 14) + ', ' + f1(by1 - 14) + '));',
            '    float bz = length(p - bq) - 14.0;',
            '    vec2 rq = clamp(p, vec2(' + f1(bx0 + 40) + ', ' + f1(by0 + 40) + '), vec2(' + f1(bx1 - 40) + ', ' + f1(by1 - 40) + '));',
            '    if (p.x > ' + f1(bx1 - 40) + ' && p.y > ' + f1(by1 - 40) + ') bz = length(p - rq) - 40.0;',
            '    c = paint(c, cov(bz), ' + v3(S.bezel) + ');',
            // the power light
            '    { float l = length(p - vec2(' + f1(bx0 + 26) + ', ' + f1(scy - 20) + ')); c = min(c + ' + v3(S.led) + ' * 0.5 * soft(l - 5.0, 4.0), vec3(1.0)); c = paint(c, cov(l - 4.5), ' + v3(S.led) + '); }',
            // the screen: lightest green, a dot grid
            '    if (p.x >= ' + f1(lx0) + ' && p.x < ' + f1(lx1) + ' && p.y >= ' + f1(ly0) + ' && p.y < ' + f1(ly1) + ') {',
            '        c = ' + v3(S.s3) + ';',
            '        if (mod(p.x - ' + f1(lx0) + ', 6.0) < 1.0 || mod(p.y - ' + f1(ly0) + ', 6.0) < 1.0) c = mix(c, ' + v3(S.s2) + ', 0.45);',
            // the badge, sampled at the middle of each 6 px dot, scaled into the screen
            '        vec2 cell = floor((p - vec2(' + f1(lx0) + ', ' + f1(ly0) + ')) / 6.0) * 6.0 + vec2(' + f1(lx0 + 3) + ', ' + f1(ly0 + 3) + ');',
            '        q = badge((cell - vec2(' + f1(scx) + ', ' + f1(scy) + ')) * ' + f1(k) + ' + vec2(' + f1(bcx) + ', ' + f1(bcy) + '));',
            '        bool dot = mod(p.x - ' + f1(lx0) + ', 6.0) >= 1.0 && mod(p.y - ' + f1(ly0) + ', 6.0) >= 1.0;',
        ].concat(gD().map((l) => '    ' + l), STRIPES.map((b, i) => '            if (dot && sdBox(q, ' + v4(b) + ') < 0.0) c = ' + v3(S.stripes[i]) + ';'), [
            '        if (dot && g < 0.0) c = ' + v3(S.g) + ';',
            '    }',
        ]);
    },
    ccc(S) {
        const tx0 = 30, tx1 = LOGO_W - 30;
        return gD().concat([
            // black, ribbed taupe tiles either side, a raised tile in the middle with a bevel
            '    c = vec3(0.0);',
            '    if (p.y > 6.0 && p.y < SZ.y - 6.0) {',
            '        if (p.x < ' + f1(tx0 - 2) + ' || p.x > ' + f1(tx1 + 2) + ') c = mod(floor(p.y / 2.0), 2.0) < 0.5 ? ' + v3(S.rib0) + ' : ' + v3(S.rib1) + ';',
            '        else if (p.x > ' + f1(tx0) + ' && p.x < ' + f1(tx1) + ') {',
            '            c = mix(' + v3(S.face0) + ', ' + v3(S.face1) + ', (p.y - 6.0) / (SZ.y - 12.0));',
            '            if (p.y < 8.0 || p.x < ' + f1(tx0 + 2) + ') c = ' + v3(S.hi) + ';',
            '            if (p.y > SZ.y - 8.0 || p.x > ' + f1(tx1 - 2) + ') c = vec3(0.18, 0.16, 0.15);',
            '        }',
            '    }',
            // a soft shadow under the badge
            '    c = mix(c, vec3(0.0), 0.35 * soft(g - 3.0, 6.0));',
        ], STRIPES.map((b, i) => '    { float s = sdBox(q, ' + v4(b) + '); c = mix(c, vec3(0.0), 0.35 * soft(s - 3.0, 6.0)); c = paint(c, cov(s), mix(' + v3(S.stripes[i]) + ' * 1.15, ' + v3(S.stripes[i]) + ' * 0.8, clamp(q.y / BH, 0.0, 1.0))); }'), [
            // the G: brushed silver, light at the top, a dark keyline
            '    c = paint(c, cov(g + 0.0), vec3(0.32));',
            '    float br = 0.03 * sin(p.y * 1.7) + 0.02 * sin(p.y * 0.61 + 1.0);',
            '    c = paint(c, cov(g + 2.0), clamp(mix(' + v3(S.g0) + ', ' + v3(S.g1) + ', smoothstep(0.0, 1.0, q.y / BH)) + br, 0.0, 1.0));',
        ]);
    },
    pod(S) {
        const wx = 300, wy = 120, R = 112;
        return gD().concat([
            // the glossy white front: light at the top, a soft sheen across it
            '    c = mix(' + v3(S.body0) + ', ' + v3(S.body1) + ', smoothstep(0.0, 1.0, p.y / SZ.y));',
            '    c = min(c + vec3(0.05) * (1.0 - smoothstep(0.0, 0.25, p.y / SZ.y)), vec3(1.0));',
            // the touch wheel behind the G: its ring, its face, the centre button
            '    { float d = length(p - vec2(' + f1(wx) + ', ' + f1(wy) + '));',
            '      c = mix(c, vec3(0.0), 0.08 * soft(d - ' + f1(R + 4) + ', 6.0));',
            '      c = paint(c, cov(d - ' + f1(R) + '), ' + v3(S.ring) + ');',
            '      c = paint(c, cov(d - ' + f1(R - 3) + '), ' + v3(S.wheel) + ');',
            '      c = paint(c, cov(d - ' + f1(R * 0.38 + 3) + '), ' + v3(S.ring) + ');',
            '      c = paint(c, cov(d - ' + f1(R * 0.38) + '), ' + v3(S.body0) + '); }',
            // a soft shadow under the badge
            '    c = mix(c, vec3(0.0), 0.12 * soft(g - 3.0, 8.0));',
        ], STRIPES.map((b, i) => '    { float s = sdBox(q, ' + v4(b) + '); c = mix(c, vec3(0.0), 0.12 * soft(s - 3.0, 8.0)); c = paint(c, cov(s), mix(' + v3(S.stripes[i]) + ' * 1.12, ' + v3(S.stripes[i]) + ' * 0.85, clamp(q.y / BH, 0.0, 1.0))); }'), [
            // the G: charcoal, a little lighter at the top (gloss)
            '    c = paint(c, cov(g), mix(' + v3(S.g2) + ', ' + v3(S.g) + ', smoothstep(0.0, 0.5, q.y / BH)));',
        ]);
    },
    arcade(S) {
        const CELL = 6;
        return [
            // night sky, a few square stars
            '    c = mix(' + v3(S.sky0) + ', ' + v3(S.sky1) + ', p.y / SZ.y);',
            '    { vec2 sc = floor(p / 6.0); if (hash(sc) > 0.985) c = vec3(0.6 + 0.4 * hash(sc + 3.0)); }',
            // the badge sampled at each cell's middle: the shadow one cell down-right, then the badge itself
            '    vec2 cell = floor(p / ' + f1(CELL) + ') * ' + f1(CELL) + ' + ' + f1(CELL / 2) + ';',
            '    for (int k = 0; k < 2; k++) {',
            '        vec2 cp = k == 0 ? cell - vec2(' + f1(CELL) + ') : cell;',
            '        q = badge(cp);',
        ].concat(gD().map((l) => '    ' + l), [
            '        vec3 col = vec3(-1.0);',
        ], STRIPES.map((b, i) => '        if (sdBox(q, ' + v4(b) + ') < 0.0) col = ' + v3(S.stripes[i]) + ';'), [
            '        if (g < 0.0) col = ' + v3(S.g) + ';',
            '        if (col.x >= 0.0) c = k == 0 ? ' + v3(S.shadow) + ' : col;',
            '    }',
            // the cells' dark grid and the CRT's scanlines
            '    vec2 f = mod(p, ' + f1(CELL) + ');',
            '    if (f.x < 1.0 || f.y < 1.0) c *= 0.55;',
            '    if (mod(p.y, 3.0) < 1.0) c *= 0.72;',
            // the neon frame
            '    { vec2 e = min(p, SZ - p); float d = min(e.x, e.y); c = min(c + ' + v3(S.frame) + ' * 0.5 * soft(d - 6.0, 4.0), vec3(1.0)); if (d > 3.0 && d < 6.0) c = ' + v3(S.frame) + '; }',
        ]);
    },
    heist(S) {
        const sx = 300, sy = 150, sr = 84;
        const SC = STRIPES.map((b, i) => '    { float s = sdBox(q, ' + v4(b) + '); c = paint(c, cov(s - 4.0), vec3(0.0)); c = paint(c, cov(s), ' + v3(S.stripes[i]) + '); }');
        return gD().concat([
            // the sky at sunset: violet above, coral and amber down to the horizon
            '    float yy = p.y / SZ.y;',
            '    c = mix(' + v3(S.sky0) + ', ' + v3(S.sky1) + ', smoothstep(0.0, 0.4, yy));',
            '    c = mix(c, ' + v3(S.sky2) + ', smoothstep(0.35, 0.75, yy));',
            '    c = mix(c, ' + v3(S.sky3) + ', smoothstep(0.7, 0.95, yy));',
            // the sun: a soft halo, the disc, its lower half cut by bands of sky that widen downwards
            '    { float d = length(p - vec2(' + f1(sx) + ', ' + f1(sy) + ')) - ' + f1(sr) + ';',
            '      c = min(c + ' + v3(S.sun) + ' * 0.25 * soft(d, 16.0), vec3(1.0));',
            '      float by = p.y - ' + f1(sy + 6) + ', band = by > 0.0 && mod(by, 16.0) < 2.0 + by * 0.09 ? 1.0 : 0.0;',
            '      c = paint(c, cov(d) * (1.0 - band), mix(' + v3(S.sun) + ', ' + v3(S.stripes[0]) + ', smoothstep(' + f1(sy - sr) + ', ' + f1(sy + sr) + ', p.y) * 0.55)); }',
            // the skyline: blocks of varied height along the bottom, lit windows in a few of them
            '    { float bw = 22.0, bi = floor(p.x / bw), bh = 22.0 + 46.0 * hash(vec2(bi, 3.0)), top = SZ.y - bh;',
            '      if (hash(vec2(bi, 5.0)) < 0.3 && abs(mod(p.x, bw) - bw * 0.5) < 1.5) top -= 10.0;',
            '      if (p.y > top) { c = ' + v3(S.city) + ';',
            '        vec2 w = vec2(mod(p.x, bw), p.y - top); vec2 wc = floor(vec2(w.x - 4.0, w.y - 5.0) / vec2(6.0, 8.0));',
            '        if (w.x > 4.0 && w.x < bw - 4.0 && w.y > 5.0 && mod(w.x - 4.0, 6.0) < 3.0 && mod(w.y - 5.0, 8.0) < 4.0 && hash(wc + bi * 13.0) < 0.3) c = ' + v3(S.win) + '; } }',
            // a palm on the left: a leaning trunk and drooping fronds (distance to a few curves)
            '    { vec2 tp = vec2(26.0, 70.0); float pd = 1000.0;',
            '      pd = min(pd, sdLine(p, vec2(14.0, SZ.y), vec2(20.0, 150.0)) - 5.0);',
            '      pd = min(pd, sdLine(p, vec2(20.0, 150.0), tp) - 4.0);',
            '      for (int k = 0; k < 8; k++) { float fk = float(k), an = -3.05 + fk * 0.43, sg = an < -1.57 ? -1.0 : 1.0;',
            '        vec2 m = tp + vec2(cos(an), sin(an)) * 24.0, e = tp + vec2(cos(an + sg * 0.6), sin(an + sg * 0.6)) * 46.0 + vec2(0.0, 12.0);',
            '        pd = min(pd, min(sdLine(p, tp, m) - 5.0, sdLine(p, m, e) - 3.0 + 2.0 * clamp(length(p - m) / 30.0, 0.0, 1.0))); }',
            '      pd = min(pd, length(p - tp) - 6.0);',
            '      c = paint(c, cov(pd), ' + v3(S.palm) + '); }',
            // three wanted stars above the badge's right end
            '    for (int k = 0; k < 3; k++) { float d = sdStar5(p - vec2(' + f1(352) + ' + float(k) * 30.0, 15.0), 12.0, 0.45);',
            '      c = paint(c, cov(d - 2.5), vec3(0.0)); c = paint(c, cov(d), vec3(1.0)); }',
        ], SC, [
            // the G: white with a thick black outline, as a game's HUD draws its type
            '    c = paint(c, cov(g - 5.0), vec3(0.0));',
            '    c = paint(c, cov(g), mix(vec3(1.0), vec3(0.93, 0.9, 0.96), smoothstep(0.5, 1.0, q.y / BH)));',
        ]);
    },
};

/** The fragment shader (GLSL ES 1.00) for a look with a shader logo (kindOf(look) === 'fx'), else null. */
function fragment(look) {
    if (!has(look)) return null;
    const L = COMMON.concat([
        '// G\'s Dash 0.13.1 cluster logo (' + look + '): the badge drawn here, no picture',
        'void main() {',
        '    vec2 p = v_uv * SZ, q = badge(p);',
        '    vec3 c = vec3(0.0);',
    ], BODY[baseOf(look)](LOOKS[look]), [
        '    gl_FragColor = vec4(c, 1.0);',
        '}',
    ]);
    return L.join('\n') + '\n';
}

module.exports = { LOGO_W, LOGO_H, H, K, SW, SG, GW, T, MID, G0, BW, BX, BY, OY, STRIPES, GPARTS, SEGS, SEG_CUT, LOOKS, ORDER, baseOf, kindOf, fragment, PNG_OF, hex };
