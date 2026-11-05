'use strict';
/**
 * music_cluster.js - G's Music in the instrument cluster's centre map area (0.6.0), through the
 * Cluster renderer tool (cluster-render 0.2.2, PROTOCOL.md): while a track plays, its synced lyrics
 * (LRCLIB, lyrics.js: the line playing large, the next one dim) or a visualizer (the head unit's own,
 * viz.js: the same bars, colours and motion; the title and the artist above it) between the dials.
 *
 * Two opaque image layers on the "map" target, class "content", never exclusive, never "alert":
 *   text  z 60  TEXT_W x TEXT_H (half the map's 1088 x 480), drawn over the whole map, bilinear:
 *               the black background, the words, the progress line. Written only when what it shows
 *               changes, and then only the changed bands (dirty rects); fps TEXT_FPS at most (0.8.0:
 *               ANIM_FPS while a lyric line scrolls in, about 4 frames a line; the layer says ANIM_FPS).
 *   bars  z 61  BARS_W x BARS_H shown at BARS_SC x the size's scale (at most SAFE's width), bilinear: the visualizer only,
 *               at BARS_FPS at most, and then only the bars' changed columns (dirty rects); on Pause
 *               the bars settle to rest (as on the screen, ~2 s) and then nothing is sent.
 * 0.7.5: the whole view drawn at SCALE (0.72) about the map's centre, every line inside SAFE (the part of the
 * map area clear of the cluster's dark rounded edge, with a margin): a line too wide shrinks down to its
 * minimum, a lyric line then wraps to two lines, and only then is the last cut with '...' (fitLines()).
 * The same textures (no more renderer memory): the text image's size unchanged, the bars' too, shown smaller.
 * 0.8.0: the size (setting "clusterSize": Small / Medium / Large, SIZES) sets that scale (Medium: 0.7.5's
 * 0.72), and SAFE is narrower (544 px wide, 0.7.5: 624): on the car the very ends of the widest lines were
 * still cut off by the cluster's edge. At every size each line is fitted to SAFE's width (fitLines()), and the
 * bars and the progress line are kept inside it too.
 * 0.8.0, the HUD (setting "hud", opts.target 'hud', its own connection): the synced lyrics alone (the line
 * playing, the next one dim; nothing for an episode or a track without synced lyrics) on the "hud" target
 * (800 x 480), one image layer (HUD_TEXT_W x HUD_TEXT_H shown at 2x), class "content", z Z_HUD (70: under
 * G's Dash's HUD at 80 and G's TV's at 100), contend, never exclusive, never "alert". Light on black: each
 * pixel's brightest channel is its alpha (as G's Dash's HUD: black is see-through), every line inside
 * HUD_SAFE at every size. Hidden while route guidance runs (the car's HUD shows the directions) and while
 * G's TV draws on the HUD; G's Dash's dials and HUD give way to it (they share the HUD's scene). G's Dash's
 * Cluster source pick is about the map area only: the HUD has its own setting.
 * 0.8.0, the lyrics animated as on the screen (main.js drawLyrics): at each new line, over SCROLL_MS (eased), the
 * next line rises into the playing line's place growing and lighting up, the old line rises and fades out, and
 * the new next line fades in below. Only then is the text image redrawn faster (ANIM_FPS, its changed bands
 * only, as always); not while paused, nor while the renderer's upload cap is cut (the line just changes).
 * z 60/61: over Waze's map (z 0) and G's Dash's logo (z 50), under G's TV (z 100). Like the logo,
 * the layers hide while G's TV draws on the map and while route guidance runs (debounced
 * GUIDE_ON_MS / GUIDE_OFF_MS), and come back HOLD_MS after G's TV stops.
 * Both go (dropped, the connection closed) when: the setting is Off, G's Dash's Cluster source pick is
 * not Auto or Music (0.6.1, s.source), no track, paused for more than
 * PAUSE_DROP_MS, the app closes, or the renderer keeps failing them (ERR_RETRIES).
 *
 * The client is the tool's own, loaded at run time from /var/opt/cluster-render/current (root-owned
 * only); NG_CR_CLIENT / NG_CR_SOCK point the tests at a stand-in.
 *
 * Node 8: no optional chaining, no ??, no object spread.
 */
const fs = require('fs');
const path = require('path');
const VIZ = require('./viz');

const CLIENT = process.env.NG_CR_CLIENT || '/var/opt/cluster-render/current/cluster_render_client.js';
const SOCK = process.env.NG_CR_SOCK || '/dev/shm/cluster-render/render.sock';
const TESTING = !!(process.env.NG_CR_CLIENT || process.env.NG_CR_SOCK);

const TARGET = 'map', MAP_W = 1088, MAP_H = 480;
const KLASS = 'content', Z_TEXT = 60, Z_BARS = 61;
const TEXT_W = 544, TEXT_H = 240, TEXT_FPS = 4;
// 0.8.0: the lyrics' scroll to the next line (main.js's SCROLL_MS, eased as there), drawn at ANIM_FPS in ANIM_STEPS steps at most
const SCROLL_MS = 380, ANIM_FPS = 10, ANIM_STEPS = 12;
const easeOut = (e) => 1 - Math.pow(1 - e, 3);
// 0.7.5: the whole view at a scale about the map's centre (0.7.4 and before: 1, and cut off by the cluster's edge);
// 0.8.0: the scale is the size setting's (clusterSize), Medium 0.7.5's 0.72
const SIZES = ['small', 'medium', 'large'], DEFAULT_SIZE = 'medium';
const SIZE_SCALE = { small: 0.6, medium: 0.72, large: 0.86 };
const SCALE = SIZE_SCALE[DEFAULT_SIZE];
const sizeOf = (v) => (SIZES.indexOf(v) >= 0 ? v : DEFAULT_SIZE);
// where anything may be drawn, map px: the map area less the cluster's dark rounded edge (its clear part ends
// about 128 px in from the sides, 40 from the top and bottom: tools/gsmusic_cluster_emu.js), clear of the speed
// and gear readouts the cluster draws at the sides of the map area; 0.8.0: 40 px more off each side than 0.7.5's
// (x 232, w 624), whose widest lines lost their ends on the car
const SAFE = { x: 272, y: 72, w: 544, h: 336 };
const SAFE_TW = SAFE.w / 2;                          // the widest line in the text image (half the map's scale): 272
// the bars: drawn at a third of 0.7.4's shown size (bilinear smooths them up), the head unit's stage shape; shown at
// the size's scale, at most SAFE's width (layoutFor())
const BARS_SC = 3, BARS_W = 288, BARS_H = 54, BARS_FPS = 12;
// the HUD (0.8.0): its target 800 x 480, the text image at half that, every line inside HUD_SAFE (HUD px)
const HUD_W = 800, HUD_H = 480, HUD_TEXT_W = 400, HUD_TEXT_H = 240, Z_HUD = 70;
const HUD_SAFE = { x: 100, y: 60, w: 600, h: 360 };
const HUD_TW = HUD_SAFE.w / 2;                       // 300
const BARS_COLS = 13;                                // dirty-rect column groups (3 bars each; the client merges at 16)
const BAND = 16;                                     // rows per dirty-rect band of the text image
const POLL_MS = 1000, HOLD_MS = 3000, FRESH_MS = 2000, LOAD_RETRY_MS = 30000, RECONNECT_MS = 8000;
const GUIDE_ON_MS = 1000, GUIDE_OFF_MS = 3000;
const ERR_RETRY_MS = 5000, ERR_RETRIES = 3;
const FREE_MS = 150;                                 // 0.7.1: a layer remade no sooner after its drop (the renderer lets go at its next draw)
const PAUSE_DROP_MS = 30000;
const PROGRESS_MS = 3000;                            // the progress line is redrawn no more often
const LEAD_MS = 250;                                 // a lyric line a moment early, as on the screen

