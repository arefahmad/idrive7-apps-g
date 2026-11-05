'use strict';
/**
 * cluster_source.js - the Cluster source picker's shared state (G's Dash 0.8.3, G's Music 0.6.1, G's TV 0.4.4).
 * G's Dash owns it; G's Music and G's TV get this file through app.json "share" (one copy in git).
 *
 * The pick: what the instrument cluster's centre map area shows, chosen on G's Dash's Cluster & HUD page.
 * G's Dash 0.17.0: a pick other than Auto always shows what it says; only Auto decides by itself.
 *   auto   smart: route guidance shows the directions (our layers hide), G's TV's picture while its own
 *          Cluster button is on (parked only), G's Music while a track plays (its own Cluster setting
 *          deciding, Off respected), else G's Dash's logo while G's Dash is open ("Logo in cluster")
 *   logo   G's Dash's logo, always: also in the background and during route guidance; it covers the whole
 *          map area (exclusive), so Waze's map does not show around it; G's Music and G's TV stay out
 *   music  G's Music's lyrics / visualizer, always (also during route guidance; its own Cluster setting Off
 *          reads as Lyrics + visualizer), else the logo while nothing plays; G's TV stays out
 *   map    Waze's map from CarPlay: none of our apps' layers, Waze on cluster's map switched on
 *   stock  the car's own: none of our apps' layers, Waze on cluster's map switched off while picked
 * G's Dash switches Waze on cluster's map (waze_ctl.js, its control socket, nothing saved by the tool) and
 * puts back what Waze had when the pick no longer needs it.
 *
 * The cluster dials and the HUD (0.17.0, G's Dash's "displays", in the same file): they share one scene, so
 * one owner at a time, the pick naming it - never decided by who asked first:
 *   skin   G's Dash's cluster dials        hud    G's Dash's HUD
 *   music  G's Music's lyrics on the HUD   none   the car's own (G's TV's HUD button may use the HUD)
 * Any of the first three switches Waze on cluster's HUD map off while picked (it shares the scene too).
 *
 * The file: SOURCE_DIR/source.json (tmpfs, as the apps' other /dev/shm files), written only by G's Dash:
 *   { "v": 1, "source": "logo", "displays": "skin", "rev": 3, "at": <ms>, "by": "ng_gsdash" }
 * "displays" absent (a G's Dash before 0.17.0): null for the readers, who then go by their own settings.
 * The directory is made 0755 and the file written whole (a temp file 0644, then rename), so a reader never
 * sees half a file. A reader takes it only when the directory and the file are not symlinks, neither is
 * writable by group or others, the file is a regular file owned by the directory's owner, small, parses,
 * v is 1, by is "ng_gsdash" and source is one of SOURCES. Anything else: the reader's last good value,
 * kept in its own settings.json (CACHE_KEY), else "auto". The file is gone after a head-unit restart until
 * G's Dash runs again; the cache keeps the pick meanwhile.
 *
 * G's Music also writes its own Cluster and HUD settings to MUSIC_DIR/state.json the same way (its own
 * directory: only one app writes in each), for G's Dash's page and its one-time move of G's Music's HUD
 * lyrics into the dials & HUD pick (main.js).
 *
 * Also the route guidance check G's TV uses (Guidance: the same signals and debounce as the logo's).
 *
 * Never throws. Node 8: no optional chaining, no ?? and no object spread.
 */
const fs = require('fs');
const path = require('path');

const SOURCES = ['auto', 'logo', 'music', 'map', 'stock'];
const NAMES = { auto: 'Auto', logo: 'Logo', music: 'Music', map: 'Waze', stock: 'Stock' };
// 0.17.0: the cluster dials & HUD's owner (G's Dash's "displays")
const DISPLAYS = ['skin', 'hud', 'music', 'none'];
const DISPLAY_NAMES = { skin: "G's Dash dials", hud: "G's Dash HUD", music: "G's Music lyrics", none: "Car's own" };
const DISPLAYS_CACHE_KEY = '_clusterDisplaysSeen';
const SOURCE_DIR = process.env.NG_CS_DIR || '/dev/shm/ng-cluster';
const MUSIC_DIR = process.env.NG_CS_MUSIC_DIR || '/dev/shm/ng-cluster-music';
const FILE = 'source.json', MUSIC_FILE = 'state.json';
const WRITER = 'ng_gsdash', MUSIC_WRITER = 'ng_spotify';
const CACHE_KEY = '_clusterSourceSeen';
const MAX_BYTES = 1024;
const DEFAULT = 'auto';

