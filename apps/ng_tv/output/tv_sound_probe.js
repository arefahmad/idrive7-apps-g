'use strict';
/**
 * tv_sound_probe.js - where G's TV could send its sound on this unit, read on the car. Read-only: it lists and
 * reads files, and runs at most two harmless programs (/bin/true, to see whether the app may run programs at
 * all, and gst-inspect-1.0, which only lists GStreamer's plugins). It opens no audio device and calls no
 * media-player method, so nothing that plays is touched. Node 8, no npm modules.
 *
 *   const SP = require('./tv_sound_probe');
 *   SP.scan({ sources }).then((r) => { SP.summary(r); SP.text(r); })
 *
 * Why: picking BMW's generic app player (OapGenericMedia) only switches the car to it. The decoded sound still
 * has to be written somewhere: an ALSA output of Harman's SmartX mixer (as Android Auto and CarLife have,
 * /run/smartx/smartx_AndroidAutoMedia_CF_48_STEREO_p) through libasound, or a program such as GStreamer
 * that does it. This finds which of those an app (this one, with its own user id) can reach, and the
 * media-player interface's methods, which the switch would use.
 * Every path can be pointed elsewhere with MGU_AUDIO_ROOT (a folder standing in for /, for tests).
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.env.MGU_AUDIO_ROOT || '/';
const at = (p) => path.join(ROOT, p);
const APPISH = /oap|generic|dynamic|browser|onlineapp|\bapp/i;               // a name that could be an app's audio
const MEDIA = /media|oap|generic|dynamic|browser|entertain|overlay|interrupt/i;
const TOOLS = ['usr/bin/gst-launch-1.0', 'usr/bin/gst-inspect-1.0', 'usr/bin/gst-play-1.0', 'usr/bin/aplay', 'usr/bin/speaker-test',
    'usr/bin/paplay', 'usr/bin/ffmpeg', 'usr/bin/waveplayer', 'usr/lib/libasound.so.2'];
const GST_LINE = /alsa|aac|faad|fdk|avdec|libav|smartx|harman|appsrc|fdsrc|audioconvert|audioresample|qtdemux|decodebin|playbin|souphttp|wavparse|rawaudio|pcm/i;

const ok = (fn) => { try { fn(); return true; } catch (e) { return false; } };
const exists = (f) => ok(() => fs.accessSync(f));
const canX = (f) => ok(() => fs.accessSync(f, fs.constants.X_OK));
const canW = (f) => ok(() => fs.accessSync(f, fs.constants.W_OK));
const ls = (d) => { try { return fs.readdirSync(d).sort(); } catch (e) { return null; } };
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return null; } };
const uniq = (a) => a.filter((x, i) => a.indexOf(x) === i);
const short = (v, n) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '...' : s; };

/** Run a program: { ran, code, out, error }. Never throws. */
function run(cmd, args, ms) {
    return new Promise((res) => {
        try {
            cp.execFile(cmd, args, { timeout: ms || 4000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' }, (e, out, err) => {
                res({ ran: !(e && (e.code === 'ENOENT' || e.code === 'EACCES' || e.code === 'EPERM')), code: e ? (e.code || e.signal || 1) : 0, out: String(out || ''), error: e ? String(e.message || e).split('\n')[0] : '' });
            });
        } catch (e) { res({ ran: false, code: 'throw', out: '', error: String(e.message || e) }); }
    });
}

/** Printable runs (4+ characters) in a binary file that match re, at most max of them. */
function stringsOf(file, re, max) {
    let buf;
    try {
        const st = fs.statSync(file);
        if (st.size > 16 * 1024 * 1024) return { size: st.size, error: 'too big to read here', hits: [] };
        buf = fs.readFileSync(file);
    } catch (e) { return { error: e.code || e.message, hits: [] }; }
    const hits = [];
    let s = -1;
    for (let i = 0; i <= buf.length; i++) {
        const c = i < buf.length ? buf[i] : 0, p = c >= 0x20 && c < 0x7f;
        if (p && s < 0) s = i;
        else if (!p && s >= 0) {
            if (i - s >= 4) { const w = buf.toString('latin1', s, i); if (re.test(w) && hits.indexOf(w) < 0) hits.push(w); }
            s = -1;
            if (hits.length >= max) break;
        }
    }
    return { size: buf.length, hits };
}