/* ----- the client (as G's Dash's cluster_logo.js) ----- */

function trusted(file) {
    try {
        const real = fs.realpathSync(file);
        const st = fs.statSync(real), dir = fs.statSync(path.dirname(real));
        return st.isFile() && st.uid === 0 && !(st.mode & 0o022) && dir.uid === 0 && !(dir.mode & 0o022);
    } catch (e) { return false; }
}
const exists = (p) => { try { fs.statSync(p); return true; } catch (e) { return false; } };

function loadClient(opts) {
    const o = opts || {};
    const file = o.client || CLIENT, sock = o.sock || SOCK, testing = o.testing !== undefined ? o.testing : TESTING;
    if (!exists(file)) {
        return exists(sock) ? { error: 'noclient', text: 'Cluster renderer client missing - update the tool' }
            : { error: 'missing', text: 'Cluster renderer not installed (Store)' };
    }
    if (!testing && !trusted(file)) return { error: 'untrusted', text: 'Cluster renderer client not trusted' };
    try {
        const m = require(file);
        if (!m || typeof m.ClusterRender !== 'function') return { error: 'load', text: 'Cluster renderer client not recognised' };
        return { ClusterRender: m.ClusterRender, sock: o.sock || process.env.NG_CR_SOCK || m.DEFAULT_PATH || SOCK };
    } catch (e) {
        return { error: 'load', text: 'Cluster renderer client failed to load', detail: e.message };
    }
}

/* ----- the map's other layers, from the status text ----- */

/** Other apps' layers on the map (or target): [{ id, kind, app, klass, z, state, frames }]. */
function mapLayers(text, ownApp, target) {
    const tg = target || TARGET;
    const out = [];
    let last = null;
    String(text || '').split('\n').forEach((line) => {
        if (last && /^\s/.test(line)) {
            const f = /^\s+(\d+) (sent|writes)\b/.exec(line);
            if (f) last.frames = +f[1];
            return;
        }
        last = null;
        const m = /^layer (\d+) (\w+) of (\S+) on (\w+), (\w+) z (-?\d+): (\w+)/.exec(line);
        if (!m || m[4] !== tg || m[3] === ownApp) return;
        last = { id: +m[1], kind: m[2], app: m[3], klass: m[5], z: +m[6], state: m[7], frames: -1 };
        out.push(last);
    });
    return out;
}
/** Our own layers on the map (or target) in the status text: [{ id, state }]. */
function ownLayers(text, ownApp, target) {
    const out = [], tg = target || TARGET;
    String(text || '').split('\n').forEach((line) => {
        const m = /^layer (\d+) \w+ of (\S+) on (\w+), \w+ z -?\d+: (\w+)/.exec(line);
        if (m && m[3] === tg && m[2] === ownApp) out.push({ id: +m[1], state: m[4] });
    });
    return out;
}
/** Whether a listed layer is really drawing (shown, or waiting with frames still moving). */
function drawing(l, seen, now) {
    const key = l.app + '#' + l.id, was = seen[key];
    let at = was ? was.at : -1e15;
    if (l.frames > 0 && (!was || l.frames !== was.frames)) at = now;
    seen[key] = { frames: l.frames, at };
    if (l.state === 'shown') return !(l.kind === 'video' && l.frames === 0);
    if (l.state === 'waiting' || l.state === 'suspended') return now - at < FRESH_MS;
    return false;
}
/** A guidance signal's value: true (guiding), false, null (not understood). nav: guidingState 2 / ACTIVE. */
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

/* ----- colours ----- */

function rgb(c) {
    if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
    const s = String(c || '#ffffff').replace('#', '');
    return [parseInt(s.slice(0, 2), 16) || 0, parseInt(s.slice(2, 4), 16) || 0, parseInt(s.slice(4, 6), 16) || 0];
}
const hexOf = (v) => '#' + v.map((x) => ('0' + Math.max(0, Math.min(255, Math.round(x))).toString(16)).slice(-2)).join('');
/** A colour made bright enough to read on the cluster's black: lightness lifted to at least min. */
function lift(c, min) {
    const v = rgb(c), mx = Math.max(v[0], v[1], v[2]), lo = min || 150;
    if (mx >= lo) return hexOf(v);
    if (mx < 8) return hexOf([lo, lo, lo]);
    const k = lo / mx;
    return hexOf(v.map((x) => x * k));
}
const mixc = (a, b, f) => { const x = rgb(a), y = rgb(b); return hexOf(x.map((v, i) => v + (y[i] - v) * f)); };
const DEFAULT_PAL = ['#3ad0ff', '#7a6cff', '#ff4fa3'];
/** Three colours from the artwork's palette (lifted for the black), else G's Music's own: the text's accent. */
function barColours(pal) {
    const p = (pal || []).filter(Boolean);
    if (p.length < 2) return DEFAULT_PAL.slice();
    return [lift(p[0], 170), lift(p[1], 170), lift(p[2] || mixc(p[0], '#ffffff', 0.5), 190)];
}

/* ----- the visualizer: viz.js, as on the head unit's screen ----- */

/** The bars' colours: the screen's own (main.js's stage colours), else from the artwork's palette. */
function vizColours(s) {
    const v = (s && s.vizPalette || []).filter(Boolean);
    return v.length >= 3 ? v.slice(0, 3) : barColours(s && s.palette);
}
/** The bars' image (BARS_W x BARS_H RGBA, opaque on black) at viz clock c ({ t, e }). Canvas: kit/canvas's. */
function barsImage(Canvas, c, pal) {
    const cv = new Canvas(BARS_W, BARS_H);
    cv.clear('#000000');
    VIZ.draw(cv, { x: 0, y: 0, w: BARS_W, h: BARS_H }, c, pal);
    const d = Buffer.from(cv.d.buffer, cv.d.byteOffset, cv.d.length);
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    return { w: BARS_W, h: BARS_H, d: Buffer.from(d) };
}
/**
 * The bars' changed parts of b against a (w x h): per group of columns (cols groups), the changed
 * rows' span, as dirty() does: { rects, px } or null.
 */