const valid = (s) => SOURCES.indexOf(s) >= 0;
const validDisplays = (d) => DISPLAYS.indexOf(d) >= 0;
const myUid = () => (typeof process.getuid === 'function' ? process.getuid() : -1);

/**
 * The directory made (0755) or checked: ours (when we can tell), a real directory, not group / world
 * writable. { ok } or { error, text }.
 */
function ownDir(dir) {
    try { fs.mkdirSync(dir, 0o755); } catch (e) { if (e.code !== 'EEXIST') return { error: 'mkdir', text: 'Cannot make ' + dir + ' (' + e.code + ')' }; }
    let st;
    try { st = fs.lstatSync(dir); } catch (e) { return { error: 'mkdir', text: 'Cannot read ' + dir }; }
    if (!st.isDirectory() || st.isSymbolicLink()) return { error: 'taken', text: dir + ' is not a directory' };
    const uid = myUid();
    if (uid >= 0 && st.uid !== uid) return { error: 'taken', text: dir + ' belongs to another app' };
    if ((st.mode & 0o777) !== 0o755) { try { fs.chmodSync(dir, 0o755); } catch (e) { return { error: 'mode', text: 'Cannot set ' + dir + ' to 0755' }; } }
    return { ok: true };
}

/** obj written whole as dir/name (0644: temp file, then rename). { ok } or { error, text }. */
function writeAtomic(dir, name, obj) {
    const d = ownDir(dir);
    if (!d.ok) return d;
    const file = path.join(dir, name), tmp = path.join(dir, '.' + name + '.' + process.pid + '.tmp');
    try {
        try { fs.unlinkSync(tmp); } catch (e) { /* none */ }
        const fd = fs.openSync(tmp, 'wx', 0o644);
        try { fs.writeSync(fd, JSON.stringify(obj) + '\n'); } finally { fs.closeSync(fd); }
        fs.chmodSync(tmp, 0o644);
        fs.renameSync(tmp, file);
        return { ok: true };
    } catch (e) {
        try { fs.unlinkSync(tmp); } catch (e2) { /* gone */ }
        return { error: 'write', text: 'Cannot write ' + file + ' (' + (e.code || e.message) + ')' };
    }
}

/**
 * dir/name read and checked (see the header): { obj, mtime } or { error: 'missing' | 'untrusted' | 'bad', text }.
 * check(obj): true when its values are fine.
 */
function readChecked(dir, name, writer, check) {
    const file = path.join(dir, name);
    let ds, fsx;
    try { ds = fs.lstatSync(dir); } catch (e) { return { error: 'missing', text: 'No shared file yet' }; }
    try { fsx = fs.lstatSync(file); } catch (e) { return { error: 'missing', text: 'No shared file yet' }; }
    if (!ds.isDirectory() || ds.isSymbolicLink() || (ds.mode & 0o022)) return { error: 'untrusted', text: 'Shared folder not trusted' };
    if (!fsx.isFile() || fsx.isSymbolicLink() || (fsx.mode & 0o022) || fsx.uid !== ds.uid) return { error: 'untrusted', text: 'Shared file not trusted' };
    if (fsx.size > MAX_BYTES) return { error: 'bad', text: 'Shared file too big' };
    let obj;
    try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { error: 'bad', text: 'Shared file unreadable' }; }
    if (!obj || typeof obj !== 'object' || obj.v !== 1 || obj.by !== writer || !check(obj)) return { error: 'bad', text: 'Shared file not understood' };
    return { obj, mtime: fsx.mtime.getTime(), size: fsx.size };
}

