'use strict';
/**
 * prefs.js - G's Dash 0.10.0's choices that are plain logic (no drawing), tested on their own:
 *
 *   - your look on the car's displays (setting "displays"): the cluster dials (the cluster skins), the
 *     HUD, or neither. One at a time: the skins and the HUD share one display layer. 0.9.0 had two
 *     settings for it (clusterSkin on by default, hudShift off by default; one on turned the other off):
 *     a value saved by 0.9.0 is moved over once (migrateDisplays).
 *   - favourite looks (saved as "favLooks", a comma list outside the settings list): starred on Theme, a
 *     tap on the gear (0.11.0: not the speed) on Drive switches to the next one. Looks that went drop out.
 *   - the guards for that tap: a still tap only (never a swipe), and never while the shift lights build
 *     or flash.
 *
 * Node 8: no ?., no ??, no object spread.
 */

/* ---------- your look on the car's displays ---------- */
// 0.17.0: who owns the dials & HUD (they share one scene: one at a time), shared with G's Music and G's TV
// (cluster_source.js): G's Music's lyrics on the HUD are one of the picks, no longer a race between the apps
const DISPLAYS = [
    ['skin', 'Cluster dials', 'Your look on the cluster dials'],
    ['hud', "G's Dash HUD", 'Experimental: big gear, tach and shift lights'],
    ['music', "G's Music lyrics", 'Lyrics on the HUD while a track plays'],
    ['none', "Car's own", "The car's own dials and HUD (G's TV may use the HUD)"],
];
const DISPLAY_IDS = DISPLAYS.map((d) => d[0]);
// 0.13.3: a fresh install starts with Neither (the car's own dials and HUD); a saved pick is kept
const DEFAULT_DISPLAY = 'none';
const OLD_KEYS = ['clusterSkin', 'hudShift'];
const validDisplay = (v) => DISPLAY_IDS.indexOf(v) >= 0;
const displayName = (v) => { const d = DISPLAYS.find((x) => x[0] === v); return d ? d[1] : DISPLAYS[0][1]; };

/** 0.9.0's two settings as one: the HUD when it was on (it won over the skins), else the skins unless off. */
function displayFrom(clusterSkin, hudShift) {
    if (hudShift === 'on') return 'hud';
    if (clusterSkin === 'off') return 'none';
    return 'skin';
}
/**
 * values: the saved settings (Settings.values). { value, migrated }: migrated when 0.9.0's keys were there
 * (the caller deletes them, OLD_KEYS, and saves value). Only 0.9.0 writes those keys, so they always hold
 * the newest choice when present.
 */
function migrateDisplays(values) {
    const v = values || {};
    const has = OLD_KEYS.some((k) => Object.prototype.hasOwnProperty.call(v, k));
    // (old keys only come from 0.9.0's file: "displays" there is the schema's default, not a pick)
    if (has) return { value: displayFrom(v.clusterSkin, v.hudShift), migrated: true };
    return { value: validDisplay(v.displays) ? v.displays : DEFAULT_DISPLAY, migrated: false };
}

/* ---------- favourite looks ---------- */
const FAV_KEY = 'favLooks';
const FAV_MIN = 2;
const TOAST_MS = 2000;
const HINT = ['Star 2 looks in Theme', 'to switch looks here'];
/** The saved list (a comma string, or an array) as look ids: known looks only, once each, in the looks' order. */
function parseFavs(saved, ids) {
    const raw = Array.isArray(saved) ? saved : String(saved === undefined || saved === null ? '' : saved).split(',');
    const want = raw.map((s) => String(s).trim()).filter(Boolean);
    return ids.filter((id) => want.indexOf(id) >= 0);
}
const serializeFavs = (list) => list.join(',');
/** The list with id starred or unstarred (the looks' order kept). */
function toggleFav(list, id, ids) {
    const on = list.indexOf(id) >= 0;
    return ids.filter((x) => (x === id ? !on : list.indexOf(x) >= 0));
}
/**
 * The next favourite after cur: { id, i (1-based place), n }, or null with fewer than FAV_MIN. A current
 * look that is not a favourite goes to the first one.
 */
function nextFav(list, cur) {
    const n = list.length;
    if (n < FAV_MIN) return null;
    const k = list.indexOf(cur), i = k < 0 ? 0 : (k + 1) % n;
    return { id: list[i], i: i + 1, n };
}
/** The toast after a switch: ['Look: Pixel', '2 of 2 favourites']. */
const favToast = (name, i, n) => ['Look: ' + name, i + ' of ' + n + ' favourites'];

/* ---------- the tap's guards ---------- */
const TAP_SLOP = 24;          // px the finger may move and still be a tap (the swipe starts at 40)
/** A gesture ({ moved: max px from the start, swiped }) that was a still tap. */
const stillTap = (g) => !!g && !g.swiped && g.moved < TAP_SLOP;
/** The shift lights are building (rpm in the last `range` before the shift point) or flashing. */
function nearShift(S) {
    if (!S) return false;
    if (S.strobe) return true;
    return typeof S.rpm === 'number' && isFinite(S.rpm) && S.rpm >= S.shift - S.range;
}
/** Two rects ({ x, y, w, h }) overlap. */
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inRect = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/*
 * Logo (setting "logo"): the G mark, or a GIF sent from the phone. The same choice is the home-screen
 * widget and the cluster graphic. It was "widget" (Home widget shows). A saved "widget" is copied once
 * (migrateLogo); the caller deletes the old key. "widget" is not a retiredSetting: the kit would drop it
 * before this could read it.
 */
const LOGO_KEY = 'logo', LOGO_OLD = 'widget';
/* Drive's right panel (setting "panel"): the g-meter, Spotify, or the Logo. Anything else is the g-meter, the default. */
const PANEL_NAME = { g: 'G-meter', spotify: 'Spotify', logo: 'Logo' };
function panelOf(v) { return v === 'spotify' || v === 'logo' ? v : 'g'; }
const panelName = (v) => PANEL_NAME[panelOf(v)];
function migrateLogo(values) {
    const v = values || {};
    const has = Object.prototype.hasOwnProperty.call(v, LOGO_OLD);
    const old = v[LOGO_OLD];
    const kept = (has && (old === 'gif' || old === 'logo')) ? old : (v[LOGO_KEY] === 'gif' ? 'gif' : 'logo');
    return { value: kept, migrated: has };
}

module.exports = {
    LOGO_KEY, LOGO_OLD, migrateLogo, PANEL_NAME, panelOf, panelName,
    DISPLAYS, DISPLAY_IDS, DEFAULT_DISPLAY, OLD_KEYS, validDisplay, displayName, displayFrom, migrateDisplays,
    FAV_KEY, FAV_MIN, TOAST_MS, HINT, parseFavs, serializeFavs, toggleFav, nextFav, favToast,
    TAP_SLOP, stillTap, nearShift, overlaps, inRect,
};