function colDirty(a, b, w, h, cols) {
    const rects = [];
    for (let g = 0; g < cols; g++) {
        const x0 = Math.round(g * w / cols), x1 = Math.round((g + 1) * w / cols);
        let y0 = h, y1 = -1;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            for (let x = x0; x < x1; x++) {
                const o = row + x * 4;
                if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2]) { if (y < y0) y0 = y; y1 = y; break; }
            }
        }
        if (y1 >= 0) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 + 1 });
    }
    if (!rects.length) return null;
    const parts = rects.map((r) => {
        const out = Buffer.alloc(r.w * r.h * 4);
        for (let y = 0; y < r.h; y++) b.copy(out, y * r.w * 4, ((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4);
        return out;
    });
    return { rects, px: Buffer.concat(parts) };
}

/* ----- the text image ----- */

/**
 * The lyric line playing at pos and the next one: { i, cur, next, prev, e } (cur '' = an instrumental gap);
 * 0.8.0: prev the line before (null: none), e 0..1 how far the scroll to line i has gone (1: done; not eased).
 */
function lyricAt(lines, pos) {
    const p = pos + LEAD_MS;
    let lo = 0, hi = lines.length - 1, i = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= p) { i = mid; lo = mid + 1; } else hi = mid - 1; }
    let n = i + 1;
    while (n < lines.length && !lines[n].text) n++;                 // the next line with words
    const e = i >= 0 ? Math.max(0, Math.min(1, (p - lines[i].t) / SCROLL_MS)) : 1;
    return { i, cur: i >= 0 ? lines[i].text : '', next: n < lines.length ? lines[n].text : '', prev: i > 0 ? lines[i - 1].text : null, e };
}
/** s cut (by characters, so also a long word or CJK) to width w with '...', or s when it fits. */
function fitText(cv, s, size, w, opts) {
    s = String(s || '');
    if (cv.textWidth(s, size, opts) <= w) return s;
    const ch = Array.from(s);
    while (ch.length > 1 && cv.textWidth(ch.join('') + '...', size, opts) > w) ch.pop();
    const out = ch.join('').replace(/\s+$/, '') + '...';
    return cv.textWidth(out, size, opts) <= w ? out : '...';
}
/**
 * The pieces a line may break into: words (a space before each but the first), a word wider than w split
 * by characters, and CJK one character a piece (no spaces between its words).
 */
function pieces(cv, s, size, w, opts) {
    const out = [];
    String(s || '').split(/\s+/).filter(Boolean).forEach((word, k) => {
        let parts = /[\u3000-\u9fff\uff00-\uffef\uac00-\ud7af]/.test(word) ? word.match(/[\u3000-\u9fff\uff00-\uffef\uac00-\ud7af]|[^\u3000-\u9fff\uff00-\uffef\uac00-\ud7af]+/g) : [word];
        const split = [];
        parts.forEach((p) => {
            if (cv.textWidth(p, size, opts) <= w) { split.push(p); return; }
            let cur = '';
            Array.from(p).forEach((c) => { if (cur && cv.textWidth(cur + c, size, opts) > w) { split.push(cur); cur = c; } else cur += c; });
            if (cur) split.push(cur);
        });
        split.forEach((p, i) => out.push({ t: p, sp: k > 0 && i === 0 }));
    });
    return out;
}
/** Words wrapped into at most max lines of width w (the last cut with ...); every line at most w wide. */
function wrapText(cv, s, size, w, max, opts) {
    const ps = pieces(cv, s, size, w, opts), out = [];
    let line = '';
    for (let k = 0; k < ps.length; k++) {
        const t = line ? line + (ps[k].sp ? ' ' : '') + ps[k].t : ps[k].t;
        if (cv.textWidth(t, size, opts) <= w || !line) { line = t; continue; }
        out.push(line); line = ps[k].t;
        if (out.length === max - 1) { line = ps.slice(k).map((p, i) => (i && p.sp ? ' ' : '') + p.t).join(''); break; }
    }
    if (line) out.push(line);
    return out.slice(0, max).map((l, k) => k === max - 1 || cv.textWidth(l, size, opts) > w ? fitText(cv, l, size, w, opts) : l);
}
/**
 * 0.7.5: a line fitted to width w: at its size if it fits; else shrunk (down to shrink x size); else, with
 * max 2 or more, wrapped to two lines at the largest size from wrap x size down to min that fits them whole
 * (0.8.0: then three, up to max); else at min, cut with '...'. { size, lines } with every line at most w wide.
 */
function fitLines(cv, s, f, w, opts) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    const one = cv.textWidth(s, f.size, opts);
    if (one <= w) return { size: f.size, lines: [s] };
    const shrunk = Math.floor(f.size * w / one * 4) / 4;        // quarter px steps
    const lo = Math.max(f.min, f.size * (f.shrink || 0.8));
    if (shrunk >= lo && cv.textWidth(s, shrunk, opts) <= w) return { size: shrunk, lines: [s] };
    if ((f.max || 1) > 1) {
        // 0.8.0: two lines at any size down to min first, then three (and so on up to max)
        for (let n = 2; n <= f.max; n++) {
            for (let z = Math.floor(f.size * (f.wrap || 0.9) * 4) / 4; z >= f.min; z -= 0.25) {
                const ls = wrapText(cv, s, z, w, n, opts);
                if (ls.join(' ').replace(/\s+/g, '') === s.replace(/\s+/g, '') && ls.every((l) => cv.textWidth(l, z, opts) <= w)) return { size: z, lines: ls };
            }
        }
        return { size: f.min, lines: wrapText(cv, s, f.min, w, f.max, opts) };
    }
    return { size: f.min, lines: [fitText(cv, s, f.min, w, opts)] };
}
/**
 * What the text image shows, as a key (equal keys: the same picture): v = { mode 'lyrics' | 'viz' | 'blank'
 * (the HUD before a track's lyrics come), title, artist, paused, cur, next, gap, prog (0..1, quantised), accent,
 * lay (the layout's id: the place and the size), anim (0.8.0: the scroll to cur, eased and quantised, 0..1; 1 = still),
 * prev (the line scrolling out; null: none) }.
 */
function textKey(v) {
    const a = v.anim == null ? 1 : v.anim;
    return [v.mode, v.title, v.artist, v.paused ? 1 : 0, v.cur, v.next, v.gap ? 1 : 0, Math.round((v.prog || 0) * 200), v.accent, v.lay || '',
        a, a < 1 ? v.prev : ''].join('\u0001');
}
/**
 * 0.7.5: the text image's layout: 0.7.4's (in its 544 x 240 px), scaled by the size's scale about the centre; each
 * text's size, its least size when fitted (fitLines()), and its baseline. Widths: TW (SAFE_TW) at most. 0.8.0: per
 * place ('map' | 'hud') and size, the least sizes scaled too (Medium: 0.7.5's), the bars and the progress line
 * inside SAFE. The HUD's: the line playing (up to three lines) and the next, about its text image's centre.
 */