/* ----- the pick (G's Dash writes, everyone reads) ----- */

/**
 * G's Dash: publish the pick. rev: a counter (any number); opts.displays (0.17.0): the dials & HUD's owner.
 * { ok } or { error, text }.
 */
function publish(source, rev, opts) {
    const o = opts || {};
    if (!valid(source)) return { error: 'value', text: 'Unknown source ' + source };
    const obj = { v: 1, source, rev: rev | 0, at: (o.now || Date.now)(), by: WRITER };
    if (validDisplays(o.displays)) obj.displays = o.displays;
    return writeAtomic(o.dir || SOURCE_DIR, FILE, obj);
}
/** The pick as the file says it: { source, displays (null: not in the file), rev, at } or { error, text }. */
function readSource(opts) {
    const o = opts || {};
    const r = readChecked(o.dir || SOURCE_DIR, FILE, WRITER, (x) => valid(x.source));
    if (r.error) return r;
    return { source: r.obj.source, displays: validDisplays(r.obj.displays) ? r.obj.displays : null, rev: r.obj.rev | 0, at: +r.obj.at || 0, mtime: r.mtime };
}

/**
 * A reader (G's Music, G's TV): the pick, re-read only when the file changed, the last good value kept in
 * the app's settings (CACHE_KEY, DISPLAYS_CACHE_KEY), else DEFAULT (displays: null, the app's own settings).
 * opts: settings ({ get, set }), log, dir, now.
 * get() -> { source, displays, from: 'file' | 'cache' | 'default', error, text }.
 */
class SourceReader {
    constructor(opts) {
        const o = opts || {};
        this.o = o;
        this.settings = o.settings || null;
        this.log = o.log || { info() {}, warn() {} };
        this.key = '';            // the file's identity last read (mtime + size), '' none
        this.cur = null;          // the last get()
        this.lastErr = '';
    }
    _cached() { const v = this.settings ? this.settings.get(CACHE_KEY) : null; return valid(v) ? v : ''; }
    _cachedDisplays() { const v = this.settings ? this.settings.get(DISPLAYS_CACHE_KEY) : null; return validDisplays(v) ? v : null; }
    _keep(key, v) {
        if (this.settings && this.settings.get(key) !== v) { try { this.settings.set(key, v); } catch (e) { /* read-only */ } }
    }
    get() {
        const o = this.o, dir = o.dir || SOURCE_DIR;
        let st = null;
        try { st = fs.lstatSync(path.join(dir, FILE)); } catch (e) { st = null; }
        const key = st ? st.mtime.getTime() + ':' + st.size + ':' + st.mode + ':' + st.uid : '';
        if (this.cur && key && key === this.key && this.cur.from === 'file') return this.cur;
        this.key = key;
        const r = readSource({ dir });
        let out;
        if (!r.error) {
            out = { source: r.source, displays: r.displays, from: 'file', error: '', text: '' };
            this._keep(CACHE_KEY, r.source);
            // a G's Dash before 0.17.0 writes no displays: the cache goes too (the app's own settings decide)
            this._keep(DISPLAYS_CACHE_KEY, r.displays || '');
        } else {
            const c = this._cached();
            out = { source: c || DEFAULT, displays: c ? this._cachedDisplays() : null, from: c ? 'cache' : 'default', error: r.error, text: r.text };
        }
        if (out.error !== this.lastErr) {
            this.lastErr = out.error;
            if (out.error === 'untrusted' || out.error === 'bad') this.log.warn('cluster source: ' + out.text + ' - using ' + out.source + ' (' + out.from + ')');
            else if (out.error === 'missing') this.log.info('cluster source: no shared file - using ' + out.source + ' (' + out.from + ')');
        }
        if (!this.cur || this.cur.source !== out.source || this.cur.displays !== out.displays) {
            this.log.info('cluster source: ' + out.source + ', dials & HUD ' + (out.displays || 'not set (own settings)') + ' (' + out.from + ')');
        }
        this.cur = out;
        return out;
    }
}

