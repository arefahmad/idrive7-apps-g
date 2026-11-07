'use strict';
/**
 * car_player.js - what the car itself plays: Apple Music over CarPlay (and Bluetooth or USB), read from the
 * head unit's own media player, for G's Music (its "Music from" setting) and G's Dash's music panel (shared
 * in through app.json "share"). Apple has no API for another device to read what an iPhone plays, but the
 * car receives the title, artist, album and the time in the song from CarPlay to show them in its own
 * media screens, and an app may read them too.
 *
 * Where they are (found by arefahmad's Car Lyrics, github.com/arefahmad/idrive7-apps): BMW's MediaPlayer
 * interface, one instance per source (CarPlay's is CarPlayMedia):
 *   currentItemMetadata  [{ key: 'TITLE', value: { stringValue: '...' } }, { key: 'ARTIST', ... }, ...]
 *   currentItemTime      { elapsed, total } in ms (as G's TV's own player reports it)
 *   playerState          'PLAYER_STATE_PLAY' | 'PLAYER_STATE_PAUSE' | 'PLAYER_STATE_STOP'
 * Every instance the install's interface config names is watched (CarPlay first, then Bluetooth, USB...),
 * never OapGenericMedia (G's TV's own player). Read-only: it subscribes and reads; it never calls a
 * method or sets a field, so it cannot change what the car plays.
 *
 * The time comes about once a second; between those a clock runs on (at most HOLD_MS past the last), pulled
 * toward each new value (a share NUDGE of the gap) so the lyrics move smoothly, and jumping on a seek, a skip,
 * a pause or a resume.
 *
 * The artwork: the car doesn't pass CarPlay's artwork on, so ItunesArt finds the song with Apple's iTunes
 * Search API (free, no key) and gives its 600 px artwork's link, the same picture Apple Music shows.
 *
 *   const car = new CarPlayer(ctx.signals, log); car.start();
 *   car.track()        // { key, title, artist, artist1, album, duration, position, playing, source, inst } or null
 *   choose(mode, { status, pb }, car.track())   // 'spotify' | 'car': which one an app shows
 *   asPlayback(car.track())                      // the track as the apps' Spotify playback object
 *
 * Node 8: no ?., ??, object spread or optional catch binding.
 */
const querystring = require('querystring');

const MP = 'de.bmw.infotainment.entertainment.mediaplayer.MediaPlayer';
const FIELDS = ['currentItemMetadata', 'currentItemTime', 'playerState'];
const MAX_INSTANCES = 6;
const POLL_MS = 15000;            // the fields read again this often (a car that doesn't notify every change)
const NUDGE = 0.3;                // share of the gap to a new time from the car that the clock takes at once
const SNAP_MS = 1500;             // a gap bigger than this (a seek, a skip back) is jumped, not glided
const HOLD_MS = 4000;             // the clock runs at most this far past the car's last time
const TICK_MS = 3000;             // no playerState: playing while the time moved this recently
const MODES = ['auto', 'spotify', 'car'];

/* ----- the values as the car sends them ----- */