/** pcm names the ALSA configuration defines, and whether a SmartX plugin type is used. */
function alsaConfig() {
    const files = ['etc/asound.conf', 'usr/share/alsa/alsa.conf'].map(at);
    ['usr/share/alsa/alsa.conf.d', 'etc/alsa/conf.d', 'usr/share/alsa/smartx'].forEach((d) => (ls(at(d)) || []).forEach((n) => { if (/\.conf$/.test(n)) files.push(path.join(at(d), n)); }));
    const r = { files: [], pcms: [], smartxType: false };
    files.forEach((f) => {
        const t = read(f);
        if (t === null) return;
        r.files.push(path.relative(ROOT, f));
        const re = /^\s*pcm\.("?)([A-Za-z0-9_\-:.]+)\1\s*[{=]/gm;
        for (let m = re.exec(t); m; m = re.exec(t)) if (r.pcms.indexOf(m[2]) < 0) r.pcms.push(m[2]);
        if (/type\s+"?smartx/i.test(t)) r.smartxType = true;
    });
    return r;
}

/** The media-player interface oap-mainapp carries: method names, the switch-like ones with their arguments. */
function mediaPlayer() {
    const t = read(at('usr/lib/oap-mainapp/src-gen/de_bmw_infotainment_entertainment_mediaplayer_MediaPlayer.json'));
    if (t === null) return { error: 'not readable' };
    let d;
    try { d = JSON.parse(t); } catch (e) { return { error: 'not JSON' }; }
    const methods = d.methods && typeof d.methods === 'object' ? d.methods : {};
    const names = Object.keys(methods);
    const key = /source|play|connect|start|stop|activ|request|focus|regist|audio|select|open/i;
    return {
        serviceId: d.serviceId, version: d.version || d.majorVersion,
        instances: d.instances || null,
        hasOapGeneric: /OapGeneric/.test(JSON.stringify(d.instances || '')),
        methods: names,
        keyMethods: names.filter((n) => key.test(n)).map((n) => n + ' ' + short(methods[n], 220)),
        fields: Object.keys(d.attributes || d.fields || {}),
    };
}

/** Everything; opts.sources: the Media menu sources (kit audio_probe's configs().sources). */
async function scan(opts) {
    opts = opts || {};
    const t0 = Date.now(), r = {};
    r.uid = typeof process.getuid === 'function' ? process.getuid() : null;
    r.groups = typeof process.getgroups === 'function' ? (() => { try { return process.getgroups(); } catch (e) { return []; } })() : [];
    // may this app run programs at all?
    const tr = await run(exists(at('bin/true')) ? at('bin/true') : '/bin/true', [], 3000);
    r.canRun = tr.ran && tr.code === 0;
    r.canRunError = r.canRun ? '' : tr.error;
    // the programs and libraries that could play sound
    r.tools = TOOLS.map((p) => ({ name: path.basename(p), there: exists(at(p)), runnable: canX(at(p)) }));
    // GStreamer's plugins (only lists them)
    const gi = at('usr/bin/gst-inspect-1.0');
    if (r.canRun && canX(gi)) {
        const g = await run(gi, [], 15000);
        const lines = g.out.split('\n').map((l) => l.trim()).filter(Boolean);
        r.gst = { ran: g.ran, code: g.code, error: g.error, total: lines.length, lines: lines.filter((l) => GST_LINE.test(l)).slice(0, 60) };
        const has = (re) => r.gst.lines.some((l) => re.test(l));
        r.gst.alsasink = has(/alsasink/); r.gst.appsrc = has(/\bappsrc\b/); r.gst.fdsrc = has(/\bfdsrc\b/);
        r.gst.aac = uniq(r.gst.lines.filter((l) => /aac|faad|fdk|avdec_aac/i.test(l)).map((l) => l.split(':').slice(0, 2).join(':')));
    }
    // ALSA: the plugins (a SmartX one), the configuration's pcm names
    r.alsaPlugins = uniq([].concat(ls(at('usr/lib/alsa-lib')) || [], ls(at('usr/lib64/alsa-lib')) || []));
    r.smartxPlugin = r.alsaPlugins.some((n) => /smartx/i.test(n));
    r.alsa = alsaConfig();
    r.alsa.appish = r.alsa.pcms.filter((n) => APPISH.test(n));
    r.alsa.media = r.alsa.pcms.filter((n) => MEDIA.test(n)).slice(0, 40);
    // SmartX's endpoints and the sound devices, and which this app may write
    const sx = ls(at('run/smartx'));
    r.smartx = sx === null ? null : { total: sx.length, writable: sx.filter((n) => canW(path.join(at('run/smartx'), n))), appish: sx.filter((n) => APPISH.test(n)), media: sx.filter((n) => MEDIA.test(n)).slice(0, 40) };
    const snd = ls(at('dev/snd'));
    r.snd = snd === null ? null : { total: snd.length, writable: snd.filter((n) => canW(path.join(at('dev/snd'), n))) };
    // the compiled routing catalogs: names that could be an app's sound
    r.catalogs = {};
    ['usr/share/audiomanager/SmartXMGU.bin', 'usr/share/audiomanager/AVBSourceSinkMGU.bin'].forEach((f) => { r.catalogs[path.basename(f)] = stringsOf(at(f), APPISH, 60); });
    // the media-player interface and the Media menu sources that look like an app's
    r.mediaPlayer = mediaPlayer();
    r.sources = (opts.sources || []).filter((s) => APPISH.test(s.name + ' ' + s.media + ' ' + s.am));
    r.sourceCount = (opts.sources || []).length;
    r.ms = Date.now() - t0;
    return r;
}

/** The few lines that decide the route (for the More page). */
function summary(r) {
    const L = [];
    L.push('Programs: ' + (r.canRun ? 'can run (uid ' + r.uid + ')' : 'cannot run (' + r.canRunError + ')'));
    const tl = r.tools.filter((x) => x.there).map((x) => x.name + (x.runnable ? '' : ' (no exec)'));
    L.push('Tools: ' + (tl.join(', ') || 'none'));
    if (r.gst) L.push('GStreamer: ' + (r.gst.code === 0 ? r.gst.total + ' plugin lines' : 'gst-inspect failed (' + r.gst.error + ')') + '; alsasink ' + (r.gst.alsasink ? 'yes' : 'no') +
        ', appsrc ' + (r.gst.appsrc ? 'yes' : 'no') + ', fdsrc ' + (r.gst.fdsrc ? 'yes' : 'no') + '; AAC: ' + (r.gst.aac.join(', ') || 'none'));
    L.push('ALSA: SmartX plugin ' + (r.smartxPlugin ? 'yes' : 'no') + '; ' + r.alsa.pcms.length + ' pcm names in ' + r.alsa.files.length + ' files; app-like: ' + (r.alsa.appish.join(', ') || 'none'));
    L.push('/run/smartx: ' + (r.smartx ? r.smartx.total + ' endpoints, ' + r.smartx.writable.length + ' writable by this app; app-like: ' + (r.smartx.appish.join(', ') || 'none') : 'not readable'));
    L.push('/dev/snd: ' + (r.snd ? r.snd.total + ' devices, writable: ' + (r.snd.writable.join(', ') || 'none') : 'not readable'));
    Object.keys(r.catalogs).forEach((k) => { const c = r.catalogs[k]; L.push(k + ': ' + (c.error ? c.error : (c.hits.join(', ') || 'no app-like names'))); });
    const mp = r.mediaPlayer;
    L.push('MediaPlayer: ' + (mp.error ? mp.error : 'OapGenericMedia ' + (mp.hasOapGeneric ? 'is' : 'is not') + ' an instance; ' + mp.methods.length + ' methods: ' + mp.methods.join(', ')));
    L.push('Media sources that look like an app\'s: ' + (r.sources.map((s) => s.name + ' (' + (s.am || s.media || '-') + ')').join(', ') || 'none') + ' of ' + r.sourceCount);
    return L;
}

/** The full report (for <data>/sound.txt). */
function text(r) {
    const L = summary(r).map((l) => '* ' + l);
    L.push('', '== groups ' + r.groups.join(','), '== tools ' + JSON.stringify(r.tools));
    if (r.gst) L.push('== gst-inspect-1.0 (audio-related lines)', ...r.gst.lines.map((l) => '  ' + l));
    L.push('== ALSA plugins: ' + r.alsaPlugins.join(', '), '== ALSA config files: ' + r.alsa.files.join(', '), '== ALSA pcm names (media-like): ' + r.alsa.media.join(', '));
    if (r.smartx) L.push('== /run/smartx media-like: ' + r.smartx.media.join(', '), '== /run/smartx writable: ' + r.smartx.writable.join(', '));
    Object.keys(r.catalogs).forEach((k) => L.push('== ' + k + ' (' + (r.catalogs[k].size || 0) + ' bytes): ' + r.catalogs[k].hits.join(', ')));
    const mp = r.mediaPlayer;
    if (!mp.error) {
        L.push('== MediaPlayer serviceId ' + mp.serviceId + ' version ' + mp.version, '  instances ' + JSON.stringify(mp.instances), '  fields ' + mp.fields.join(', '));
        mp.keyMethods.forEach((m) => L.push('  ' + m));
    }
    L.push('== took ' + r.ms + ' ms');
    return L.join('\n') + '\n';
}

module.exports = { scan, summary, text, stringsOf, run };