/* ----- G's Music's own Cluster setting (G's Music writes, G's Dash reads) ----- */

const MUSIC_SETTINGS = ['off', 'lyrics', 'visualizer'];
const MUSIC_HUD = ['off', 'lyrics'];
/** G's Music: its Cluster setting and (0.9.0) opts.hud, its HUD setting. */
function publishMusic(setting, opts) {
    const o = opts || {};
    if (MUSIC_SETTINGS.indexOf(setting) < 0) return { error: 'value', text: 'Unknown setting ' + setting };
    const obj = { v: 1, cluster: setting, at: (o.now || Date.now)(), by: MUSIC_WRITER };
    if (MUSIC_HUD.indexOf(o.hud) >= 0) obj.hud = o.hud;
    return writeAtomic(o.dir || MUSIC_DIR, MUSIC_FILE, obj);
}
/** { cluster: 'off' | 'lyrics' | 'visualizer', hud: 'off' | 'lyrics' | null (an older G's Music), at } or { error, text }. */
function readMusic(opts) {
    const o = opts || {};
    const r = readChecked(o.dir || MUSIC_DIR, MUSIC_FILE, MUSIC_WRITER, (x) => MUSIC_SETTINGS.indexOf(x.cluster) >= 0);
    if (r.error) return r;
    return { cluster: r.obj.cluster, hud: MUSIC_HUD.indexOf(r.obj.hud) >= 0 ? r.obj.hud : null, at: +r.obj.at || 0 };
}

/* ----- route guidance, debounced (G's TV 0.4.4; the same signals and timing as the logo's and G's Music's) ----- */

/** The watches: [interface, instance, member, src]. */
const GUIDE_SIGNALS = [
    ['de.bmw.infotainment.navigation.navigationstatus.NavigationStatus', '1', 'guidingState', 'nav'],
    ['de.bmw.infotainment.a4a.carplay.CarPlayManager', 'CarPlayManagerInst1', 'projectedGuidanceActive', 'carplay'],
    ['de.bmw.infotainment.sdi.aap.androidautoprojectedmanager.AndroidAutoProjectedManager', 'AndroidAutoProjectedManagerInst1', 'projectedGuidanceActive', 'aa'],
];
const GUIDE_ON_MS = 1000, GUIDE_OFF_MS = 3000;
/** A raw signal value as true (guiding) / false / null (not understood): nav guidingState ACTIVE (2), else a boolean. */
function guideValue(src, v) {
    if (v && typeof v === 'object') {
        const k = Object.keys(v).find((x) => typeof v[x] === 'number' || typeof v[x] === 'boolean' || typeof v[x] === 'string');
        return k === undefined ? null : guideValue(src, v[k]);
    }
    if (src === 'nav') {
        if (typeof v === 'number') return v === 2;
        if (typeof v === 'string') return /^(\d+|[A-Z_]+)$/i.test(v) ? (v === '2' || /^active$/i.test(v)) : null;
        return null;
    }
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return /^(true|1)$/i.test(v) ? true : /^(false|0)$/i.test(v) ? false : null;
    return null;
}
/**
 * Route guidance from any of the signals, debounced: on for GUIDE_ON_MS -> guiding, off for GUIDE_OFF_MS -> not.
 * set(src, raw) from the watches, tick() -> guiding (call it often: every 250 ms). opts: now, log, tag.
 */