/** A value out of its typed wrapper ({ stringValue: 'x' }, { intValue: 3 }), else as it is. */
function unwrap(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
        const ks = Object.keys(v).filter((k) => /value$/i.test(k) && v[k] !== null && v[k] !== undefined && v[k] !== '');
        if (ks.length && typeof v[ks[0]] !== 'object') return v[ks[0]];
    }
    return v;
}
/** The metadata as { title, artist, album } (a list of { key, value } or an object with those names), or null. */
function metaOf(v) {
    const o = {};
    if (Array.isArray(v)) {
        v.forEach((e) => {
            if (!e || typeof e !== 'object') return;
            const k = e.key || e.type || e.name || e.attribute;
            const val = unwrap(e.value !== undefined ? e.value : e.text !== undefined ? e.text : e.data);
            if (typeof k === 'string' && (typeof val === 'string' || typeof val === 'number') && o[k.toLowerCase()] === undefined) o[k.toLowerCase()] = val;
        });
    } else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { o[k.toLowerCase()] = unwrap(v[k]); });
    else return null;
    const get = (re) => { const k = Object.keys(o).filter((x) => re.test(x) && typeof o[x] === 'string')[0]; return k ? String(o[k]).replace(/\s+/g, ' ').trim() : ''; };
    const title = get(/^(title|track_?title|song_?title|songname|trackname)$/);
    if (!title) return null;
    return { title, artist: get(/^(artist|artist_?name|performer|interpret)$/), album: get(/^(album|album_?name|album_?title)$/) };
}
/** The time as { elapsed, total } in ms, or null. Seconds (a total under 2 h's worth of seconds) made ms. */
function timeOf(v) {
    if (!v || typeof v !== 'object') return null;
    let e = Number(unwrap(v.elapsed !== undefined ? v.elapsed : v.position)), t = Number(unwrap(v.total !== undefined ? v.total : v.duration));
    if (!isFinite(e) || e < 0 || !isFinite(t) || t <= 1) return null;          // { elapsed 0, total 1 }: nothing loaded yet
    if (t < 7200) { e *= 1000; t *= 1000; }
    return { elapsed: Math.min(e, t), total: t };
}
/** The player's state: 'play' | 'pause' | 'stop' | '' (not known). */
function stateOf(v) {
    const s = String(unwrap(v) === undefined || unwrap(v) === null ? '' : unwrap(v)).toUpperCase();
    if (/PLAY(ING)?$/.test(s)) return 'play';
    if (/PAUSE/.test(s)) return 'pause';
    if (/STOP|IDLE|NONE/.test(s)) return 'stop';
    return '';
}
/** What a source is called on screen, from its instance name. */
function sourceName(inst) {
    const s = String(inst || '');
    if (/carplay|apple|iap/i.test(s)) return 'CarPlay';
    if (/bluetooth|a2dp|\bbt/i.test(s)) return 'Bluetooth';
    if (/usb/i.test(s)) return 'USB';
    return s.replace(/media$/i, '') || 'Car';
}
/** The instances a generated interface config names, CarPlay first, never G's TV's own player. */
function instancesOf(cfg) {
    let list = [];
    const ins = cfg && cfg.instances;
    if (Array.isArray(ins)) list = ins.map((x) => (x && typeof x === 'object' ? x.name || x.instance || x.id : x));
    else if (ins && typeof ins === 'object') list = Object.keys(ins);
    else if (typeof ins === 'string' && ins !== '*') list = [ins];
    list = list.filter((x) => typeof x === 'string' || typeof x === 'number').map(String).filter((x) => x && x !== '*' && !/oapgeneric/i.test(x));
    if (list.indexOf('CarPlayMedia') < 0) list.unshift('CarPlayMedia');
    const rank = (x) => (/carplay|apple|iap/i.test(x) ? 0 : /bluetooth|a2dp|bt/i.test(x) ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b));
    return list.slice(0, MAX_INSTANCES);
}

/* ----- the player ----- */

class CarPlayer {
    /** signals: ctx.signals (kit/runtime/signals.js); opts.now() for tests. */
    constructor(signals, log, opts) {
        this.signals = signals;
        this.log = log || { info() {}, warn() {} };
        this.now = (opts && opts.now) || Date.now;
        this.I = {};                 // instance -> { meta, metaAt, key, time, timeAt, state, clk, sub }
        this.err = '';
        this.started = false;
    }

    /** Subscribes to every instance (never throws; without the interface the app goes on without it). */
    async start() {
        if (this.started) return;
        this.started = true;
        const sg = this.signals;
        if (!sg || typeof sg.watch !== 'function') { this.err = 'no signals'; return; }
        let cfg = null;
        try { cfg = sg.loadConfig ? sg.loadConfig(MP) : null; } catch (e) { this.err = String(e.message || e); this.log.warn('car player: ' + this.err); return; }
        const insts = instancesOf(cfg);
        this.log.info('car player: watching ' + insts.join(', '));
        for (const inst of insts) {
            const h = {};
            FIELDS.forEach((f) => { h[f] = (v) => this.feed(inst, f, v); });
            try {
                const sub = await sg.watch(MP, inst, h, this.log, { pollMs: POLL_MS });
                this._inst(inst).sub = sub;
                if (sub && sub.error) this.log.warn('car player: ' + inst + ': ' + sub.error);
            } catch (e) { this.log.warn('car player: ' + inst + ': ' + (e.message || e)); }
        }
    }
    _inst(inst) { return this.I[inst] || (this.I[inst] = { inst, meta: null, metaAt: 0, key: '', time: null, timeAt: 0, state: '', clk: null, sub: null }); }