const LAYOUTS = {};
function layoutFor(place, size) {
    const P = place === 'hud' ? 'hud' : 'map', Z = sizeOf(size), id = P + '.' + Z;
    if (LAYOUTS[id]) return LAYOUTS[id];
    const S = SIZE_SCALE[Z], hud = P === 'hud', W = hud ? HUD_TEXT_W : TEXT_W, H = hud ? HUD_TEXT_H : TEXT_H, TW = hud ? HUD_TW : SAFE_TW;
    const CY = H / 2, at = (y) => Math.round((CY + (y - CY) * S) * 4) / 4, sc = (v) => Math.round(v * S * 100) / 100;
    let L;
    if (hud) {
        L = {
            cur: { size: sc(34), min: sc(25), shrink: 0.8, wrap: 0.9, max: 3, y: at(128), gap: sc(6) },
            dots: { size: sc(38), y: at(124) },
            next: { size: sc(22), min: sc(17), shrink: 0.8, wrap: 0.95, max: 2, gap: sc(3), y: at(186) },
        };
    } else {
        const bw = Math.min(SAFE.w, Math.round(BARS_W * BARS_SC * S)), bh = Math.round(bw * BARS_H / BARS_W);
        L = {
            head: { size: sc(13), min: sc(12.5), shrink: 0.75, y: at(30) },                // the title and artist over the lyrics
            cur: { size: sc(30), min: sc(22.25), shrink: 0.8, wrap: 0.9, max: 3, y: at(116), gap: sc(6) },   // the line playing (up to 3 lines)
            dots: { size: sc(34), y: at(112) },                                            // an instrumental gap
            next: { size: sc(18), min: sc(15.25), shrink: 0.8, wrap: 0.95, max: 2, gap: sc(3), y: at(176) },   // the next line, dim (0.8.0: up to 2 lines)
            label: { size: sc(11), spacing: sc(2), y: at(28) },                            // NOW PLAYING / PAUSED
            title: { size: sc(22), min: sc(18), shrink: 0.8, y: at(54) },                  // the visualizer's title
            artist: { size: sc(15), min: sc(14), shrink: 0.8, y: at(74) },
            prog: { x: Math.round(Math.max(W / 2 - (W / 2 - 92) * S, (W - TW) / 2)), y: Math.round(at(210)), h: 2 },
            // the bars' layer, map px: at the scale, at most SAFE's width, their top where 0.7.4's (y 185) scales to
            bars: { w: bw, h: bh, x: Math.round((MAP_W - bw) / 2), y: Math.round(MAP_H / 2 + (185 - MAP_H / 2) * S) },
        };
    }
    L.id = id; L.place = P; L.size = Z; L.S = S; L.W = W; L.H = H; L.TW = TW;
    LAYOUTS[id] = L;
    return L;
}
const LAYOUT = layoutFor('map', DEFAULT_SIZE);
const BARS_SHOW_W = LAYOUT.bars.w, BARS_SHOW_H = LAYOUT.bars.h, BARS_X = LAYOUT.bars.x, BARS_Y = LAYOUT.bars.y;   // Medium: 544 x 102 at 272, 200
/**
 * The text image (L.W x L.H) for v (textKey()) in layout L (layoutFor(); the map's Medium when not given).
 * The map's: opaque. The HUD's: light on black, each pixel's brightest channel its alpha (black see-through).
 * Canvas: kit/canvas's.
 */
function textImage(Canvas, v, Lay) {
    const Y = Lay || LAYOUT, W = Y.W, H = Y.H, cv = new Canvas(W, H), hud = Y.place === 'hud';
    cv.clear('#000000');
    const acc = lift(v.accent || '#3ad0ff', 170), dim = '#8a8f99', lit = '#ffffff', L = { literal: true }, B = { font: 'bold', literal: true };
    const cx = W / 2, TW = Y.TW;
    const one = (s, f, c, o) => { const r = fitLines(cv, s, f, TW, o); cv.text(r.lines[0], cx, f.y, r.size, c, Object.assign({ align: 'center' }, o)); };
    const DOTS = '·   ·   ·', BK = '#000000';
    /**
     * Where the playing line's block (txt; '' = the gap's dots) sits when still: { lines, size, lh, y0 (the first
     * baseline) }. 0.8.0: two lines centred where one line's baseline is; a third goes up (the last line never lower
     * than two's).
     */
    const place = (txt) => {
        if (!txt) return { lines: [DOTS], size: Y.dots.size, lh: 0, y0: Y.dots.y };
        const r = fitLines(cv, txt, Y.cur, TW, B), lh = r.size + Y.cur.gap, n = r.lines.length;
        return { lines: r.lines, size: r.size, lh, y0: Y.cur.y + Math.min(n - 1, 1) * lh / 2 - (n - 1) * lh };
    };
    /** A block (place()) drawn in colour c with its first baseline at y, its size and spacing times k (k <= 1: inside TW). */
    const block = (P, c, y, k) => P.lines.forEach((l, j) => cv.text(l, cx, y + j * P.lh * k, P.size * k, c, { font: 'bold', literal: true, align: 'center' }));
    /**
     * The lyrics: the playing line (colour c; the gap's dots in the accent) and the next one (nc). 0.8.0: while the
     * scroll to a new line runs (v.anim < 1), as main.js's drawLyrics: the old line rises by the distance between
     * the two lines and fades out (gone halfway), the new one comes up from the next line's place and size,
     * lighting up, and in the second half the new next line fades in, rising a little.
     */
    const lyrics = (c, nc) => {
        const a = v.anim == null ? 1 : v.anim, cur = v.gap ? '' : v.cur || '', P = place(cur), cc = cur ? c : acc;
        // the next line: wrapped to two lines rather than cut (0.8.0), at its baseline y
        const nextAt = (y, col) => {
            const r = fitLines(cv, v.next, Y.next, TW, L), lh = r.size + Y.next.gap;
            r.lines.forEach((l, j) => cv.text(l, cx, y + j * lh, r.size, col, { literal: true, align: 'center' }));
        };
        if (a >= 1) { block(P, cc, P.y0, 1); if (v.next) nextAt(Y.next.y, nc); return; }
        const D = Y.next.y - Y.cur.y;
        if (v.prev !== null && v.prev !== undefined) {
            const O = place(v.prev);
            block(O, mixc(v.prev ? c : acc, BK, Math.min(1, a * 2)), O.y0 - D * a, 1);   // gone halfway
        }
        const k0 = Math.min(1, Y.next.size / P.size);
        block(P, mixc(nc, cc, a), Y.next.y + (P.y0 - Y.next.y) * a, k0 + (1 - k0) * a);
        // the new next line: in the second half, coming up from below
        if (v.next && a > 0.5) nextAt(Y.next.y + D * 0.2 * (1 - a) * 2, mixc(BK, nc, (a - 0.5) * 2));
    };
    if (hud) {
        // the lyrics alone: the line playing (dimmer while paused), the next one dim
        if (v.mode === 'lyrics') lyrics(v.paused ? '#9aa0aa' : lit, '#7d838d');
    } else {
        if (v.mode === 'lyrics') {
            const head = (v.paused ? 'PAUSED  ·  ' : '') + v.title + (v.artist ? '  ·  ' + v.artist : '');
            lyrics(lit, '#6b7079');
            one(head, Y.head, v.paused ? acc : dim, L);        // after: the line scrolling out passes under it
        } else {
            cv.text(v.paused ? 'PAUSED' : 'NOW PLAYING', cx, Y.label.y, Y.label.size, acc, { font: 'bold', literal: true, align: 'center', spacing: Y.label.spacing });
            one(v.title, Y.title, lit, B);
            if (v.artist) one(v.artist, Y.artist, dim, L);
        }
        // the progress line
        const px = Y.prog.x, pw = W - 2 * px, py = Y.prog.y;
        cv.fillRect(px, py, pw, Y.prog.h, '#26292e');
        cv.fillRect(px, py, Math.max(0, Math.min(1, v.prog || 0)) * pw, Y.prog.h, acc);
    }
    const d = Buffer.from(cv.d.buffer, cv.d.byteOffset, cv.d.length);
    if (hud) {
        for (let i = 0; i < d.length; i += 4) {
            const m = Math.max(d[i], d[i + 1], d[i + 2]);
            if (m) { d[i] = Math.round(d[i] * 255 / m); d[i + 1] = Math.round(d[i + 1] * 255 / m); d[i + 2] = Math.round(d[i + 2] * 255 / m); }
            d[i + 3] = m;
        }
    } else for (let i = 3; i < d.length; i += 4) d[i] = 255;
    return { w: W, h: H, d: Buffer.from(d) };
}
/**
 * The changed parts of b against a (same size, alpha too: the HUD's): per BAND rows, the changed columns' span, as
 * { rects: [{x,y,w,h}], px } (px: the rects' pixels one after another), or null: nothing changed.
 */