class Guidance {
    constructor(opts) {
        const o = opts || {};
        this.now = o.now || Date.now;
        this.log = o.log || { info() {}, warn() {} };
        this.tag = o.tag || 'route guidance';
        this.guide = { nav: null, carplay: null, aa: null };
        this.raw = false; this.since = this.now(); this.guiding = false;
    }
    set(src, v) {
        if (!Object.prototype.hasOwnProperty.call(this.guide, src)) return;
        const g = guideValue(src, v);
        if (g === null) { this.log.info(this.tag + ': ' + src + ' value not understood: ' + JSON.stringify(v)); return; }
        if (this.guide[src] !== g) this.log.info(this.tag + ': ' + src + ' ' + (g ? 'active' : 'off'));
        this.guide[src] = g;
    }
    tick() {
        const now = this.now(), raw = this.guide.nav === true || this.guide.carplay === true || this.guide.aa === true;
        if (raw !== this.raw) { this.raw = raw; this.since = now; }
        if (raw && !this.guiding && now - this.since >= GUIDE_ON_MS) this.guiding = true;
        if (!raw && this.guiding && now - this.since >= GUIDE_OFF_MS) this.guiding = false;
        return this.guiding;
    }
}

/* ----- the rules, in one place (the apps and the tests use these) ----- */

/** Whether G's Dash's logo layer is wanted: pick, open (its screen up), logoSetting ('on' | 'off', Auto only). */
function logoWanted(source, open, logoSetting) {
    if (source === 'logo' || source === 'music') return true;       // also in the background
    if (source === 'auto') return !!open && logoSetting !== 'off';  // as before 0.8.3
    return false;                                                   // map, stock
}
/** Whether G's Music may draw in the map area (Auto: its own setting decides, Off respected). */
function musicAllowed(source) { return source === 'auto' || source === 'music'; }
/** 0.17.0: Music picked: G's Music draws whatever its own setting says (Off reads as Lyrics + visualizer). */
function musicForced(source) { return source === 'music'; }
/** 0.17.0: G's Music's map-area setting as drawn: setting ('off' | 'lyrics' | 'visualizer') under the pick. */
function musicSetting(source, setting) {
    const on = setting === 'lyrics' || setting === 'visualizer';
    if (musicForced(source)) return on ? setting : 'lyrics';
    return on && musicAllowed(source) ? setting : 'off';
}
/** 0.17.0: route guidance hides our layers only in Auto; any other pick stays on screen. */
function guideHides(source) { return source === 'auto'; }
/** 0.17.0: G's TV plays in the map area only in Auto. */
function tvAllowed(source) { return source === 'auto'; }
/** 0.17.0: the logo covers the whole map area (Waze's map below it suspended) when the pick names it. */
function logoExclusive(source) { return source === 'logo' || source === 'music'; }
/** 0.17.0: Waze on cluster's map on the cluster as the pick wants it: 1, 0 or null (Waze's own choice). */
function wazeCluster(source) { return source === 'map' ? 1 : source === 'stock' ? 0 : null; }

/**
 * 0.17.0, the dials & HUD (displays: the pick, null when G's Dash has not said: the app's own setting).
 * G's Music's HUD lyrics: true, false, or null (its own HUD setting decides).
 */
function musicHud(displays) { return displays === null || displays === undefined ? null : displays === 'music'; }
/** G's TV's HUD picture: only while nothing of G's Dash's or G's Music's owns the HUD. */
function tvHudAllowed(displays) { return displays === null || displays === undefined || displays === 'none'; }
/** Waze on cluster's HUD map: 0 while one of ours owns the dials & HUD (they share its scene), else null. */
function wazeHud(displays) { return displays === 'skin' || displays === 'hud' || displays === 'music' ? 0 : null; }

module.exports = { SOURCES, NAMES, SOURCE_DIR, MUSIC_DIR, FILE, MUSIC_FILE, WRITER, MUSIC_WRITER, CACHE_KEY, DEFAULT, MAX_BYTES,
    DISPLAYS, DISPLAY_NAMES, DISPLAYS_CACHE_KEY, validDisplays, MUSIC_SETTINGS, MUSIC_HUD,
    valid, publish, readSource, SourceReader, publishMusic, readMusic, writeAtomic, readChecked,
    logoWanted, musicAllowed, musicForced, musicSetting, guideHides, tvAllowed, logoExclusive, wazeCluster, musicHud, tvHudAllowed, wazeHud,
    GUIDE_SIGNALS, GUIDE_ON_MS, GUIDE_OFF_MS, guideValue, Guidance };
