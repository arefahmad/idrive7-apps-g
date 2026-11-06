'use strict';
/*
 * hud_core.js - G's Dash's HUD (0.13.0: a big gear and a tach arc; the stock HUD shows the speed): what is
 * drawn, where, and the shader that draws it. One effect layer covers the whole HUD (cluster-render
 * target 'hud', 800 x 480):
 *   - the tach: an arc of segments (centre ARC.c, radius ARC.r, ARC.t thick, from ARC.a0 to ARC.a1 degrees;
 *     0 = right, -90 = up) from 0 to the max rpm, drawn in the shader (no art). A segment lights when the
 *     rpm passes its middle: the look's base colour, then three shift-light zones over the last RANGE
 *     rpm before the shift point (at the start, +1000, +1500). Unlit segments are dim, dim red at and past
 *     the shift point. Past the shift point every segment flashes (about 4 Hz) in the look's flash colour.
 *     Numerals 0..max (x1000) inside the arc with short ticks, red above the shift point, and "x1000 r/min".
 *   - the gear, big, centred under the arc: R, N, D as letters; a gearbox gear as D3-style text (the
 *     selector's letter - D, or M / S if the car ever reports them - small, then the number); none in P
 *     and never a guessed number (a big D instead while the selector says D).
 * Per look (LOOKS): the arc's shape (slanted bars, square LEDs, beads, pixel blocks) and colours. The
 * glyphs are one greyscale atlas per look, hud_gear_<look>.png (r8 on the GPU; tools/bake_gsdash_hud.js),
 * hud_gear.js says where: per look big (GEARS), pre (PRE), num (0..9) and label cells.
 * TODO (speed limit): not shown. The car's speed-limit info (camera / map) is not among the signals
 * G's Dash reads; if it becomes readable it could sit under the gear. Node 8.
 */
const ATLAS = require('./hud_gear');

const HUD = { w: 800, h: 480 };
/*
 * 0.13.0 sizing (Nick: "half the size and make the tach proportional"): the gear's ink 70 px tall, half of the
 * 0.12.x HUD's 140 px gear; the tach and its numerals scaled with it (SCALE = 70 / 130 of the first Option B
 * draft), the group (about 315 x 180 px) centred on x 400 and on y 270, the 0.12.x HUD's speed + gear band.
 */
const SCALE = 7 / 13;
const ARC = { c: [400, 359], r: 178, t: 22, a0: -152, a1: -28 };
const GEAR_BASE = 327;           // the gear's baseline (ink bottom)
const GEAR_X = 400;              // the gear (prefix + number) centred on x
const PRE_GAP = 5;               // px between the prefix and the number
const NUM_R = ARC.r - ARC.t - 18;   // the numerals' centres
const LABEL = [400, 355];        // "x1000 r/min", centred
const NUM_BAND = [33, 1];        // the numerals' and ticks' ring: from R - T - 33 to R - T - 1
const TICK = [8, 2, 1.2];        // the ticks: from R - T - 8 to R - T - 2, 1.2 px wide
const GEARS = ['R', 'N', 'D', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'M'];      // 0.14.1: S (DS), M (the M program, no gear)
const PRE = ['D', 'M', 'S'];
const RANGE = 2000;              // the shift-light zones cover the last RANGE rpm before the shift point
const BLINK_MS = 120;            // the flash: on / off every 120 ms (about 4 Hz)
const RPM_Q = 50;                // the rpm is sent in steps of 50: no pushes for wobble below that
const ORDER = ['m', 'gt', 'digital', 'simracing', 'lumen', 'pixel', 'vector', 'space', 'aura', 'desktop', 'pocket', 'nextgen', 'heist', 'arcade', 'pod'];
/*
 * The looks: n segments, slant (degrees at the inner edge), gap (px between segments), inset (px off the
 * arc's inner / outer edge), shape bar | bead (beadR), pq (pixel blocks of pq px, hard edges), glow
 * [radius px, strength] on lit segments; colours: base, zones (3), flash (flash2: every other segment),
 * dim, redDim (unlit at / past the shift point), tick, tickRed, gear / gear2 (gear2: the glyph's glow or
 * shadow), pre / pre2, gearFlash (the gear takes the flash colour too).
 */
