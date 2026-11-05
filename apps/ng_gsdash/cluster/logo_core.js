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
 *   space      a nebula-filled G with a glowing cyan rim and its own stars, blue-violet stripes, a tilted
 *              orbit ring passing behind and in front of the badge with a small planet, a starfield
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
    space: { stripes: ['#4fe3ff', '#5b8cff', '#9b6bff'], sky0: '#020309', sky1: '#140a2e', neb0: '#1c0f4a', neb1: '#6a2bd0', neb2: '#d65cff',
        rim: '#a8f2ff', glow: '#4fe3ff', ring: '#7fe9ff', planet: '#e8b86a' },
};
/* 0.14.0: a look's colour variants (tints.js) with their own constants, keyed look-variant (digital-purple) */
(function () {
    const TINTS = require('./tints');
    TINTS.VARIANTS.digital.slice(1).forEach((v) => { LOOKS['digital-' + v.id] = { lit: v.c.lit, acc: v.c.amb }; });
}());
const ORDER = ['m', 'gt', 'digital', 'simracing', 'lumen', 'space'].concat(Object.keys(LOOKS).filter((k) => k.indexOf('-') > 0));
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
    '/* a sky of still stars: one candidate per s px cell, kept with probability k, a soft dot b bright */',
    'float stars(vec2 p, float s, float k) { vec2 cl = floor(p / s); float h = hash(cl + 7.0); if (h > k) return 0.0;',
    '    vec2 at = (cl + 0.2 + 0.6 * vec2(hash(cl + 19.0), hash(cl + 41.0))) * s; float b = 0.35 + 0.65 * hash(cl + 3.0);',
    '    return b * soft(length(p - at) - 0.45, 0.55); }',
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
    space(S) {
        const cx = LOGO_W / 2, cy = LOGO_H / 2 + 6, rx = 206, ry = 40, tilt = -0.17, ca = Math.cos(tilt), sa = Math.sin(tilt);
        // the orbit: an ellipse round the badge (distance by its gradient), its back half (y < 0 in its frame) behind the G
        const ring = [
            '    vec2 rl = p - vec2(' + f1(cx) + ', ' + f1(cy) + ');',
            '    rl = vec2(rl.x * ' + f1(ca) + ' + rl.y * ' + f1(sa) + ', -rl.x * ' + f1(sa) + ' + rl.y * ' + f1(ca) + ');',
            '    float re = length(rl / vec2(' + f1(rx) + ', ' + f1(ry) + '));',
            '    float rd = (re - 1.0) / max(length(rl / vec2(' + f1(rx * rx) + ', ' + f1(ry * ry) + ')) / max(re, 1e-3), 1e-4);',
            '    float rline = cov(abs(rd) - 0.9), rbloom = soft(abs(rd) - 0.9, 3.5);',
            // the small planet on the orbit (front right)
            '    vec2 pp = vec2(' + f1(cx + 0.72 * rx * ca - 0.69 * ry * sa) + ', ' + f1(cy + 0.72 * rx * sa + 0.69 * ry * ca) + ');',
            '    float pl = length(p - pp) - 9.0;',
        ];
        const SC = STRIPES.map((b, i) => '    { float s = sdBox(q, ' + v4(b) + '); c = min(c + ' + v3(S.stripes[i]) + ' * 0.5 * soft(s, 7.0), vec3(1.0)); c = paint(c, cov(s), ' + v3(S.stripes[i]) + ' * (0.75 + 0.25 * clamp(1.0 - q.y / BH, 0.0, 1.0))); }');
        return ring.concat(gD(), [
            // the sky: a violet glow behind the badge, stars (not where the G is)
            '    float r0 = length((p - vec2(' + f1(cx) + ', ' + f1(LOGO_H / 2) + ')) / vec2(240.0, 150.0));',
            '    c = mix(' + v3(S.sky1) + ', ' + v3(S.sky0) + ', clamp(r0, 0.0, 1.0));',
            '    c += vec3(0.85, 0.9, 1.0) * stars(p, 9.0, 0.22) * (1.0 - cov(g + 3.0));',
            '    c += vec3(1.0) * stars(p + 3.7, 23.0, 0.35) * 1.4 * (1.0 - cov(g + 3.0));',
            // the orbit's back half
            '    float back = step(rl.y, 0.0);',
            '    c = min(c + ' + v3(S.ring) + ' * (0.55 * rline + 0.25 * rbloom) * back * 0.7, vec3(1.0));',
            // the G: a nebula inside, its own faint stars, a rim of light and a bloom round it
            '    float gy = clamp(q.y / BH, 0.0, 1.0), gx = clamp((q.x - ' + f1(G0) + ') / ' + f1(GW) + ', 0.0, 1.0);',
            '    vec3 neb = mix(' + v3(S.neb0) + ', ' + v3(S.neb1) + ', smoothstep(0.0, 0.8, gy)) + ' + v3(S.neb2) + ' * 0.35 * smoothstep(0.45, 1.0, gx * gy);',
            '    neb += ' + v3(S.glow) + ' * 0.28 * (1.0 - smoothstep(0.0, 0.55, length(vec2(gx, gy * 1.3))));',
            '    neb += vec3(1.0) * stars(q, 7.0, 0.30) * 0.9;',
            '    c = min(c + ' + v3(S.glow) + ' * 0.55 * soft(g, 9.0), vec3(1.0));',
            '    c = paint(c, cov(g), neb);',
            '    float rim = clamp(cov(g) - cov(g + 2.2), 0.0, 1.0);',
            '    c = paint(c, rim, ' + v3(S.rim) + ');',
        ], SC, [
            // the orbit's front half over the G, and its planet
            '    c = min(c + ' + v3(S.ring) + ' * (0.75 * rline + 0.3 * rbloom) * (1.0 - back), vec3(1.0));',
            '    c = min(c + ' + v3(S.planet) + ' * 0.35 * soft(pl, 6.0), vec3(1.0));',
            '    c = paint(c, cov(pl), ' + v3(S.planet) + ' * (0.55 + 0.45 * clamp((pp.y - p.y + 6.0) / 14.0, 0.0, 1.0)));',
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
