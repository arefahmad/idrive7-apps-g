'use strict';
/**
 * logo_player.js - the Logo GIF that is actually playing (G's Dash), the main one or a driving-mode slot.
 *
 * The home widget (kit/runtime/widget_anim.js AnimatedWidget) keeps playing whatever clip it has. This
 * hands it the slot's clip, and keeps each slot's decoded frames (logo_cache.js) and, when the widget
 * is there, the HMI's already-uploaded frame handles. A mode change onto a slot it still holds is one
 * showAsset, not a decode and not a fresh upload, and the picture on screen stays until the new one
 * is ready so the widget does not blank. The main GIF file stays widget_anim.bin; a slot is
 * widget_anim_<id>.bin (logo_modes.fileName).
 *
 * aw: the app's AnimatedWidget. opts: { dir (the data folder), log, Store, Clip, budget }.
 * Store and Clip are kit/runtime/anim.js's, passed in so this file does not require the kit by a path
 * (the build lays every script side by side; tests load this file from the source tree). Node 8.
 */

const path = require('path');
const LM = require('./logo_modes');
const { FrameCache } = require('./logo_cache');

const ASSET_SETS = 3;                              // HMI handle sets kept (the one showing and two others)
const ASSET_BYTES = 12 * 1024 * 1024;              // those copies, on top of the slot files themselves
const ASSET_RETRY_MS = 30000;

function pngBytes(clip) {
    if (!clip || !clip.frames) return 0;
    let n = 0;
    for (let i = 0; i < clip.frames.length; i++) n += (clip.frames[i].png && clip.frames[i].png.length) || 0;
    return n;
}

class LogoPlayer {
    constructor(aw, opts) {
        const o = opts || {};
        this.aw = aw;
        this.dir = o.dir;
        this.log = o.log || (aw && aw.log) || { info() {}, warn() {} };
        this.Store = o.Store;
        this.Clip = o.Clip;
        this.cache = new FrameCache(o.budget);
        this.assets = {};                          // slot key -> { set, bytes, at }
        this.mode = 'main';                        // 'main' (the AnimatedWidget's own file) or 'slot'
        this.key = 'main';
        this.rev = 0;                              // bumps when the bytes behind the playing key change
        this._filled = null;
        this._patch();
    }

    /* ----- what the app calls ----- */

    /** { slotId: true } for slots that have a GIF file. Cached until a save or a remove. */
    filled() {
        if (this._filled) return this._filled;
        const o = {};
        LM.SLOTS.forEach((s) => { if (new this.Store(this.file(s.id)).has()) o[s.id] = true; });
        this._filled = o;
        return o;
    }
    /** The main Logo GIF is on disk or already in memory. */
    mainReady() {
        if (this.cache.peek('main')) return true;
        if (this.mode === 'main' && this.aw.has()) return true;
        return !!(this.aw.store && new this.Store(this.aw.store.file).has());
    }
    /** The slot's saved meta (name, frames, ...), loading the file the first time, or null. */
    info(id) {
        if (!LM.slotById(id)) return null;
        const e = this.cache.peek(id);
        if (e) return e.meta;
        if (!this.filled()[id]) return null;
        return this._ensure(id) ? this.cache.peek(id).meta : null;
    }
    /** 'main@3' or 'sport@3': the cluster picture's source, so a change pushes new pixels. */
    source() { return this.key + '@' + this.rev; }
    /**
     * Play this slot's GIF. false: no such slot, or it has no file. The main Logo is showMain().
     * The clip stays the same object when the slot was already loaded, so its decoded frames stay.
     */
    play(id) {
        if (!LM.slotById(id) || !this._ensure(id)) return false;
        this._show(id, this.cache.get(id));
        return true;
    }
    /** Back to the main Logo GIF (the AnimatedWidget's own file). No work when that is already playing. */
    showMain() {
        if (this.mode === 'main' && this.key === 'main') return true;
        const entry = this.cache.get('main');
        if (entry) { this._show('main', entry); return true; }
        this.aw.store && this.aw._load();
        return true;
    }
    /** Keep prepared (anim.prepare's result) as this slot's GIF and, when it is the one showing, play it. */
    save(id, prepared, extra) {
        if (!LM.slotById(id)) throw new Error('logo slot');
        const meta = new this.Store(this.file(id)).save(prepared, extra);
        const clip = new this.Clip(prepared.frames, prepared.w, prepared.h);
        this.cache.put(id, clip, meta);
        this.forgetAssets(id);
        this._filled = null;
        this.rev++;
        if (this.key === id) this._show(id, this.cache.get(id));
        this.log.info('logo ' + id + ': ' + (meta.name || 'a GIF') + ', ' + prepared.frames.length + ' frames');
        return meta;
    }
    /** Forget a slot's GIF, or 'main' for the main one (AnimatedWidget.remove). */
    remove(id) {
        if (!id || id === 'main') { this.aw.remove(); this._filled = null; return; }
        if (!LM.slotById(id)) return;
        new this.Store(this.file(id)).remove();
        this.cache.forget(id);
        this.forgetAssets(id);
        this._filled = null;
        this.rev++;
        if (this.key === id) this.showMain();
        this.log.info('logo ' + id + ': removed');
    }

    /* ----- inside ----- */