const LOOKS = {
    m: { n: 28, slant: 2.2, gap: 2, inset: 0, base: '#c9d3de', zones: ['#5fb4e8', '#2f63d8', '#e8262b'], flash: '#ff2a2a',
        dim: '#2a2e36', redDim: '#400a0c', tick: '#7c8492', tickRed: '#e8262b', gear: '#eef1f5', pre: '#5fb4e8', glow: [2, 0.35] },
    gt: { n: 28, slant: 0, gap: 3, inset: 2, base: '#aab4c0', zones: ['#2ecc71', '#ffd400', '#ff3030'], flash: '#2f7bff',
        dim: '#262a31', redDim: '#400c0c', tick: '#8a95a3', tickRed: '#ff3030', gear: '#ffd400', pre: '#aab4c0', gearFlash: true, glow: [3, 0.4] },
    digital: { n: 36, slant: 0, gap: 2, inset: 3, base: '#41f2cf', zones: ['#41f2cf', '#ffa63a', '#ff3b3b'], flash: '#ff3b3b',
        dim: '#0f2c27', redDim: '#3a0f0f', tick: '#2a9c86', tickRed: '#ff3b3b', gear: '#ffa63a', pre: '#41f2cf', glow: [2, 0.3] },
    simracing: { n: 28, slant: 0, gap: 2, inset: 0, base: '#d5dae2', zones: ['#2fd27a', '#ffc21a', '#ff2a2a'], flash: '#2a7dff',
        dim: '#24282f', redDim: '#3e0b0b', tick: '#8b93a1', tickRed: '#ff2a2a', gear: '#ffc21a', pre: '#8b93a1', gearFlash: true, glow: [2, 0.35] },
    lumen: { n: 24, shape: 'bead', beadR: 5, base: '#bfe9ff', zones: ['#2fd27a', '#ffc21a', '#ff4d5e'], flash: '#ff4d5e', flash2: '#e6fbff',
        dim: '#16292f', redDim: '#2e0f13', tick: '#4fa8c4', tickRed: '#ff4d5e', gear: '#7fe3ff', gear2: '#2f8bff', pre: '#7fe3ff', pre2: '#2f8bff', glow: [5, 0.9] },
    // Pixel: hard-edged blocks; colours from its default variant, Night (tints.js; 0.14.3)
    pixel: Object.assign({ n: 20, slant: 0, gap: 4, inset: 2, pq: 2, solid: true }, require('./tints').VARIANTS.pixel[0].c.hud),
    // Vector: many thin segments, little glow; colours from its default variant (tints.js)
    vector: Object.assign({ n: 48, slant: 0, gap: 2, inset: 5, glow: [1, 0.18] }, require('./tints').VARIANTS.vector[0].c.hud),
    // Space: round beads with a soft glow, cyan to the shift lights, violet flashes; Vector's glyphs (the same Saira)
    space: { n: 30, shape: 'bead', beadR: 4.5, base: '#4fe3ff', zones: ['#9b6bff', '#ffb547', '#ff4d6a'], flash: '#ff4d6a', flash2: '#d65cff',
        dim: '#151a3a', redDim: '#2e0f19', tick: '#5b6aa8', tickRed: '#ff4d6a', gear: '#eef3ff', gear2: '#9b6bff', pre: '#4fe3ff', pre2: '#5b8cff', glow: [4, 0.75] },
    // Aura: slanted blazing bars, calm blue to gold, electric blue flashes; M Style's italic glyphs (the same Saira Italic)
    aura: { n: 26, slant: 3, gap: 2, inset: 0, base: '#ffd23f', zones: ['#ff9a1f', '#ff5a1f', '#ff2a2a'], flash: '#9fe8ff', flash2: '#ffffff',
        dim: '#2a1a16', redDim: '#3e0b0b', tick: '#c9a988', tickRed: '#ff3b2f', gear: '#fff2c2', gear2: '#ff9a1f', pre: '#ffd23f', pre2: '#ff7a1a', gearFlash: true, glow: [4, 0.8] },
    // Desktop '98: progress-bar blocks in bright system colours, hard edges; the Pixel look's glyphs (the G's Dash pixel font)
    desktop: { n: 22, slant: 0, gap: 4, inset: 2, pq: 2, solid: true, base: '#1084d0', zones: ['#ffff00', '#ff8000', '#ff2020'], flash: '#ffffff',
        dim: '#1c2a3a', redDim: '#401010', tick: '#c0c0c0', tickRed: '#ff2020', gear: '#ffffff', pre: '#c0c0c0', glow: [1, 0.2] },
    // Pocket: dot-matrix greens, hard blocks, the shift lights brightening to near white; the Pixel look's glyphs
    pocket: { n: 20, slant: 0, gap: 4, inset: 2, pq: 2, solid: true, base: '#8bac0f', zones: ['#9bbc0f', '#c8e858', '#f0ffc0'], flash: '#ffffff',
        dim: '#1c2e10', redDim: '#304818', tick: '#8bac0f', tickRed: '#c8e858', gear: '#9bbc0f', pre: '#8bac0f', glow: [2, 0.3] },
    // Next Gen: many thin ice-blue segments with a soft glow, amber then red at the shift point; Vector's glyphs (the same Saira)
    nextgen: { n: 44, slant: 0, gap: 2, inset: 4, base: '#9fdcff', zones: ['#ffffff', '#ffb03a', '#ff4646'], flash: '#ff4646', flash2: '#ffffff',
        dim: '#14244e', redDim: '#3a1218', tick: '#5b78b8', tickRed: '#ff4646', gear: '#ffffff', gear2: '#2f7bff', pre: '#9fdcff', pre2: '#2f7bff', glow: [3, 0.5] },
    // Heist: bold game-HUD bars, green to yellow to red, red and blue flashes like a patrol car's lights; Sim Racing's glyphs (the same Titillium)
    heist: { n: 24, slant: 0, gap: 3, inset: 1, base: '#5fd068', zones: ['#5fd068', '#ffd23a', '#ff3b3b'], flash: '#ff3b3b', flash2: '#4aa3ff',
        dim: '#221a2e', redDim: '#3e0b10', tick: '#8a7fa0', tickRed: '#ff3b3b', gear: '#ffffff', gear2: '#000000', pre: '#5fd068', glow: [2, 0.4] },
    // Arcade: chunky pixel blocks like its POWER bar, green / yellow / red, flashing white and red; the Pixel look's glyphs
    arcade: { n: 22, slant: 0, gap: 4, inset: 2, pq: 2, solid: true, base: '#3cff5a', zones: ['#3cff5a', '#ffd800', '#ff3030'], flash: '#ffffff', flash2: '#ff3030',
        dim: '#1a1a26', redDim: '#3a0a10', tick: '#22e4ff', tickRed: '#ff3030', gear: '#ffd800', pre: '#22e4ff', glow: [2, 0.35] },
    // Pod '04: round-ended bars in the selection blue, amber then red at the shift point, a soft glow; Sim Racing's glyphs (the same Titillium)
    pod: { n: 30, slant: 0, gap: 3, inset: 3, base: '#c9d3da', zones: ['#6fb1f0', '#ff9f2e', '#ff3b30'], flash: '#ff3b30', flash2: '#ffffff',
        dim: '#1e252c', redDim: '#3a1210', tick: '#8a96a0', tickRed: '#ff3b30', gear: '#f3f6f8', gear2: '#3d8ae0', pre: '#6fb1f0', pre2: '#2f73cc', glow: [3, 0.45] },
};
/* a look drawn with another's glyph atlas (an alpha mask, so any colours): Space uses Vector's */
const ATLAS_LOOK = { space: 'vector', aura: 'm', desktop: 'pixel', pocket: 'pixel', nextgen: 'vector', heist: 'simracing', arcade: 'pixel', pod: 'simracing' };
/* colour variants (tints.js): 'look.tint' - the same shape, the variant's colours; the gear atlas is
   an alpha mask, so the base look's picture serves every variant (no new asset) */