    /** A value from the car (the subscriptions; tests call it too). */
    feed(inst, field, v) {
        const I = this._inst(inst), now = this.now();
        if (field === 'currentItemMetadata') {
            const m = metaOf(v);
            const key = m ? m.title + '\u0001' + m.artist : '';
            if (key !== I.key) {
                I.clk = null;                        // a new song: its own clock
                if (m) this.log.info('car player: ' + sourceName(inst) + ' "' + m.title + '"' + (m.artist ? ' by ' + m.artist : ''));
            }
            I.meta = m; I.metaAt = now; I.key = key;
        } else if (field === 'currentItemTime') {
            const t = timeOf(v);
            if (!t) return;
            I.time = t; I.timeAt = now;
            this._follow(I, now);
        } else if (field === 'playerState') {
            const s = stateOf(v);
            if (s === I.state) return;
            // the clock stops or starts where it is now (the time's next value corrects it)
            if (I.clk) { I.clk.pos = this._clockAt(I.clk, now); I.clk.at = now; I.clk.playing = s === 'play'; }
            I.state = s;
        }
    }
    _playing(I, now) { return I.state === 'play' || (I.state === '' && !!I.clk && I.clk.moved && now - I.timeAt < TICK_MS); }
    _clockAt(c, now) { return c.pos + (c.playing ? Math.max(0, Math.min(now - c.at, HOLD_MS)) : 0); }
    /** A new time from the car: the clock set (a new song, a jump, a pause) or nudged toward it. */
    _follow(I, now) {
        const t = I.time, c = I.clk;
        if (!c) { I.clk = { pos: t.elapsed, at: now, playing: I.state !== 'pause' && I.state !== 'stop', last: t.elapsed, moved: false }; return; }
        if (t.elapsed === c.last) return;
        c.moved = true;
        const playing = I.state === 'play' || I.state === '';
        const predicted = this._clockAt(c, now), gap = t.elapsed - predicted;
        c.pos = !playing || !c.playing || Math.abs(gap) > SNAP_MS ? t.elapsed : predicted + gap * NUDGE;
        c.at = now; c.playing = playing; c.last = t.elapsed;
    }

    /**
     * The song the car plays now, or null: { key, title, artist, artist1, album, duration (ms, 0: not known),
     * position (ms), playing, source ('CarPlay'...), inst }. Stopped sources and ones not answering are left
     * out; the one playing wins, CarPlay first.
     */
    track(now) {
        now = now || this.now();
        let best = null, bestScore = -1;
        Object.keys(this.I).forEach((k) => {
            const I = this.I[k];
            if (!I.meta || I.state === 'stop' || (I.sub && I.sub.available === false)) return;
            const score = (this._playing(I, now) ? 4 : 0) + (/carplay/i.test(I.inst) ? 2 : 0);
            if (score > bestScore || (score === bestScore && I.metaAt > best.metaAt)) { best = I; bestScore = score; }
        });
        if (!best) return null;
        const I = best, m = I.meta, playing = this._playing(I, now);
        const dur = I.time ? I.time.total : 0;
        const pos = I.clk ? this._clockAt(I.clk, now) : 0;
        return { key: I.inst + '\u0001' + I.key, title: m.title, artist: m.artist, artist1: m.artist.split(/,|&| feat\.? /i)[0].trim(), album: m.album,
            duration: dur, position: dur ? Math.min(dur, pos) : pos, playing, timed: !!I.clk, source: sourceName(I.inst), inst: I.inst };
    }

    /** One line for a settings row: { kind: 'on' | 'wait' | 'none', text }. */
    view(now) {
        const t = this.track(now);
        if (t) return { kind: 'on', text: (t.playing ? 'Playing on ' : 'Paused on ') + t.source };
        if (this.err) return { kind: 'none', text: "The car's player isn't readable" };
        return { kind: 'wait', text: 'Nothing playing in the car' };
    }
}

/* ----- which source an app shows ----- */

/**
 * mode 'spotify' | 'car' | 'auto' (Spotify while it plays, else what the car plays, else Spotify's state);
 * sp = { status, pb } (the app's Spotify state), car = CarPlayer.track(). 'spotify' | 'car'.
 */
