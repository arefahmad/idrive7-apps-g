'use strict';
/**
 * tv_sound_test.js - Settings > Sound > Test sound: ask the car's own media player to play something, to find
 * out whether that is how G's TV can make sound. Unlike the sound check this DOES play: it calls playFile on
 * BMW's generic app player (OapGenericMedia, de.bmw.infotainment.entertainment.mediaplayer.MediaPlayer), which
 * may switch the car's audio source to it. Node 8, no npm modules.
 *
 *   const T = require('./tv_sound_test');
 *   const t = new T.SoundTest(dataDir, log);
 *   await t.next({ programme: 'https://archive.org/download/...mp4' })   -> { n, of, way, what, sent, reply, error }
 *
 * The sound check found G's TV may use that player and that it answers, but not what playFile takes, nor what
 * kind of file or path the car's media engine (another user, maybe its own /tmp) can open. So each tap tries
 * the next way, and the viewer says which one they heard:
 *   1. a short two-beep tone (WAV, 48 kHz stereo) in G's TV's data folder, as a plain path
 *   2. the same as a file:// URI
 *   3. a copy in /tmp, readable by anyone
 *   4. the Spelunkr programme on now (an https MP4 with sound), when there is one
 * playFile's arguments are read from the interface config the install generated (signals.loadConfig): the
 * string argument that looks like a location gets the file, every other argument an empty value. Everything
 * (the schemas of playFile and its neighbours, what was sent, the car's answer) is appended to
 * <data>/soundtest.txt for the next car session.
 */
const fs = require('fs');
const path = require('path');
const S = require('./kit/signals');

const MP = 'de.bmw.infotainment.entertainment.mediaplayer.MediaPlayer';
const INSTANCE = 'OapGenericMedia';
const TONE = 'gstv-test-tone.wav';
const TMP = '/tmp/' + TONE;
const LOCATION = /ur[il]|path|file|location|link|name/i;
const SHOWN = ['playFile', 'createPlaylist', 'setCurrentItem', 'sendButtonEvent'];

/** Two short beeps (660 Hz, then 880 Hz), 16-bit 48 kHz stereo WAV: a Buffer. */
function tone() {
    const rate = 48000, beeps = [[660, 0.0, 0.6], [880, 0.8, 1.4]], len = Math.round(rate * 1.8), data = Buffer.alloc(len * 4);
    for (let i = 0; i < len; i++) {
        const t = i / rate;
        let v = 0;
        beeps.forEach((b) => {
            if (t < b[1] || t >= b[2]) return;
            const fade = Math.min(1, (t - b[1]) / 0.02, (b[2] - t) / 0.02);
            v += Math.sin(2 * Math.PI * b[0] * t) * fade * 0.35;
        });
        const s = Math.round(v * 32767);
        data.writeInt16LE(s, i * 4); data.writeInt16LE(s, i * 4 + 2);
    }
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
    h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
}

/** A type node of a schema: a field may carry its type inline ({ n, t: 'Struct', e }) or nested ({ n, t: {...} }). */
const typeOf = (f) => (f && typeof f.t === 'object' && f.t ? f.t : f);
const kind = (f) => { const x = typeOf(f); return typeof x === 'string' ? x : (x && typeof x.t === 'string' ? x.t : ''); };

/**
 * The argument struct for a method schema, with `value` in its location-like string (else its first string).
 * { args, into: the dotted name that got value, or '' }
 */
function argsFor(schema, value) {
    const strings = [];
    const blank = (f, name) => {
        const k = kind(f), x = typeOf(f);
        if (k === 'String') { strings.push(name); return ''; }
        if (k === 'Boolean') return false;
        if (k === 'Struct') { const o = {}; ((x && x.e) || []).forEach((g) => { o[g.n] = blank(g, name ? name + '.' + g.n : g.n); }); return o; }
        if (/Array|Vector|List/i.test(k)) return [];
        if (/Byte\s*Buffer/i.test(k)) return Buffer.alloc(0);
        return 0;                                     // numbers and enumerations
    };
    const args = schema ? blank(schema, '') : {};
    const into = strings.filter((n) => LOCATION.test(n.split('.').pop()))[0] || strings[0] || '';
    if (into) {
        const parts = into.split('.');
        let o = args;
        parts.slice(0, -1).forEach((p) => { o = o[p]; });
        o[parts[parts.length - 1]] = value;
    }
    return { args: args && typeof args === 'object' ? args : {}, into };
}

const short = (v, n) => { let s; try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { s = String(v); } s = s === undefined ? 'nothing' : s; return s.length > n ? s.slice(0, n) + '...' : s; };