(function () {
    const TV = require('./tints').VARIANTS;
    Object.keys(TV).forEach((look) => TV[look].slice(1).forEach((v) => {
        const b = LOOKS[look], c = v.c;
        if (!b || !c.hud) {
            if (look !== 'digital') return;
            LOOKS[look + '-' + v.id] = Object.assign({}, b, { base: c.lit, zones: [c.lit, c.amb, c.critHud], flash: c.critHud,
                dim: c.hudDim, redDim: c.redDim, tick: c.dim, tickRed: c.critHud, gear: c.amb, pre: c.lit });
        } else LOOKS[look + '-' + v.id] = Object.assign({}, b, c.hud);
    }));
}());
const baseLook = (look) => String(look).split('-')[0];
const lookOf = (look) => (LOOKS[look] ? look : 'm');
/** The look's atlas (hud_gear.js meta: file, w, h, sampling, big, pre, num, label) or null */
function atlasOf(look) { const b = baseLook(look); return (ATLAS.looks && LOOKS[look] && ATLAS.looks[ATLAS_LOOK[b] || b]) || null; }
/** The tach's top in rpm for a redline: the next 1000 above redline + 500 (5000..10000) */
function maxRpmOf(redline) {
    const r = Number(redline);
    return Math.max(5000, Math.min(10000, Math.ceil(((isFinite(r) && r > 0 ? r : 6500) + 500) / 1000) * 1000));
}