function choose(mode, sp, car) {
    if (mode === 'spotify') return 'spotify';
    if (mode === 'car') return 'car';
    const ok = sp && sp.status === 'ok' && sp.pb;
    if (ok && sp.pb.playing) return 'spotify';
    if (car && car.playing) return 'car';
    if (ok) return 'spotify';
    return car ? 'car' : 'spotify';
}
/** The car's song as the apps' Spotify playback object (main.js fromPlayer()): read-only, no artwork link yet. */
function asPlayback(t, now) {
    return { playing: !!t.playing, progress: t.position || 0, at: now || Date.now(), shuffle: false, repeat: 'off', ad: false,
        device: t.source, deviceType: 'car', title: t.title, artist: t.artist, artist1: t.artist1, album: t.album,
        duration: t.duration || 0, uri: 'car:' + t.key, art: null, kind: 'track', car: true, timed: !!t.timed };
}

/* ----- the artwork: Apple's iTunes Search API ----- */

/** Lower-case letters and digits only, accents dropped ("Beyoncé (Live)" -> "beyonce"). */
function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/\(.*?\)|\[.*?\]/g, '').replace(/ - .*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
/** The best search result for the song (same title and artist), or null when none is close enough. */
function pickResult(results, track) {
    const t = norm(track.title), a = norm(String(track.artist || '').split(/,|&| feat\.? /i)[0]), al = norm(track.album);
    let best = null, top = 0;
    (results || []).forEach((r) => {
        if (!r || !r.artworkUrl100) return;
        const rt = norm(r.trackName), ra = norm(r.artistName);
        let s = 0;
        if (rt === t) s += 4; else if (rt && t && (rt.indexOf(t) >= 0 || t.indexOf(rt) >= 0)) s += 2;
        if (a && ra && (ra.indexOf(a) >= 0 || a.indexOf(ra) >= 0)) s += 3;
        if (al && norm(r.collectionName) === al) s += 1;
        if (s > top) { top = s; best = r; }
    });
    return top >= 5 ? best : null;
}
/** An iTunes artwork link at px x px (it serves any size: .../100x100bb.jpg -> .../600x600bb.jpg). */
function sized(href, px) { return String(href).replace(/\/\d+x\d+(bb)?(-\d+)?\.(jpg|png|webp)$/i, '/' + px + 'x' + px + 'bb.jpg'); }

class ItunesArt {
    /** request(method, host, path, headers) -> Promise<{ status, body }> (spotify.js's request). */
    constructor(request, log, px) {
        this.request = request; this.log = log || { info() {}, warn() {} }; this.px = px || 600;
        this.cache = new Map();      // song -> { url (null: none), at } or { busy }
    }
    /** The artwork's https link for the song, or null (not looked up yet, looking, or none found). */
    url(track) {
        if (!track || !track.title) return null;
        const k = norm(track.title) + '|' + norm(track.artist);
        const e = this.cache.get(k);
        if (e && !e.busy && (e.url || Date.now() - e.at < 600000)) return e.url;
        if (e && e.busy) return null;
        this.cache.set(k, { busy: true });
        this._find(track).then((u) => this._put(k, u), (err) => { this.log.warn('artwork (iTunes): ' + (err && err.message)); this._put(k, null); });
        return null;
    }
    _put(k, u) {
        this.cache.delete(k);
        this.cache.set(k, { url: u, at: Date.now() });
        while (this.cache.size > 20) this.cache.delete(this.cache.keys().next().value);
    }
    async _find(track) {
        const term = [String(track.title).replace(/\s*[([].*$/, ''), String(track.artist || '').split(/,|&/)[0]].join(' ').trim();
        const q = querystring.stringify({ term, media: 'music', entity: 'song', limit: 10 });
        const r = await this.request('GET', 'itunes.apple.com', '/search?' + q, { Accept: 'application/json' });
        if (r.status !== 200) throw new Error('HTTP ' + r.status);
        const best = pickResult((JSON.parse(r.body.toString('utf8')) || {}).results, track);
        if (!best) this.log.info('artwork (iTunes): none for "' + track.title + '"');
        return best ? sized(best.artworkUrl100, this.px) : null;
    }
}

module.exports = { CarPlayer, ItunesArt, choose, asPlayback, metaOf, timeOf, stateOf, sourceName, instancesOf, pickResult, sized, norm,
    MP, FIELDS, MODES, NUDGE, SNAP_MS, HOLD_MS };