function dirty(a, b, w, h) {
    const rects = [];
    for (let y0 = 0; y0 < h; y0 += BAND) {
        const y1 = Math.min(h, y0 + BAND);
        let x0 = w, x1 = -1;
        for (let y = y0; y < y1; y++) {
            const row = y * w * 4;
            for (let x = 0; x < w; x++) {
                const o = row + x * 4;
                if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2] || a[o + 3] !== b[o + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
            }
        }
        if (x1 < 0) continue;
        const last = rects[rects.length - 1];
        if (last && last.y + last.h === y0 && last.x === x0 && last.w === x1 - x0 + 1) last.h += y1 - y0;
        else rects.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 });
    }
    if (!rects.length) return null;
    const parts = rects.map((r) => {
        const out = Buffer.alloc(r.w * r.h * 4);
        for (let y = 0; y < r.h; y++) b.copy(out, y * r.w * 4, ((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4);
        return out;
    });
    return { rects, px: Buffer.concat(parts) };
}

/* ----- the cluster picture ----- */

class MusicCluster {
    /**
     * opts: log, app ('ng_spotify'), Canvas, target ('map', the default; 0.8.0: 'hud', the lyrics alone),
     * client / sock / testing (tests), now(), timers.
     */
    constructor(opts) {
        const o = opts || {};
        this.o = o;
        this.place = o.target === 'hud' ? 'hud' : 'map';
        this.hud = this.place === 'hud';
        this.target = this.hud ? 'hud' : TARGET;
        this.tag = this.hud ? 'music hud' : 'music cluster';
        this.lay = layoutFor(this.place, DEFAULT_SIZE);
        this.log = o.log || { info() {}, warn() {} };
        this.app = o.app || 'ng_spotify';
        this.Canvas = o.Canvas;
        this.now = o.now || Date.now;
        this.T = o.timers || { setInterval, clearInterval };
        this.err = null; this.errAt = -1e15;
        this.guide = { nav: null, carplay: null, aa: null };
        this.rawGuide = false; this.rawSince = this.now(); this.guiding = false;
        this.s = null; this.want = false; this.reason = 'off'; this.source = 'auto';
        this.pausedAt = 0; this.gaveUp = '';
        this.stats = { layers: 0, sends: 0, bytes: 0, textBytes: 0, barsBytes: 0, drops: 0, connects: 0 };
        this.clk = VIZ.clock();                      // the visualizer's clock (viz.js), as main.js's
        this.lyrT = null;                            // 0.8.0: the lyrics' scroll timer (_scroll())
        this._reset();
    }
    _reset() {
        this.cr = null; this.ready = false; this.polled = false;
        this.text = null; this.bars = null;          // { ref, state, img, key, visible, madeAt, errAt }
        this.others = []; this.seen = {}; this.tvAt = -1e15;
        this.poll = null; this.anim = null; this.downAt = this.now();
        this.errRetries = 0; this.textAt = 0; this.progAt = -1e15; this.prog = 0;
        this.visible = null; this.mode = '';
        this.tState = ''; this.tHolder = ''; this.tReason = '';   // 0.8.0: the target's state (the renderer's target events)
    }

    /**
     * What G's Music has, from its 250 ms tick (idempotent): s = { setting 'off' | 'lyrics' |
     * 'visualizer', ok (signed in, the player answered), track: { uri, title, artist, kind, duration,
     * ad } | null, playing, pos (ms), lyrics: lyrics.js's entry for the track | null, palette (the
     * artwork's), vizPalette (the screen's visualizer colours), source (0.6.1: G's Dash's Cluster source
     * pick, 'auto' when not given), size (0.8.0: 'small' | 'medium' | 'large', the default Medium) }.
     * The HUD's: setting 'off' | 'lyrics'; no source (the pick is about the map area); the lyrics always
     * given when its setting is on.
     */
    update(s) {
        const now = this.now();
        this.s = s || {};
        const t = this.s.track;
        const setting = this.s.setting === 'lyrics' || (!this.hud && this.s.setting === 'visualizer') ? this.s.setting : 'off';
        // 0.8.0: a new size: the layers made again (the bars' place changes), once the renderer let the old go
        const lay = layoutFor(this.place, this.s.size);
        if (lay !== this.lay) {
            this.log.info(this.tag + ': size ' + lay.size);
            this.lay = lay;
            if (this.text || this.bars) { this._dropLayers(); this.freeUntil = now + FREE_MS; }
        }
        if (t && this.s.playing) this.pausedAt = 0;
        else if (t && !this.pausedAt) this.pausedAt = now;
        let why = '';
        // the Cluster source pick (0.6.1, G's Dash's cluster_source.js): only Auto and Music let it draw
        const source = typeof this.s.source === 'string' ? this.s.source : 'auto';
        this.source = source;
        if (setting === 'off') why = 'off';
        else if (!this.hud && source !== 'auto' && source !== 'music') why = 'source';
        else if (!this.s.ok) why = 'nospotify';
        else if (!t || !t.title || t.ad) why = 'notrack';
        else if (this.hud && !this._lyricsMaybe()) why = 'nolyrics';
        else if (!this.s.playing && now - this.pausedAt > PAUSE_DROP_MS) why = 'paused';
        else if (this.gaveUp && this.gaveUp === t.uri) why = 'failed';
        if (this.gaveUp && t && this.gaveUp !== t.uri) this.gaveUp = '';
        if (why !== this.reason && why) this.log.info(this.tag + ': ' + ({ off: 'off', nospotify: 'no Spotify', notrack: 'no track', paused: 'paused ' + (PAUSE_DROP_MS / 1000) + ' s - dropped', failed: 'given up for this track', nolyrics: 'no synced lyrics', source: 'G\'s Dash picked ' + source + ' - dropped' })[why]);
        this.reason = why;
        if (why) { if (this.cr) this._off(); this.want = false; return; }
        this.want = true;
        if (!this.cr) this._connect();
        this._apply();
    }

    _connect() {
        const now = this.now();
        if (this.err && now - this.errAt < LOAD_RETRY_MS) return;
        const c = loadClient(this.o);
        if (c.error) {
            if (!this.err || this.err.error !== c.error) this.log.warn(this.tag + ': ' + c.text + (c.detail ? ' (' + c.detail + ')' : ''));
            this.err = c; this.errAt = now;
            return;
        }
        this.err = null;
        this.stats.connects++;
        let cr;
        try { cr = this.cr = new c.ClusterRender(this.app, c.sock); } catch (e) { this.err = { error: 'load', text: e.message }; this.errAt = now; this.cr = null; return; }
        cr.on('ready', () => { if (this.cr !== cr) return; this.ready = true; this.log.info(this.tag + ': connected'); this._ask(); });
        cr.on('disconnected', () => { if (this.cr !== cr) return; this.ready = false; this.polled = false; this.downAt = this.now(); });
        cr.on('layer', (ref, state, reason) => {
            if (this.cr !== cr) return;
            const L = this.text && this.text.ref === ref ? this.text : this.bars && this.bars.ref === ref ? this.bars : null;
            if (!L) return;
            if (state === 'error' && L.state !== 'error') { L.errAt = this.now(); this.log.warn(this.tag + ': layer error' + (reason ? ' (' + reason + ')' : '')); }
            L.state = state || '';
        });
        cr.on('budget', (cap, max) => { if (this.cr === cr) this.budget = { cap, max }; });
        cr.on('refused', (op, ref, reason) => { if (this.cr === cr) this.log.warn(this.tag + ': refused ' + (op || '?') + ': ' + (reason || '?')); });
        // 0.8.0: the target's state (the HUD: parked behind the car's own content, the panel holding its scene...)
        cr.on('target', (name, state, holder, reason) => {
            if (this.cr !== cr || name !== this.target) return;
            if (state !== this.tState || (holder || '') !== this.tHolder) this.log.info(this.tag + ': ' + name + ' ' + state + (holder ? ' holder ' + holder : '') + (reason ? ' (' + reason + ')' : ''));
            this.tState = state || ''; this.tHolder = holder || ''; this.tReason = reason || '';
        });
        cr.on('status', (text) => {
            if (this.cr !== cr) return;
            const now = this.now(), seen = {}, others = [];
            mapLayers(text, this.app, this.target).forEach((l) => {
                if (drawing(l, this.seen, now) && l.app === 'ng_tv') others.push(l);
                seen[l.app + '#' + l.id] = this.seen[l.app + '#' + l.id];
            });
            this.seen = seen;
            if (others.length) this.tvAt = now;
            if (!!others.length !== !!this.others.length) this.log.info(this.tag + ': G\'s TV ' + (others.length ? 'is drawing - hidden' : 'stopped'));
            this.others = others;
            ownLayers(text, this.app, this.target).forEach((l) => {
                [this.text, this.bars].forEach((L) => { if (L && L.ref === l.id && l.state === 'error' && L.state !== 'error') { L.state = 'error'; L.errAt = now; } });
            });
            this.polled = true;
            this._apply();
        });
        this.downAt = this.now();
        this.poll = this.T.setInterval(() => this._tick(), POLL_MS);
        try { cr.connect(); } catch (e) { this.log.warn(this.tag + ': connect ' + e.message); }
    }
    _ask() { if (this.cr && this.ready) { try { this.cr.status(); } catch (e) { /* next poll */ } } }
    _tick() {
        if (!this.want || !this.cr) return;
        const now = this.now();
        if (!this.ready) {
            if (now - this.downAt >= RECONNECT_MS) { this.log.info(this.tag + ': reconnecting'); this._off(); this._connect(); }
            return;
        }
        this._ask();
        const bad = [this.text, this.bars].filter((L) => L && L.state === 'error');
        if (bad.length && now - Math.max.apply(null, bad.map((L) => L.errAt)) >= ERR_RETRY_MS) {
            if (this.errRetries >= ERR_RETRIES) {
                this.log.warn(this.tag + ': the renderer keeps refusing the layers - off for this track');
                this.gaveUp = (this.s && this.s.track && this.s.track.uri) || '?';
                this._off();
                this.want = false; this.reason = 'failed';
                return;
            }
            this.errRetries++;
            this.log.info(this.tag + ': layer in error - making it again (' + this.errRetries + ' of ' + ERR_RETRIES + ')');
            // 0.7.1: the old layers dropped now, made again FREE_MS later (an update or the next poll): never the
            // old and the new on the cluster's GPU in one batch (G's Dash 0.12.1's bug)
            this._dropLayers();
            this.freeUntil = now + FREE_MS;
        }
    }

    /** The route guidance signals (main.js): src 'nav' | 'carplay' | 'aa', v the raw value. */
    guidance(src, v) {
        if (!Object.prototype.hasOwnProperty.call(this.guide, src)) return;
        const g = guideValue(src, v);
        if (g === null) return;
        this.guide[src] = g;
        if (this.want) this._apply();
    }
    _guideTick(now) {
        const raw = this.guide.nav === true || this.guide.carplay === true || this.guide.aa === true;
        if (raw !== this.rawGuide) { this.rawGuide = raw; this.rawSince = now; }
        const was = this.guiding;
        if (raw && !this.guiding && now - this.rawSince >= GUIDE_ON_MS) this.guiding = true;
        if (!raw && this.guiding && now - this.rawSince >= GUIDE_OFF_MS) this.guiding = false;
        if (was !== this.guiding) this.log.info(this.tag + ': ' + (this.guiding ? 'route guidance - hidden' : 'route guidance ended'));
        return this.guiding;
    }

    /** 0.8.0, the HUD: the track has synced lyrics, or they are still being looked up. */
    _lyricsMaybe() {
        const s = this.s, e = s.lyrics;
        if (!e || (s.track && s.track.kind === 'episode')) return false;
        return e.state === 'loading' || (e.state === 'synced' && !!e.lines && e.lines.length > 0);
    }
    /** What to show now: 'lyrics' (synced lines, setting Lyrics + visualizer) or 'viz'; the HUD's 'lyrics' or 'blank'. */
    _mode() {
        const s = this.s, e = s.lyrics;
        if (s.setting === 'lyrics' && e && e.state === 'synced' && e.lines && e.lines.length && !(s.track && s.track.kind === 'episode')) return 'lyrics';
        return this.hud ? 'blank' : 'viz';
    }
    _view(mode, now) {
        const s = this.s, t = s.track, pal = barColours(s.palette);
        const v = { mode, title: t.title || '', artist: t.artist || '', paused: !s.playing, cur: '', next: '', gap: false, accent: pal[0], lay: this.lay.id };
        if (mode === 'lyrics') {
            // 0.8.0: the position now (posFn), so the scroll is drawn on time between main.js's 250 ms updates
            const pos = typeof s.posFn === 'function' ? s.posFn() : s.pos || 0;
            const L = lyricAt(s.lyrics.lines, pos || 0);
            v.cur = L.cur; v.next = L.next; v.gap = L.i < 0 || !L.cur;
            v.prev = L.prev;
            v.anim = s.playing && this._animOk() && L.e < 1 ? Math.round(easeOut(L.e) * ANIM_STEPS) / ANIM_STEPS : 1;
        }
        // the progress line: moved at most every PROGRESS_MS (or at once on a jump), so it costs little
        const p = t.duration ? Math.max(0, Math.min(1, (s.pos || 0) / t.duration)) : 0;
        if (now - this.progAt >= PROGRESS_MS || Math.abs(p - this.prog) > 0.05 || !s.playing) { this.prog = p; this.progAt = now; }
        v.prog = this.hud ? 0 : this.prog;           // the HUD has no progress line
        return v;
    }

    _apply() {
        if (!this.want || !this.cr || !this.ready || !this.polled) return;
        const now = this.now();
        const guiding = this._guideTick(now);
        const vis = !guiding && !this.others.length && now - this.tvAt >= HOLD_MS;
        const mode = this._mode();
        if (mode !== this.mode && this.mode) this.log.info(this.tag + ': ' + ({ lyrics: 'synced lyrics', viz: 'visualizer', blank: 'waiting for lyrics' })[mode]);
        this.mode = mode;
        if (!vis) {
            if (this.visible) {
                [this.text, this.bars].forEach((L) => { if (L) { try { this.cr.set(L.ref, { visible: false }); } catch (e) { /* gone */ } } });
                this.log.info(this.tag + ': hidden (' + (guiding ? 'route guidance' : 'G\'s TV') + ')');
            }
            this.visible = false;
            this._animate(false); this._scroll(false);
            return;
        }
        if (!this.text && now < (this.freeUntil || 0)) return;     // 0.7.1: just dropped, not let go yet
        // 0.8.0, the HUD: no layer until the track's lyrics are here (it would keep G's Dash's dials and HUD away)
        if (!this.text && mode === 'blank') return;
        // the text layer: made once, then only its changes
        const v = this._view(mode, now), key = textKey(v), Lay = this.lay;
        if (!this.text) {
            const img = textImage(this.Canvas, v, Lay);
            const ref = this._make(this.hud ? Z_HUD : Z_TEXT, 0, 0, this.hud ? HUD_W : MAP_W, this.hud ? HUD_H : MAP_H, img, 'bilinear', ANIM_FPS);
            if (!ref) return;
            this.text = { ref, state: 'new', img, key, madeAt: now, errAt: 0, anim: v.anim };
            this._send(ref, null, img.d, 'text');
        } else if (key !== this.text.key && now - this.textAt >= 1000 / (v.anim < 1 || this.text.anim < 1 ? ANIM_FPS : TEXT_FPS) - 2) {
            const img = textImage(this.Canvas, v, Lay), dd = dirty(this.text.img.d, img.d, img.w, img.h);
            this.text.key = key; this.text.img = img; this.textAt = now; this.text.anim = v.anim;
            if (dd) {
                const whole = dd.px.length > img.d.length * 0.6;
                this._send(this.text.ref, whole ? null : dd.rects, whole ? img.d : dd.px, 'text');
            }
        }
        // the bars: only for the visualizer
        if (mode === 'viz') {
            if (!this.bars) {
                const img = this._barsFrame();
                const B = Lay.bars, ref = this._make(Z_BARS, B.x, B.y, B.w, B.h, img, 'bilinear', BARS_FPS);
                if (ref) { this.bars = { ref, state: 'new', img, madeAt: now, errAt: 0 }; this._send(ref, null, img.d, 'bars'); }
            }
        } else if (this.bars) {
            try { this.cr.drop(this.bars.ref); this.stats.drops++; } catch (e) { /* gone */ }
            this.bars = null;
        }
        if (this.visible === false) {
            [this.text, this.bars].forEach((L) => { if (L) { try { this.cr.set(L.ref, { visible: true }); } catch (e) { /* gone */ } } });
            this.log.info(this.tag + ': shown again');
        }
        this.visible = true;
        this._animate(mode === 'viz' && (!!this.s.playing || this.clk.e > 0));
        // while synced lyrics play: checked at ANIM_FPS, so a scroll starts on time (main.js updates every 250 ms);
        // the image is drawn again only when its key changes
        this._scroll(!!this.text && ((mode === 'lyrics' && !!this.s.playing && this._animOk()) || v.anim < 1 || this.text.anim < 1 || this.text.key !== key));
    }
    /**
     * 0.8.0: while synced lyrics play, _apply() at ANIM_FPS (this timer): the view's key is cheap, the image is drawn
     * and sent only when it changed (a scroll: about 4 frames a line), else as before on main.js's updates.
     */
    _scroll(run) {
        if (!run) { if (this.lyrT) { this.T.clearInterval(this.lyrT); this.lyrT = null; } return; }
        if (!this.lyrT) {
            this.lyrT = this.T.setInterval(() => {
                if (!this.want || !this.cr || !this.ready) { this._scroll(false); return; }
                try { this._apply(); } catch (e) { this.log.warn(this.tag + ': ' + e.message); this._scroll(false); }
            }, Math.round(1000 / ANIM_FPS));
        }
    }
    /** 0.8.0: the scroll only while the renderer's upload cap is whole (Waze busy: the line just changes). */
    _animOk() {
        const b = this.budget;
        return !(b && b.max > 0 && b.cap < b.max);
    }
    _make(z, x, y, w, h, img, sampling, fps) {
        const ref = this.cr.image({ target: this.target, klass: KLASS, z, exclusive: false, contend: true, visible: true,
            x, y, w, h, iw: img.w, ih: img.h, sampling, fps });
        if (!ref) { this.log.warn(this.tag + ': image layer refused by the client'); return 0; }
        this.stats.layers++;
        this.log.info(this.tag + ': layer z ' + z + ' ' + img.w + 'x' + img.h + ' at ' + x + ',' + y + ' ' + w + 'x' + h + ' ' + sampling + ', fps ' + fps);
        return ref;
    }
    _send(ref, rects, px, which) {
        let ok;
        try { ok = this.cr.pixels(ref, rects, px); } catch (e) { ok = false; }
        if (ok !== false) { this.stats.sends++; this.stats.bytes += px.length; this.stats[which + 'Bytes'] += px.length; }
    }

    /** The bars' frame at the viz clock. */
    _barsFrame() { return barsImage(this.Canvas, this.clk, vizColours(this.s)); }
    _animate(run) {
        if (!run) { if (this.anim) { this.T.clearInterval(this.anim); this.anim = null; } return; }
        if (!this.anim) { this.clk.last = 0; this.anim = this.T.setInterval(() => this._frame(), Math.round(1000 / this._barsFps())); }
    }
    /** BARS_FPS, less when the renderer's budget is cut (Waze busy): at worst 4. */
    _barsFps() {
        const b = this.budget;
        if (b && b.max > 0 && b.cap < b.max) return Math.max(4, Math.round(BARS_FPS * b.cap / b.max));
        return BARS_FPS;
    }
    /** One step of the visualizer: the clock moves (easing to rest on Pause), the changed columns go. */
    _frame() {
        if (!(this.bars && this.visible && this.want && this.cr && this.s)) { this._animate(false); return; }
        const moving = VIZ.step(this.clk, this.now(), this.s.playing ? 1 : 0);
        const img = this._barsFrame(), dd = colDirty(this.bars.img.d, img.d, BARS_W, BARS_H, BARS_COLS);
        this.bars.img = img;
        if (dd) {
            const whole = dd.px.length > img.d.length * 0.8;
            this._send(this.bars.ref, whole ? null : dd.rects, whole ? img.d : dd.px, 'bars');
        }
        if (!moving) this._animate(false);           // at rest (paused): the picture stays, nothing more is sent
    }

    _dropLayers() {
        [this.text, this.bars].forEach((L) => { if (L && this.cr) { try { this.cr.drop(L.ref); this.stats.drops++; } catch (e) { /* gone */ } } });
        this.text = null; this.bars = null; this.visible = null;
        this._animate(false); this._scroll(false);
    }
    _off() {
        const cr = this.cr;
        if (this.poll) this.T.clearInterval(this.poll);
        this._dropLayers();
        if (cr) { try { cr.close(); } catch (e) { /* gone */ } this.log.info(this.tag + ': layers dropped'); }
        this._reset();
    }
    close() { this._off(); this.want = false; }

    /** The settings page's line: { kind: 'on' | 'wait' | 'off' | 'none' | 'error', text }. */
    view() {
        const r = this.reason;
        const PICK = { auto: 'Auto', logo: 'Logo', music: 'Music', map: 'Map', stock: 'Stock' };
        if (r === 'off') return { kind: 'off', text: !this.hud && this.source === 'music' ? 'Off - G\'s Dash picked Music: turn on here' : 'Off' };
        if (r === 'source') return { kind: 'off', text: 'Set in G\'s Dash: ' + (PICK[this.source] || this.source) };
        if (this.err) return { kind: 'none', text: ({ missing: 'Needs Cluster renderer (Store)', noclient: 'Update Cluster renderer', untrusted: 'Renderer not trusted', load: 'Renderer failed to load' })[this.err.error] || this.err.text };
        if (r === 'nospotify' || r === 'notrack') return { kind: 'wait', text: 'Shows while a track plays' };
        if (r === 'nolyrics') return { kind: 'wait', text: 'No synced lyrics for this track' };
        if (r === 'paused') return { kind: 'wait', text: 'Paused - comes back on Play' };
        if (r === 'failed') return { kind: 'error', text: 'Renderer refused - next track' };
        if (!this.cr || !this.ready || !this.polled) return { kind: 'wait', text: 'Connecting to renderer' };
        if (this.guiding) return { kind: 'wait', text: 'Hidden - route guidance' };
        if (this.others.length || this.now() - this.tvAt < HOLD_MS) return { kind: 'wait', text: 'Hidden - G\'s TV in the ' + (this.hud ? 'HUD' : 'cluster') };
        if (this.hud) {
            // 0.8.0: as G's Dash's HUD line - the target's own state first
            if (!this.text) return { kind: 'wait', text: 'Waiting for lyrics' };
            if (this.text.state === 'shown' || this.tState === 'shown' || this.tState === 'lingering') return { kind: 'on', text: 'Showing lyrics' };
            if (this.tState === 'unavailable') return { kind: 'none', text: 'HUD unavailable' };
            if (/scene id/.test(this.tReason)) return { kind: 'wait', text: 'Waiting - cluster panel in use' };
            if (this.tState === 'parked' || this.tState === 'waiting') return { kind: 'wait', text: this.tHolder === 'foreign' ? 'Waiting - HUD in use' : 'Needs HUD takeover (renderer)' };
            return { kind: 'wait', text: 'Asking for the HUD' };
        }
        return { kind: 'on', text: this.mode === 'lyrics' ? 'Showing lyrics' : 'Showing the visualizer' };
    }
}

module.exports = { MusicCluster, loadClient, trusted, mapLayers, ownLayers, drawing, guideValue, barsImage, barColours, vizColours, colDirty,
    textImage, textKey, dirty, lyricAt, wrapText, fitText, fitLines, pieces, lift, SCALE, SAFE, SAFE_TW, LAYOUT, layoutFor, SIZES, SIZE_SCALE, DEFAULT_SIZE,
    HUD_W, HUD_H, HUD_TEXT_W, HUD_TEXT_H, HUD_SAFE, HUD_TW, Z_HUD,
    SCROLL_MS, ANIM_FPS, ANIM_STEPS,
    TARGET, MAP_W, MAP_H, KLASS, Z_TEXT, Z_BARS, TEXT_W, TEXT_H, TEXT_FPS, BARS_W, BARS_H, BARS_SC, BARS_SHOW_W, BARS_SHOW_H, BARS_X, BARS_Y, BARS_FPS, BARS_COLS,
    POLL_MS, HOLD_MS, GUIDE_ON_MS, GUIDE_OFF_MS, PAUSE_DROP_MS, ERR_RETRIES, ERR_RETRY_MS, PROGRESS_MS };