/**
 * The gear shown: { big, pre } (labels or null). The gearbox's gear only: P, unknown ('-') and no signal:
 * none. R, N, D as letters; a number with its selector letter (D, or M / S if the car says so) in front; a
 * guessed number: the selector's letter alone (D / M / S), else none.
 */
function gearShown(text, stage, guessed) {
    const g = text == null ? '' : String(text), st = stage == null ? '' : String(stage);
    const sel = PRE.indexOf(st) >= 0 ? st : null;
    if (!g || g === '-' || g === 'P') return { big: null, pre: null };
    if (/^[1-9]$/.test(g)) return guessed ? { big: sel, pre: null } : { big: g, pre: sel || 'D' };
    // 0.14.1: the gearbox program (lib.js gearText): DS as D3 is drawn (D small, S big); M3 with M in front;
    // M alone (no gear, or one only guessed: never a guessed number)
    if (g === 'DS') return { big: 'S', pre: 'D' };
    if (/^M[1-9]$/.test(g)) return guessed ? { big: 'M', pre: null } : { big: g.slice(1), pre: 'M' };
    return { big: GEARS.indexOf(g) >= 0 ? g : null, pre: null };
}

/**
 * What the HUD shows for rpm, the shift point, the gear: { rpm (in RPM_Q steps, 0: none), mode (0 no rpm,
 * 1 the arc, 2 flash off, 3 flash on), lit (0..1 of the shift-light range, for the log), gear (GEARS index
 * or -1), pre (PRE index or -1) }.
 */
function frame(o, now) {
    const rpm = Number(o.rpm), shift = Number(o.shift);
    const has = o.rpm != null && o.rpm !== '' && isFinite(rpm);
    const ok = has && isFinite(shift) && shift > 0;
    const r = has ? Math.max(0, Math.round(rpm / RPM_Q) * RPM_Q) : 0;
    const lit = ok ? Math.round(Math.max(0, Math.min(1, (rpm - (shift - RANGE)) / RANGE)) * 100) / 100 : 0;
    let mode = has ? 1 : 0;
    if (ok && rpm >= shift) mode = Math.floor(now / BLINK_MS) % 2 === 0 ? 3 : 2;
    const g = gearShown(o.gear, o.stage, o.guessed);
    return { rpm: r, mode, lit, gear: g.big ? GEARS.indexOf(g.big) : -1, pre: g.pre ? PRE.indexOf(g.pre) : -1 };
}

/**
 * Where the gear goes: { gx, px } - the big cell's and the prefix cell's left on the HUD, so that prefix +
 * PRE_GAP + number (their inks) sit centred on GEAR_X. (-1 when not shown.)
 */