    file(id) {
        const name = LM.fileName(id);
        if (!name || name === LM.fileName('main')) throw new Error('logo slot');
        return path.join(this.dir, name);
    }
    _ensure(id) {
        if (this.cache.peek(id)) return true;
        const store = new this.Store(this.file(id));
        let a = null;
        try { a = store.load(); } catch (e) {
            this.log.warn('logo ' + id + ': ' + e.message + ' - the file is removed');
            try { store.remove(); } catch (x) { /* read-only */ }
            this._filled = null;
            return false;
        }
        if (!a) return false;
        this.cache.put(id, new this.Clip(a.frames, a.meta.w, a.meta.h), a.meta);
        return true;
    }
    _show(key, entry) {
        const aw = this.aw;
        if (!entry || !entry.clip) return;
        if (aw.clip === entry.clip && this.key === key) { this.cache.touch(key); return; }
        if (this.mode === 'main' && this.key === 'main' && aw.clip && !this.cache.peek('main')) this.cache.put('main', aw.clip, aw.meta);
        if (aw._dropImages) aw._dropImages();
        aw.meta = entry.meta;
        aw.clip = entry.clip;
        aw.gen++;
        aw.shown = {};
        aw.under = {};
        aw.streamIdx = -1;
        aw.useAt = Date.now();
        const held = this.assets[key];
        if (held && held.set && !held.set.released) { aw.assets = held.set; aw.assetsGen = aw.gen; held.at = Date.now(); }
        else aw.assetsGen = -1;
        this.key = key;
        this.mode = key === 'main' ? 'main' : 'slot';
        this.cache.touch(key);
        this.cache.trim(key);
        this._trimAssets(key);
        if (aw.kick) aw.kick();
    }
    hold(key, set, bytes) {
        const prev = this.assets[key];
        if (prev && prev.set && prev.set !== set && !prev.set.released && this.aw.w) this.aw.w.releaseAssets(prev.set);
        this.assets[key] = { set: set, bytes: bytes || 0, at: Date.now() };
    }
    forgetAssets(key) {
        const held = this.assets[key];
        if (!held) return;
        delete this.assets[key];
        if (this.aw.assets === held.set) { this.aw.assets = null; this.aw.assetsGen = -1; }
        if (held.set && !held.set.released && this.aw.w) this.aw.w.releaseAssets(held.set);
    }
    isHeld(set) {
        const keys = Object.keys(this.assets);
        for (let i = 0; i < keys.length; i++) if (this.assets[keys[i]].set === set) return true;
        return false;
    }
    _trimAssets(pin) {
        const keys = Object.keys(this.assets);
        const bytes = () => keys.reduce((n, k) => n + (this.assets[k] ? this.assets[k].bytes : 0), 0);
        const count = () => keys.filter((k) => this.assets[k]).length;
        let guard = keys.length + 1;
        while (guard-- > 0 && (count() > ASSET_SETS || bytes() > ASSET_BYTES)) {
            let victim = null, at = Infinity;
            for (let i = 0; i < keys.length; i++) {
                const k = keys[i];
                if (k === pin || !this.assets[k]) continue;
                if (this.assets[k].at < at) { at = this.assets[k].at; victim = k; }
            }
            if (!victim) break;
            this.forgetAssets(victim);
        }
    }
    /**
     * AnimatedWidget owns one clip and drops it, and its HMI handles, on every replace. A slot's clip
     * and handles are this cache's: a replace of the main GIF must not throw those away, and a slot
     * the widget has already uploaded must be shown again instead of uploaded again.
     */
    _patch() {
        const aw = this.aw, self = this;
        if (!aw || aw._logoPlayer) return;
        aw._logoPlayer = true;
        const origSet = aw._set, origRelease = aw._releaseAssets;
        aw._set = function (meta, frames) {
            const clip = this.clip;
            let restore = null;
            const owned = clip && self.cache.owns(clip);
            if (owned && self.key !== 'main') { restore = clip.drop; clip.drop = function () {}; }
            if (this.assets && self.isHeld(this.assets)) { this.assets = null; this.assetsGen = -1; }
            origSet.call(this, meta, frames);
            if (restore) clip.drop = restore;
            self.forgetAssets('main');
            self.cache.forget('main');
            if (this.clip) self.cache.put('main', this.clip, this.meta);
            self.mode = 'main';
            self.key = 'main';
            self.rev++;
        };
        aw._releaseAssets = function () {
            if (this.assets && self.isHeld(this.assets)) { this.assets = null; this.assetsGen = -1; return; }
            origRelease.call(this);
        };
        aw._ensureAssets = function (now) {
            const key = self.key, held = self.assets[key];
            if (held && held.set && !held.set.released) { this.assets = held.set; this.assetsGen = this.gen; held.at = Date.now(); return; }
            if (this.assetsBusy || now - this.assetsFailAt < ASSET_RETRY_MS) return;
            const c = this.clip;
            if (!c || !this.w || !this.w.assets) return;
            const gen = this.gen, t0 = Date.now();
            this.assetsBusy = true;
            this.w.assets(c.frames.map((f) => f.png), 'aw' + gen + '_' + key).then((set) => {
                self.hold(key, set, pngBytes(c));
                if (gen !== this.gen || this.clip !== c || !this.on) { self._trimAssets(self.key); return; }
                this.assets = set; this.assetsGen = gen;
                self._trimAssets(key);
                this.log.info('widget animation: ' + set.files.length + ' frames handed to the HMI in ' + (Date.now() - t0) + ' ms (' + key + ')');
            }, (e) => {
                this.assetsFailAt = Date.now();
                this.log.warn('widget animation: the HMI did not take the frames (' + (e && e.message || e) + ')');
            }).then(() => { this.assetsBusy = false; this.kick(); });
        };
    }
}

module.exports = { LogoPlayer, pngBytes, ASSET_SETS, ASSET_BYTES };
