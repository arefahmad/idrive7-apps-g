'use strict';
/**
 * logo_cache.js - decoded Logo frames kept per slot, so a driving-mode change does not decode the GIF again.
 *
 * Each slot's Clip (kit/runtime/anim.js) keeps its PNG frames for good and its decoded RGBA in clip.cache,
 * one entry per frame it has actually shown. clip.drop() forgets the RGBA and leaves the PNG frames.
 * The budget is those RGBA bytes. The slot on screen is never dropped; the least recently shown other
 * slot is, until the total fits. A widget GIF is at most about 20 MB decoded (anim.js maxRgbaBytes), so
 * the default holds the one on screen and the one just left. Node 8: no ?., no ??, no object spread.
 */

const DEFAULT_BUDGET = 40 * 1024 * 1024;

function decodedBytes(clip) {
    if (!clip || !clip.cache) return 0;
    let n = 0;
    const c = clip.cache;
    for (let i = 0; i < c.length; i++) if (c[i] && c[i].length) n += c[i].length;
    return n;
}

class FrameCache {
    constructor(budget) {
        this.budget = budget > 0 ? budget : DEFAULT_BUDGET;
        this.map = {};
    }
    keys() { return Object.keys(this.map); }
    /** The entry { clip, meta, at }, or null. Does not count as a show. */
    peek(key) { return this.map[key] || null; }
    /** The same, and this slot was just shown (it is the last one trim will drop). */
    get(key) {
        const e = this.map[key];
        if (!e) return null;
        e.at = Date.now();
        return e;
    }
    put(key, clip, meta) {
        const e = this.map[key];
        if (e) { e.clip = clip; e.meta = meta || e.meta; e.at = Date.now(); return e; }
        this.map[key] = { clip: clip, meta: meta || null, at: Date.now() };
        return this.map[key];
    }
    touch(key) { const e = this.map[key]; if (e) e.at = Date.now(); }
    /** Forget the slot (decoded frames and the clip). */
    forget(key) {
        const e = this.map[key];
        if (!e) return;
        if (e.clip && e.clip.drop) e.clip.drop();
        delete this.map[key];
    }
    /** True when this clip object is one of the slots'. */
    owns(clip) {
        const keys = this.keys();
        for (let i = 0; i < keys.length; i++) if (this.map[keys[i]].clip === clip) return this.map[keys[i]];
        return null;
    }
    bytes() {
        const keys = this.keys();
        let n = 0;
        for (let i = 0; i < keys.length; i++) n += decodedBytes(this.map[keys[i]].clip);
        return n;
    }
    /**
     * Drop decoded RGBA (not the PNG frames) of the least recently shown slots until the total fits.
     * `pin` is the slot on screen: its frames stay even when they alone pass the budget.
     * Returns the decoded bytes still held.
     */
    trim(pin) {
        const keys = this.keys().filter((k) => this.map[k]);
        let guard = keys.length + 1;
        while (this.bytes() > this.budget && guard-- > 0) {
            let victim = null, at = Infinity;
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (k === pin || !this.map[k]) continue;
                if (!(decodedBytes(this.map[k].clip) > 0)) continue;
                if (this.map[k].at < at) { at = this.map[k].at; victim = k; }
            }
            if (!victim) break;
            this.map[victim].clip.drop();
        }
        return this.bytes();
    }
}

/**
 * Where a sw x sh picture sits inside a bw x bh box, contained (the whole picture, centred).
 * { x, y, w, h } in the box. A zero side yields a 1 px result.
 */
function containBox(sw, sh, bw, bh) {
    sw = sw > 0 ? sw : 1; sh = sh > 0 ? sh : 1;
    bw = bw > 0 ? bw : 1; bh = bh > 0 ? bh : 1;
    const k = Math.min(bw / sw, bh / sh);
    const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    return { x: (bw - w) >> 1, y: (bh - h) >> 1, w: w, h: h };
}

module.exports = { FrameCache, decodedBytes, DEFAULT_BUDGET, containBox };