function layout(meta, gear, pre) {
    if (!meta || gear < 0) return { gx: -1, px: -1 };
    const B = meta.big, P = meta.pre, bi = B.ink[gear];
    const pw = pre >= 0 ? P.ink[pre][1] * P.s + PRE_GAP : 0, total = pw + bi[1] * B.s;
    const x0 = Math.round(GEAR_X - total / 2);
    return { gx: x0 + pw - bi[0] * B.s, px: pre >= 0 ? x0 - P.ink[pre][0] * P.s : -1 };
}
/** The uniforms for a frame: u_lv [rpm, mode, gear, pre], u_cfg [shift, max rpm, gear x, prefix x] */
function uniforms(meta, f, shift, maxRpm) {
    const L = layout(meta, f.gear, f.pre);
    return { u_lv: [f.rpm, f.mode, f.gear, L.gx < 0 ? -1 : f.pre], u_cfg: [Math.round(Number(shift) || 0), maxRpm, L.gx, L.px] };
}

const f1 = (v) => { const s = String(Math.round(v * 10000) / 10000); return s.indexOf('.') < 0 && s.indexOf('e') < 0 ? s + '.0' : s; };
const v2 = (a, b) => 'vec2(' + f1(a) + ', ' + f1(b) + ')';
const hex = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const v3 = (c) => { const h = hex(c); return 'vec3(' + h.map((x) => f1(x / 255)).join(', ') + ')'; };

