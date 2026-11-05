'use strict';
/*
 * tints.js - (0.14.0) colour variants inside a look, shared by every look. A look lists its variants
 * (VARIANTS[lookId]: the first is its default); the choice is one setting, 'tints', kept per look as
 * "digital:purple,vector:amber" (a look absent: its default), so switching looks keeps each look's colour.
 * Every consumer asks for the variant id and builds its colours from it:
 *   the page        look_<id>.js apply(colours) recolours the look's module colours and palette in place
 *   the HUD         hud_core.js LOOKS[look + '-' + tint] (shader constants only, the gear atlas is a mask)
 *   the cluster     skin id look + '-' + tint -> skin_<look>-<tint>.png (baked per variant, only the
 *                   active one decoded and uploaded); the logo's shader constants (no picture; Pixel's
 *                   emblem is the same in every variant)
 * Node 8.
 */
const VARIANTS = {
    digital: [
        { id: 'green', name: 'Green', swatch: '#41f2cf', c: {
            lit: '#41f2cf', amb: '#ffa63a', crit: '#ff4130', critHud: '#ff3b3b', redDim: '#3a0f0f',
            dim: '#2a9c86', deep: '#1d6d5e', tick: '#174a42', edge: '#0f2a26', hudDim: '#0f2c27', skinTrack: '#102e28',
            track: '#0a1a18', panelTop: '#071010', card: '#041010', fluidTrack: '#0b1513', bg0: '#030807',
            panelBottom: '#020505', bg2: '#020404', bg: '#010303', marker: '#e8fff8', ghost: 0.07, hot: '#ff4130' } },
        // 0.14.0: a deeper, less pastel violet (was #b67cff), its dims and darks with it
        { id: 'purple', name: 'Purple', swatch: '#9b5cff', c: {
            lit: '#9b5cff', amb: '#ffa63a', crit: '#ff4130', critHud: '#ff3b3b', redDim: '#3a0f0f',
            dim: '#7d4fd0', deep: '#56368f', tick: '#3c2766', edge: '#23173c', hudDim: '#25183f', skinTrack: '#281a44',
            track: '#160e26', panelTop: '#0d0818', card: '#0c0719', fluidTrack: '#110c1c', bg0: '#07040e',
            panelBottom: '#040308', bg2: '#030206', bg: '#020105', marker: '#f4ecff', ghost: 0.10, hot: '#ff4130' } },
        // red: the lit colour is the look's red, so past-redline / over-temperature / SPORT+ go white-hot
        // (with the existing flash) and the amber shift band stays amber
        { id: 'red', name: 'Red', swatch: '#ff3b4c', c: {
            lit: '#ff3b4c', amb: '#ffa63a', crit: '#fff1e6', critHud: '#fff1e6', redDim: '#2c2624',
            dim: '#d55963', deep: '#963e45', tick: '#652c2f', edge: '#3a191b', hudDim: '#3d1a1c', skinTrack: '#3f1b1d',
            track: '#241011', panelTop: '#160a0b', card: '#180809', fluidTrack: '#1c0e0f', bg0: '#0d0405',
            panelBottom: '#080303', bg2: '#060303', bg: '#050202', marker: '#ffefef', ghost: 0.085, hot: '#fff1e6' } },
    ],
    // Vector (0.14.0): thin lines, a measuring grid, crisp numerals. c: lit (scale, bars), lit2 (its deep end), ink (numerals),
    // shift (the shift band), crit (past redline, over-temperature), label / faint / grid / track / edge (the darks), bg0 / bg1
    vector: [
        { id: 'ice', name: 'Ice', swatch: '#8ae6ff', c: {
            lit: '#8ae6ff', lit2: '#3a9fcf', ink: '#ecf9ff', shift: '#ffc04a', crit: '#ff3b4a', label: '#6f93a3', faint: '#2b4551',
            grid: '#0d2029', track: '#0b1920', edge: '#18323e', bg0: '#03080b', bg1: '#08131a',
            hud: { base: '#8ae6ff', zones: ['#8ae6ff', '#ffc04a', '#ff3b4a'], flash: '#ff3b4a', dim: '#10252e', redDim: '#3a0f14', tick: '#6f93a3', tickRed: '#ff3b4a', gear: '#ecf9ff', pre: '#8ae6ff' } } },
        // the motorsport stripes as colours only (light blue, dark blue, red): the scale runs light blue into
        // dark blue, the shift band is red, past redline flashes white-hot
        { id: 'motorsport', name: 'Motorsport', swatch: '#4fb2ff', swatch2: ['#4fb2ff', '#2a4be0', '#ff2d3f'], c: {
            lit: '#4fb2ff', lit2: '#2a4be0', ink: '#f2f6ff', shift: '#ff2d3f', crit: '#ffffff', label: '#7488b6', faint: '#2b385c',
            grid: '#0e152d', track: '#0b1224', edge: '#1b2849', bg0: '#03050c', bg1: '#080d1d',
            hud: { base: '#4fb2ff', zones: ['#4fb2ff', '#2a4be0', '#ff2d3f'], flash: '#ffffff', dim: '#111a33', redDim: '#3a0c12', tick: '#7488b6', tickRed: '#ff2d3f', gear: '#f2f6ff', pre: '#4fb2ff' } } },
        { id: 'amber', name: 'Amber', swatch: '#ffb240', c: {
            lit: '#ffb240', lit2: '#c2731b', ink: '#fff1dc', shift: '#f4f6f8', crit: '#ff3b3b', label: '#a6875c', faint: '#4d3c22',
            grid: '#1f170b', track: '#1a1309', edge: '#3a2b15', bg0: '#090603', bg1: '#120d06',
            hud: { base: '#ffb240', zones: ['#ffb240', '#f4f6f8', '#ff3b3b'], flash: '#ff3b3b', dim: '#2a1e0e', redDim: '#3a0f0f', tick: '#a6875c', tickRed: '#ff3b3b', gear: '#fff1dc', pre: '#ffb240' } } },
        { id: 'white', name: 'White', swatch: '#e9eef3', c: {
            lit: '#e9eef3', lit2: '#8a949e', ink: '#ffffff', shift: '#ffb84a', crit: '#ff3b4a', label: '#8a939c', faint: '#3b4148',
            grid: '#171a1e', track: '#131619', edge: '#2a2f35', bg0: '#060708', bg1: '#0d0f12',
            hud: { base: '#e9eef3', zones: ['#e9eef3', '#ffb84a', '#ff3b4a'], flash: '#ff3b4a', dim: '#1d2125', redDim: '#3a0f14', tick: '#8a939c', tickRed: '#ff3b4a', gear: '#ffffff', pre: '#e9eef3' } } },
    ],
    // Pixel (0.14.3): palette swaps, the way a retro game recolours a stage. c: sky (six bands, top down; sky[0] the
    // page's background), box / panelBottom / track / tick / barOff (unlit blocks) / floor / far / near (the hills) /
    // star / moon (light, body, spots), frame / frameDim (an unpicked card) / dim / white (text) / ring / ring2 (the
    // g radar), acc (the yellow: labels, a picked card, the gear) with accCard / accDown, cyan (units, the speedo's
    // fill), hp / hp2 / hpTop (the power bar), ghost (its peak trail), crit / crit2 / critTop / hot / heartHi /
    // redDim (red stays red in every one: past the shift point, too hot, the heart, the needles), flash / flashTop /
    // flash2 / flashInk (SHIFT! - the blocks and the word over them), cold (the cold zone), shade (the speedo
    // fill's far end and the speed digits' shadow on the cluster), wave (c1, c2, hi), hud (hud_core.js).
    // The emblem (px.js) keeps the G's Dash colours in every one.
    pixel: [
        { id: 'night', name: 'Night', swatch: '#5b4fd6', c: {
            sky: ['#0c0a24', '#100d2e', '#151137', '#1a1441', '#20184b', '#271c54'],
            box: '#141236', panelBottom: '#0d0b28', track: '#24204e', tick: '#4a4590', barOff: '#1d1a40', floor: '#150f38',
            far: '#2b2163', near: '#171338', star: '#8d88c8', moon: ['#fff6c8', '#d8cf9a', '#bdb37e'],
            frame: '#e8e6ff', frameDim: '#5a55a0', dim: '#8f8cc0', white: '#f4f4ff', ring: '#4a4590', ring2: '#2c2866',
            acc: '#ffd23a', accCard: '#2a2210', accDown: '#3a2e10', cyan: '#58e1ff',
            hp: '#3ee07a', hp2: '#1f9e50', hpTop: '#b6ffcf', ghost: '#ffe9b0',
            crit: '#ff3a4a', crit2: '#a8162a', critTop: '#ff9aa2', hot: '#ff4a5c', heartHi: '#ffc0c6', redDim: '#461228',
            flash: '#3a8bff', flashTop: '#a8ccff', flash2: '#1f4aa0', flashInk: '#f4f4ff', cold: '#3a8bff', shade: '#3a8bff',
            wave: ['#2c1e68', '#5432a0', '#ff6ec8'],
            hud: { base: '#e8e6ff', zones: ['#3ee07a', '#ffd23a', '#ff3a4a'], flash: '#3a8bff', dim: '#1c1a34', redDim: '#3a0f18', tick: '#9a98c0', tickRed: '#ff3a4a', gear: '#ffd23a', gear2: '#a8162a', pre: '#78c8ff', pre2: '#a8162a' } } },
        // dusk: a plum sky glowing toward the horizon, a low sun, peach frames, a teal power bar, pink and violet
        { id: 'sunset', name: 'Sunset', swatch: '#ff6a8e', c: {
            sky: ['#150823', '#1d0a2b', '#270c33', '#340e3a', '#45123f', '#591643'],
            box: '#1d0a25', panelBottom: '#16081e', track: '#3b1639', tick: '#7a3468', barOff: '#2f1031', floor: '#2b0c2f',
            far: '#5c1a4c', near: '#270b2b', star: '#d88ab4', moon: ['#fff2b8', '#ffb45a', '#ff8a4a'],
            frame: '#ffe4d2', frameDim: '#9a4478', dim: '#d48cb0', white: '#fff4f0', ring: '#7a3468', ring2: '#4a1a46',
            acc: '#ffbe3a', accCard: '#2e1c0a', accDown: '#3c260c', cyan: '#ff7ad0',
            hp: '#3ee2c4', hp2: '#2b9e89', hpTop: '#b4fff0', ghost: '#ffe0c4',
            crit: '#ff3a4a', crit2: '#a8162a', critTop: '#ff9aa2', hot: '#ff4a5c', heartHi: '#ffc0c6', redDim: '#461228',
            flash: '#a64dff', flashTop: '#dcb8ff', flash2: '#5a22a4', flashInk: '#fff4f0', cold: '#6a8cff', shade: '#a64dff',
            wave: ['#5a163e', '#922a5c', '#ffb066'],
            hud: { base: '#ffe4d2', zones: ['#3ee2c4', '#ffbe3a', '#ff3a4a'], flash: '#a64dff', dim: '#2a0f26', redDim: '#3a0f18', tick: '#d48cb0', tickRed: '#ff3a4a', gear: '#ffbe3a', gear2: '#a8162a', pre: '#ff7ad0', pre2: '#a8162a' } } },
        // underwater: deep teal water, bubbles for stars, seafoam and aqua, the yellow kept
        { id: 'ocean', name: 'Ocean', swatch: '#2cc6d4', c: {
            sky: ['#03121a', '#041821', '#061e29', '#082531', '#0a2d3a', '#0d3643'],
            box: '#061c26', panelBottom: '#04151d', track: '#0e3540', tick: '#2a7482', barOff: '#0b2b35', floor: '#062430',
            far: '#0f4552', near: '#072630', star: '#5fb0c0', moon: ['#e6fffa', '#a4dcd4', '#82c0b8'],
            frame: '#d6faff', frameDim: '#357f8c', dim: '#78bcc8', white: '#f0feff', ring: '#2a7482', ring2: '#154753',
            acc: '#ffd23a', accCard: '#2a2210', accDown: '#3a2e10', cyan: '#6cf2dc',
            hp: '#3ee07a', hp2: '#1f9e50', hpTop: '#b6ffcf', ghost: '#fff0b8',
            crit: '#ff3a4a', crit2: '#a8162a', critTop: '#ff9aa2', hot: '#ff4a5c', heartHi: '#ffc0c6', redDim: '#461228',
            flash: '#3a8bff', flashTop: '#a8ccff', flash2: '#1f4aa0', flashInk: '#f0feff', cold: '#3a8bff', shade: '#2f7cf0',
            wave: ['#0c3a48', '#14606e', '#6cf2dc'],
            hud: { base: '#d6faff', zones: ['#3ee07a', '#ffd23a', '#ff3a4a'], flash: '#3a8bff', dim: '#0e2a30', redDim: '#3a0f18', tick: '#78bcc8', tickRed: '#ff3a4a', gear: '#ffd23a', gear2: '#a8162a', pre: '#6cf2dc', pre2: '#1f4aa0' } } },
        // an old green-screen handheld: every colour a shade of LCD green, except red past the shift point / too hot;
        // SHIFT! flashes pale (white-hot) with dark text over it
        { id: 'handheld', name: 'Handheld', swatch: '#9bbc0f', c: {
            sky: ['#081208', '#0a170a', '#0d1c0c', '#10220e', '#142810', '#182e12'],
            box: '#0e1e0c', panelBottom: '#0a170a', track: '#1e3618', tick: '#4a7428', barOff: '#162c12', floor: '#10220e',
            far: '#28481c', near: '#112410', star: '#6a8c34', moon: ['#e8f8b0', '#b4d060', '#94b040'],
            frame: '#cde88a', frameDim: '#4e7a2c', dim: '#86a648', white: '#eefad0', ring: '#4a7428', ring2: '#2a4a1c',
            acc: '#e2f25a', accCard: '#222c0c', accDown: '#303c10', cyan: '#b8e04a',
            hp: '#7ccf3a', hp2: '#579128', hpTop: '#d4f5b0', ghost: '#f2fac8',
            crit: '#ff3a4a', crit2: '#a8162a', critTop: '#ff9aa2', hot: '#ff4a5c', heartHi: '#ffc0c6', redDim: '#461228',
            flash: '#eaf8c8', flashTop: '#ffffff', flash2: '#9ab86a', flashInk: '#0e1e0c', cold: '#5aa8b4', shade: '#4e8a2a',
            wave: ['#1e3a16', '#3a6424', '#b8e04a'],
            hud: { base: '#cde88a', zones: ['#7ccf3a', '#e2f25a', '#ff3a4a'], flash: '#eaf8c8', dim: '#142410', redDim: '#3a0f18', tick: '#86a648', tickRed: '#ff3a4a', gear: '#e2f25a', gear2: '#306230', pre: '#b8e04a', pre2: '#306230' } } },
    ],
};
const KEY = 'tints';
const has = (look) => Object.prototype.hasOwnProperty.call(VARIANTS, look);
function parse(s) { const o = {}; String(s || '').split(',').forEach((p) => { const kv = p.split(':'); if (kv.length === 2 && kv[0] && kv[1]) o[kv[0]] = kv[1]; }); return o; }
function serialize(o) { return Object.keys(o).filter((k) => o[k]).map((k) => k + ':' + o[k]).join(','); }
/** The variant chosen for a look (its default if none or unknown); null for a look without variants. */
function of(look, s) {
    if (!has(look)) return null;
    const id = parse(s)[look], list = VARIANTS[look];
    return list.filter((v) => v.id === id)[0] || list[0];
}
function set(s, look, id) { const o = parse(s); if (!has(look)) return s; if (id === VARIANTS[look][0].id) delete o[look]; else o[look] = id; return serialize(o); }
/**
 * The saved value as this version reads it: unknown looks / variants and defaults dropped, sorted by look
 * (a value saved by a later or earlier version, or edited, never picks a variant that isn't there).
 * No value (every user before 0.14.0): '' - every look on its default (Digital '84 Green).
 */
function clean(s) {
    const o = parse(s), out = {};
    Object.keys(o).sort().forEach((look) => {
        if (!has(look)) return;
        const v = VARIANTS[look].filter((x) => x.id === o[look])[0];
        if (v && v !== VARIANTS[look][0]) out[look] = v.id;
    });
    return serialize(out);
}
/** the key the cluster skin / HUD use: the look, or look-tint for a non-default variant */
function key(look, s) { const v = of(look, s); return v && v !== VARIANTS[look][0] ? look + '-' + v.id : look; }
module.exports = { VARIANTS, KEY, has, parse, serialize, of, set, key, clean };
