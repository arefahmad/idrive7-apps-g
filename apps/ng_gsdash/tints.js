'use strict';
/*
 * tints.js - (0.14.0) colour variants inside a look, shared by every look. A look lists its variants
 * (VARIANTS[lookId]: the first is its default); the choice is one setting, 'tints', kept per look as
 * "digital:purple,vector:amber" (a look absent: its default), so switching looks keeps each look's colour.
 * Every consumer asks for the variant id and builds its colours from it:
 *   the page        look_<id>.js apply(colours) recolours the look's module colours and palette in place
 *   the HUD         hud_core.js LOOKS[look + '-' + tint] (shader constants only, the gear atlas is a mask)
 *   the cluster     skin id look + '-' + tint -> skin_<look>-<tint>.png (baked per variant, only the
 *                   active one decoded and uploaded); the logo's shader constants (no picture)
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