/** The fragment shader for a look (GLSL ES 1.00); meta: atlasOf(look) */
function fragment(look, meta) {
    const id = lookOf(look), S = LOOKS[id], B = meta || atlasOf(id);
    const near = B.sampling === 'nearest', bead = S.shape === 'bead', gl = S.glow || [1, 0];
    const cellAt = (c) => v2(c.at[0], c.at[1]);
    const L = [
        '#ifdef GL_FRAGMENT_PRECISION_HIGH',
        'precision highp float;',
        '#else',
        'precision mediump float;',
        '#endif',
        '// G\'s Dash HUD 0.13.0 (' + id + '): a tach arc drawn here, the gear from one r8 atlas',
        'varying vec2 v_uv;',
        'uniform sampler2D u_big;   // r8: the look\'s gear, prefix, numeral and label cells',
        'uniform float u_fresh;',
        'uniform vec4 u_lv;         // rpm, mode (0 none, 1 arc, 2 flash off, 3 flash on), gear cell, prefix cell',
        'uniform vec4 u_cfg;        // shift rpm, max rpm, gear x, prefix x',
        'const vec2 SZ = ' + v2(HUD.w, HUD.h) + ';',
        'const vec2 ASZ = ' + v2(B.w, B.h) + ';',
        'const vec2 C = ' + v2(ARC.c[0], ARC.c[1]) + ';',
        'const float R = ' + f1(ARC.r) + ';',
        'const float T = ' + f1(ARC.t) + ';',
        'const float A0 = ' + f1(ARC.a0) + ';',
        'const float A1 = ' + f1(ARC.a1) + ';',
        'const float NSEG = ' + f1(S.n) + ';',
        'const float GAP = ' + f1(S.gap || 0) + ';',
        'const float INSET = ' + f1(S.inset || 0) + ';',
        'const float SLANT = ' + f1(S.slant || 0) + ';',
        'const float BEADR = ' + f1(S.beadR || 0) + ';',
        'const float PQ = ' + f1(S.pq || 0) + ';',
        'const float GLOWR = ' + f1(gl[0]) + ';',
        'const float GLOWK = ' + f1(gl[1]) + ';',
        'const float NUMR = ' + f1(NUM_R) + ';',
        'const vec3 BASE = ' + v3(S.base) + ';',
        'const vec3 Z1 = ' + v3(S.zones[0]) + ';',
        'const vec3 Z2 = ' + v3(S.zones[1]) + ';',
        'const vec3 Z3 = ' + v3(S.zones[2]) + ';',
        'const vec3 FL = ' + v3(S.flash) + ';',
        'const vec3 FL2 = ' + v3(S.flash2 || S.flash) + ';',
        'const vec3 DIM = ' + v3(S.dim) + ';',
        'const vec3 RDIM = ' + v3(S.redDim) + ';',
        'const vec3 TICK = ' + v3(S.tick) + ';',
        'const vec3 TICKR = ' + v3(S.tickRed) + ';',
        'const vec3 GC = ' + v3(S.gear) + ';',
        'const vec3 GC2 = ' + v3(S.gear2 || S.gear) + ';',
        'const vec3 PC = ' + v3(S.pre) + ';',
        'const vec3 PC2 = ' + v3(S.pre2 || S.pre) + ';',
        '/* light on black: the brightest channel is the alpha (black is see-through on the HUD) */',
        'vec4 light(vec3 c, float k) { float m = max(max(c.r, c.g), c.b); return m > 0.0 ? vec4(c / m, clamp(m * k, 0.0, 1.0)) : vec4(0.0); }',
        'vec4 over(vec4 t, vec4 c) { float a = t.a + c.a * (1.0 - t.a); return vec4((t.rgb * t.a + c.rgb * c.a * (1.0 - t.a)) / max(a, 0.0001), a); }',
        '/* the atlas level at px p inside a cell (unscaled) at atlas px at, sz the cell */',
        'float ink(vec2 p, vec2 at, vec2 sz) {',
        '    if (p.x < 0.0 || p.y < 0.0 || p.x >= sz.x || p.y >= sz.y) return 0.0;',
        near ? '    return texture2D(u_big, (floor(at + p) + 0.5) / ASZ).r;'
            : '    return texture2D(u_big, (at + clamp(p, vec2(0.5), sz - 0.5)) / ASZ).r;',
        '}',
        '/* a glyph level -> colour: full level c1, the lower levels (glow / shadow) c2 */',
        'vec4 glyph(float v, vec3 c1, vec3 c2) {',
        '    if (v < 0.004) return vec4(0.0);',
        S.solid ? '    return vec4(v > 0.75 ? c1 : c2, step(0.2, v));'
            : '    return vec4(mix(c2, c1, smoothstep(0.55, 0.9, v)), v);',
        '}',
        'void main() {',
        '    vec2 q = floor(v_uv * SZ) + 0.5;',
        '    vec4 c = vec4(0.0);',
        '    float rpm = u_lv.x, mode = floor(u_lv.y + 0.5);',
        '    float shift = u_cfg.x, mx = max(u_cfg.y, 1000.0), stp = mx / NSEG;',
        '    vec2 qa = PQ > 0.5 ? (floor(q / PQ) + 0.5) * PQ : q;',
        '    vec2 p = qa - C;',
        '    float r = length(p);',
        '    // the arc',
        '    if (r > R - T - GLOWR * 3.0 - 2.0 && r < R + GLOWR * 3.0 + 2.0) {',
        '        float ang = degrees(atan(p.y, p.x)) + SLANT * (R - r) / T;',
        '        float t = (ang - A0) / (A1 - A0) * NSEG;',
        '        float i = clamp(floor(t), 0.0, NSEG - 1.0);',
        '        float d;',
        bead ? [
            '        float am = radians(A0 + (A1 - A0) * (i + 0.5) / NSEG);',
            '        d = length(p - vec2(cos(am), sin(am)) * (R - T * 0.5)) - BEADR;'].join('\n')
            : [
                '        float f = t - i, segpx = radians((A1 - A0) / NSEG) * r;',
                '        float da = GAP * 0.5 - min(f, 1.0 - f) * segpx;',
                '        float dr = max((R - T + INSET) - r, r - (R - INSET));',
                '        d = (da > 0.0 && dr > 0.0) ? length(vec2(da, dr)) : max(da, dr);'].join('\n'),
        '        float lo = i * stp;',
        '        vec3 col = lo >= shift ? RDIM : DIM;',
        '        float on = 0.0;',
        '        if (mode > 2.5) { col = mod(i, 2.0) > 0.5 ? FL2 : FL; on = 1.0; }',
        '        else if (mode > 0.5 && mode < 1.5 && rpm > 0.0 && rpm >= lo + stp * 0.5) {',
        '            col = lo >= shift - 500.0 ? Z3 : (lo >= shift - 1000.0 ? Z2 : (lo >= shift - ' + f1(RANGE) + ' ? Z1 : BASE));',
        '            on = 1.0;',
        '        }',
        S.pq ? '        float cov = step(d, 0.0);' : '        float cov = clamp(0.5 - d, 0.0, 1.0);',
        '        float g = on > 0.5 ? GLOWK * exp(-max(d, 0.0) / GLOWR) * step(0.0, d) : 0.0;',
        '        c = light(col, max(cov, g));',
        '    }',
        '    // the numerals (x1000) and their ticks',
        '    if (r > R - T - ' + f1(NUM_BAND[0]) + ' && r < R - T - ' + f1(NUM_BAND[1]) + ') {',
        '        for (int k = 0; k < 10; k++) {',
        '            float kr = float(k) * 1000.0;',
        '            if (kr > mx + 0.5) break;',
        '            float ta = radians(A0 + (A1 - A0) * kr / mx);',
        '            vec2 dir = vec2(cos(ta), sin(ta));',
        '            vec3 tc = kr > shift + 0.5 ? TICKR : TICK;',
        '            float along = dot(p, dir), across = abs(p.x * dir.y - p.y * dir.x);',
        '            if (along > R - T - ' + f1(TICK[0]) + ' && along < R - T - ' + f1(TICK[1]) + ') c = over(light(tc, clamp(' + f1(TICK[2]) + ' - across, 0.0, 1.0)), c);',
        '            vec2 nc = C + dir * NUMR;',
        '            vec2 np = (q - nc) / ' + f1(B.num.s) + ' + ' + v2(B.num.cell[0] / 2, B.num.cell[1] / 2) + ';',
        '            float v = ink(np, ' + cellAt(B.num) + ' + vec2(float(k) * ' + f1(B.num.cell[0]) + ', 0.0), ' + v2(B.num.cell[0], B.num.cell[1]) + ');',
        '            c = over(glyph(v, tc, tc), c);',
        '        }',
        '    }',
        '    // x1000 r/min',
        '    {',
        '        vec2 lp = (q - ' + v2(LABEL[0], LABEL[1]) + ') / ' + f1(B.label.s) + ' + ' + v2(B.label.cell[0] / 2, B.label.cell[1] / 2) + ';',
        '        c = over(glyph(ink(lp, ' + cellAt(B.label) + ', ' + v2(B.label.cell[0], B.label.cell[1]) + '), TICK, TICK), c);',
        '    }',
        '    // the gear: the number (or letter) and its selector letter in front',
        '    float gi = floor(u_lv.z + 0.5);',
        '    if (gi > -0.5) {',
        '        vec3 gc = ' + (S.gearFlash ? 'mode > 2.5 ? FL : GC' : 'GC') + ';',
        '        vec2 gp = (q - vec2(u_cfg.z, ' + f1(B.big.top) + ')) / ' + f1(B.big.s) + ';',
        '        c = over(glyph(ink(gp, ' + cellAt(B.big) + ' + vec2(gi * ' + f1(B.big.cell[0]) + ', 0.0), ' + v2(B.big.cell[0], B.big.cell[1]) + '), gc, GC2), c);',
        '        float pi = floor(u_lv.w + 0.5);',
        '        if (pi > -0.5) {',
        '            vec2 pp = (q - vec2(u_cfg.w, ' + f1(B.pre.top) + ')) / ' + f1(B.pre.s) + ';',
        '            c = over(glyph(ink(pp, ' + cellAt(B.pre) + ' + vec2(pi * ' + f1(B.pre.cell[0]) + ', 0.0), ' + v2(B.pre.cell[0], B.pre.cell[1]) + '), PC, PC2), c);',
        '        }',
        '    }',
        '    gl_FragColor = vec4(c.rgb, c.a * clamp(u_fresh, 0.0, 1.0));',
        '}',
    ];
    return L.join('\n') + '\n';
}

/** The atlas png's pixels as one byte a pixel (the red channel of the decoded image) */
function r8(img) {
    const n = img.w * img.h, out = new Uint8Array(n), ch = img.data.length / n;
    for (let i = 0; i < n; i++) out[i] = img.data[i * ch];
    return out;
}

module.exports = { HUD, SCALE, NUM_BAND, TICK, ARC, GEAR_BASE, GEAR_X, PRE_GAP, NUM_R, LABEL, GEARS, PRE, RANGE, BLINK_MS, RPM_Q, ORDER, LOOKS, ATLAS,
    lookOf, atlasOf, maxRpmOf, gearShown, frame, layout, uniforms, fragment, r8 };