class SoundTest {
    constructor(dataDir, log) {
        this.dataDir = dataDir; this.log = log;
        this.n = 0; this.busy = false; this.proxy = null; this.last = null;
        this.report = path.join(dataDir, 'soundtest.txt');
    }
    _note(line) { try { fs.appendFileSync(this.report, new Date().toISOString() + ' ' + line + '\n'); } catch (e) { /* not saved */ } }
    /** The tone in the data folder and a copy in /tmp, readable by anyone. */
    _files() {
        const buf = tone(), own = path.join(this.dataDir, TONE);
        [own, TMP].forEach((f) => { try { fs.writeFileSync(f, buf); fs.chmodSync(f, 0o644); } catch (e) { this.log.warn('sound test: ' + f + ' not written (' + e.message + ')'); } });
        return own;
    }
    /** The ways to try, in order: [{ way, what }]. */
    ways(programme) {
        const own = path.join(this.dataDir, TONE);
        const w = [
            { way: 'tone, path', what: own },
            { way: 'tone, file:// URI', what: 'file://' + own },
            { way: 'tone in /tmp', what: TMP },
        ];
        if (programme) w.push({ way: 'Spelunkr programme (https)', what: programme });
        return w;
    }
    /** playFile's schema (and its neighbours', for the report) from this app's interface config. */
    schema() {
        let def;
        try { def = S.loadConfig(MP); } catch (e) { return { error: e.message }; }
        const m = def.methods || {}, out = { playFile: m.playFile ? m.playFile.schema || null : undefined, defs: {} };
        SHOWN.forEach((k) => { if (m[k]) out.defs[k] = { schema: m[k].schema || null, ret: m[k].retSchema || null }; });
        return out;
    }
    async _proxy() {
        if (this.proxy) return this.proxy;
        if (!S.hasNative()) throw new Error('no SOME/IP here (not on the car)');
        const p = await S.proxy(MP, INSTANCE);
        let up = false;
        await S.onAvailable(p, (a) => { up = up || a; }).catch(() => {});
        const until = Date.now() + 6000;
        while (!up && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
        if (!up) { try { if (p.shutdown) await p.shutdown(); } catch (e) { /* gone */ } throw new Error(INSTANCE + ' did not answer'); }
        this.proxy = p;
        return p;
    }
    /** Try the next way: { n, of, way, what, into, sent, reply, error }. */
    async next(opts) {
        if (this.busy) return this.last;
        this.busy = true;
        const ways = this.ways(opts && opts.programme), i = this.n % ways.length, w = ways[i];
        this.n++;
        const r = { n: i + 1, of: ways.length, way: w.way, what: w.what, into: '', sent: false, reply: null, error: '' };
        try {
            if (i < 3) this._files();
            const sc = this.schema();
            if (sc.error) throw new Error(sc.error);
            if (this.n === 1) this._note('schemas ' + short(sc.defs, 4000));
            if (sc.playFile === undefined) throw new Error('playFile is not in the media-player interface');
            const a = argsFor(sc.playFile, w.what);
            r.into = a.into;
            if (!a.into) throw new Error('playFile has no text argument for the file: ' + short(sc.playFile, 200));
            const p = await this._proxy();
            this._note('try ' + r.n + ' (' + w.way + '): playFile ' + short(a.args, 600));
            r.sent = true;
            r.reply = await S.call(p, 'playFile', a.args, 8000);
            this._note('try ' + r.n + ': answer ' + short(r.reply, 600));
        } catch (e) {
            r.error = String((e && e.message) || e);
            this._note('try ' + r.n + ' (' + w.way + '): ' + (r.sent ? 'call failed: ' : 'not sent: ') + r.error);
        }
        this.log.info('sound test ' + r.n + '/' + r.of + ' (' + r.way + '): ' + (r.error ? (r.sent ? 'failed: ' : 'not sent: ') + r.error : 'sent, answer ' + short(r.reply, 200)));
        this.busy = false;
        this.last = r;
        return r;
    }
    /** One line for the screen. */
    static line(r) {
        if (!r) return '';
        const head = 'Test ' + r.n + ' of ' + r.of + ' (' + r.way + '): ';
        if (!r.sent) return head + 'not sent - ' + r.error;
        if (r.error) return head + 'the call failed - ' + r.error;
        return head + 'sent; the car answered ' + short(r.reply, 160) + '. Heard it? If not, tap Test sound for the next way.';
    }
    close() { const p = this.proxy; this.proxy = null; try { if (p && p.shutdown) p.shutdown(); } catch (e) { /* gone */ } }
}

module.exports = { SoundTest, tone, argsFor, TONE };
