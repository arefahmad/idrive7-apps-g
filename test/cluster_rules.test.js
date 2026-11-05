'use strict';
/**
 * The cluster & HUD rules (G's Dash 0.17.0, G's Music 0.9.0, G's TV 0.5.0): what each pick draws, the shared
 * pick file, Waze on cluster's switches, and the logo's, G's Music's and the HUD's behaviour against a stand-in
 * Cluster renderer client. Plain Node (8 or later), no packages, nothing installed:
 *
 *     node test/cluster_rules.test.js
 *
 * The apps' modules require each other as they are installed (side by side, the kit in kit/), so each app is
 * first copied that way into a temporary folder (as kit/tools/build.py installs it: every .js of the app, its
 * "share" files, the kit runtime).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-cluster-test-'));

function stage(app) {
    const out = path.join(TMP, app), adir = path.join(ROOT, 'apps', app);
    fs.mkdirSync(out); fs.mkdirSync(path.join(out, 'kit'));
    const walk = (d) => fs.readdirSync(d).forEach((f) => {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) { if (f !== 'data') walk(p); } else if (f.endsWith('.js')) fs.writeFileSync(path.join(out, f === 'main.js' ? 'app.js' : f), fs.readFileSync(p));
    });
    walk(adir);
    const spec = JSON.parse(fs.readFileSync(path.join(adir, 'app.json'), 'utf8'));
    (spec.share || []).forEach((rel) => fs.writeFileSync(path.join(out, path.basename(rel)), fs.readFileSync(path.join(ROOT, 'apps', rel))));
    const kr = path.join(ROOT, 'kit', 'runtime');
    fs.readdirSync(kr).forEach((f) => { if (f.endsWith('.js') || f.endsWith('.json')) fs.writeFileSync(path.join(out, 'kit', f), fs.readFileSync(path.join(kr, f))); });
    fs.writeFileSync(path.join(out, 'kit', 'app-spec.json'), JSON.stringify({ id: app, version: spec.version, settings: spec.settings }));
    return out;
}
const DASH = stage('ng_gsdash'), MUSIC = stage('ng_spotify');
const req = (dir, m) => require(path.join(dir, m));

let n = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/* ----- a stand-in Cluster renderer client (the tool's API as our modules use it) ----- */
const FAKE = path.join(TMP, 'fake_client.js');
fs.writeFileSync(FAKE, `'use strict';
const EventEmitter = require('events');
const all = [];
class ClusterRender extends EventEmitter {
    constructor(app, sock) { super(); this.app = app; this.layers = {}; this.calls = []; this.next = 1; this.statusText = ''; all.push(this); }
    connect() { this.emit('ready'); }
    close() { this.closed = true; }
    status() { this.emit('status', this.statusText); }
    _add(kind, o) { const ref = this.next++; this.layers[ref] = Object.assign({ kind }, o); this.calls.push(['make', ref, kind, Object.assign({}, o)]); return ref; }
    image(o) { return this._add('image', o); }
    effect(o) { return this._add('effect', o); }
    video(o) { return this._add('video', o); }
    asset(o) { return this._add('asset', o); }
    set(ref, o) { if (this.layers[ref]) Object.assign(this.layers[ref], o); this.calls.push(['set', ref, Object.assign({}, o)]); }
    drop(ref) { delete this.layers[ref]; this.calls.push(['drop', ref]); }
    pixels() { return true; }
    uniform() {} bind() {} animate() {} stop() {}
}
module.exports = { ClusterRender, DEFAULT_PATH: '/nonexistent.sock', all };
`);
const fake = require(FAKE);
function clock(t0) { const c = { t: t0 || 1e6 }; c.now = () => c.t; c.tick = (ms) => { c.t += ms; }; return c; }
const noTimers = { setInterval: () => ({}), clearInterval() {}, setTimeout: () => ({}), clearTimeout() {} };
const quiet = { info() {}, warn() {} };
const crOpts = (c) => ({ client: FAKE, sock: FAKE, testing: true, now: c.now, timers: noTimers, log: quiet });
const lastClient = () => fake.all[fake.all.length - 1];
const only = (cr, kind) => Object.keys(cr.layers).map((k) => cr.layers[k]).filter((l) => !kind || l.kind === kind);

/* ----- the rules ----- */
const CSRC = req(DASH, 'cluster_source.js');

test('every pick but Auto always shows what it says', () => {
    const T = {   // pick: [logo while open, logo in the background, guidance hides, G's TV, exclusive logo, Waze map]
        auto: [true, false, true, true, false, null],
        logo: [true, true, false, false, true, null],
        music: [true, true, false, false, true, null],
        map: [false, false, false, false, false, 1],
        stock: [false, false, false, false, false, 0],
    };
    Object.keys(T).forEach((p) => {
        const r = T[p];
        assert.strictEqual(CSRC.logoWanted(p, true, 'on'), r[0], p + ' logo open');
        assert.strictEqual(CSRC.logoWanted(p, false, 'on'), r[1], p + ' logo background');
        assert.strictEqual(CSRC.guideHides(p), r[2], p + ' guidance');
        assert.strictEqual(CSRC.tvAllowed(p), r[3], p + ' tv');
        assert.strictEqual(CSRC.logoExclusive(p), r[4], p + ' exclusive');
        assert.strictEqual(CSRC.wazeCluster(p), r[5], p + ' waze');
    });
    assert.strictEqual(CSRC.logoWanted('auto', true, 'off'), false, "Auto with 'Logo in cluster' off");
});
test("G's Music's map-area setting under each pick", () => {
    [['auto', 'off', 'off'], ['auto', 'lyrics', 'lyrics'], ['auto', 'visualizer', 'visualizer'],
        ['music', 'off', 'lyrics'], ['music', 'visualizer', 'visualizer'],
        ['logo', 'lyrics', 'off'], ['map', 'lyrics', 'off'], ['stock', 'visualizer', 'off']].forEach((c) => {
        assert.strictEqual(CSRC.musicSetting(c[0], c[1]), c[2], c.join(' '));
    });
});
test('the dials & HUD: one owner, named by the pick', () => {
    const T = { skin: [false, false, 0], hud: [false, false, 0], music: [true, false, 0], none: [false, true, null] };
    Object.keys(T).forEach((d) => {
        assert.strictEqual(CSRC.musicHud(d), T[d][0], d + ' music');
        assert.strictEqual(CSRC.tvHudAllowed(d), T[d][1], d + ' tv');
        assert.strictEqual(CSRC.wazeHud(d), T[d][2], d + ' waze');
    });
    // no pick known (no G's Dash, or one before 0.17.0): each app's own settings, as before
    assert.strictEqual(CSRC.musicHud(null), null);
    assert.strictEqual(CSRC.tvHudAllowed(null), true);
    assert.strictEqual(CSRC.wazeHud(null), null);
});

/* ----- the shared file ----- */
test('the pick file carries the dials & HUD owner; an older one reads as not set', () => {
    const dir = path.join(TMP, 'src1'), store = {};
    const settings = { get: (k) => store[k], set: (k, v) => { store[k] = v; } };
    assert.ok(CSRC.publish('logo', 1, { dir, displays: 'music' }).ok);
    let r = CSRC.readSource({ dir });
    assert.strictEqual(r.source, 'logo'); assert.strictEqual(r.displays, 'music');
    const rd = new CSRC.SourceReader({ dir, settings, log: quiet });
    r = rd.get();
    assert.strictEqual(r.displays, 'music'); assert.strictEqual(r.from, 'file');
    // a G's Dash before 0.17.0 writes no displays: null, and the cache goes with it
    const t = Date.now() + 5000;
    assert.ok(CSRC.publish('auto', 2, { dir }).ok);
    fs.utimesSync(path.join(dir, CSRC.FILE), t / 1000, t / 1000);
    r = rd.get();
    assert.strictEqual(r.source, 'auto'); assert.strictEqual(r.displays, null);
    // the file gone (a head-unit restart): the last good values
    assert.ok(CSRC.publish('stock', 3, { dir, displays: 'skin' }).ok);
    fs.utimesSync(path.join(dir, CSRC.FILE), (t + 9000) / 1000, (t + 9000) / 1000);
    rd.get();
    fs.unlinkSync(path.join(dir, CSRC.FILE));
    r = new CSRC.SourceReader({ dir, settings, log: quiet }).get();
    assert.deepStrictEqual([r.source, r.displays, r.from], ['stock', 'skin', 'cache']);
    assert.ok(CSRC.publish('auto', 4, { dir, displays: 'bogus' }).ok);
    assert.strictEqual(CSRC.readSource({ dir }).displays, null, 'an unknown owner is not written');
});
test("G's Music's state carries its HUD setting (null from an older G's Music)", () => {
    const dir = path.join(TMP, 'mus1');
    assert.ok(CSRC.publishMusic('lyrics', { dir, hud: 'lyrics' }).ok);
    assert.deepStrictEqual([CSRC.readMusic({ dir }).cluster, CSRC.readMusic({ dir }).hud], ['lyrics', 'lyrics']);
    assert.ok(CSRC.publishMusic('off', { dir }).ok);
    assert.strictEqual(CSRC.readMusic({ dir }).hud, null);
});

/* ----- Waze on cluster's switches ----- */
const W = req(DASH, 'waze_ctl.js');
test('Waze: what Waze had is remembered, and put back once nothing needs it', () => {
    let p = W.plan({ cluster: 1, hud: 1 }, { cluster: 0, hud: 0 }, { cluster: null, hud: null });
    assert.deepStrictEqual(p.cmds, [{ cmd: 'cluster', on: '0' }, { cmd: 'hud', on: '0' }]);
    assert.deepStrictEqual(p.orig, { cluster: 1, hud: 1 });
    p = W.plan({ cluster: 0, hud: 0 }, { cluster: 0, hud: 0 }, p.orig);     // done: nothing more
    assert.deepStrictEqual(p.cmds, []);
    p = W.plan({ cluster: 0, hud: 0 }, { cluster: null, hud: 0 }, p.orig);  // Stock no more: the map back on
    assert.deepStrictEqual(p.cmds, [{ cmd: 'cluster', on: '1' }]);
    p = W.plan({ cluster: 1, hud: 0 }, { cluster: null, hud: null }, p.orig);
    assert.deepStrictEqual(p.cmds, [{ cmd: 'hud', on: '1' }]);
    assert.deepStrictEqual(p.orig, { cluster: null, hud: 1 }, 'the cluster forgotten once back');
    p = W.plan({ cluster: 1, hud: 1 }, { cluster: null, hud: null }, p.orig);
    assert.deepStrictEqual([p.cmds, p.orig], [[], { cluster: null, hud: null }]);
    // already as wanted: nothing sent, nothing remembered
    p = W.plan({ cluster: 0, hud: 0 }, { cluster: 0, hud: 0 }, { cluster: null, hud: null });
    assert.deepStrictEqual([p.cmds, p.orig], [[], { cluster: null, hud: null }]);
    // an older tool (no switches reported): left alone
    p = W.plan({ cluster: null, hud: null }, { cluster: 0, hud: 0 }, { cluster: null, hud: null });
    assert.deepStrictEqual(p.cmds, []);
    assert.deepStrictEqual(W.parseRestore(W.formatRestore({ cluster: 1, hud: 0 })), { cluster: 1, hud: 0 });
    assert.deepStrictEqual(W.parseRestore('junk,cluster:7'), { cluster: null, hud: null });
});
test('Waze: switched over its control socket, and again later when its page holds it', () => new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(TMP, 'woc-')), sock = path.join(dir, 'ctl.sock'), status = path.join(dir, 'status.json');
    const got = [];
    let busy = true;
    const write = (c, h) => fs.writeFileSync(status, JSON.stringify({ ev: 'status', state: 'showing', cluster: c, hud: h }));
    write(1, 0);
    const srv = net.createServer((s) => {
        if (busy) { s.end('{"ev":"status","state":"error","target":null,"page":null,"reason":"busy"}\n'); return; }
        s.setEncoding('utf8');
        s.on('data', (d) => d.split('\n').filter(Boolean).forEach((l) => got.push(JSON.parse(l))));
    });
    srv.listen(sock, () => {
        const store = {}, c = clock(Date.now());
        const ctl = new W.WazeCtl(quiet, { settings: { get: (k) => store[k], set: (k, v) => { store[k] = v; } }, sock, status, now: c.now });
        ctl.tick({ cluster: 0, hud: null });                     // Stock: busy first
        setTimeout(() => {
            try {
                assert.strictEqual(ctl.busy, true, 'told busy');
                assert.strictEqual(store[W.RESTORE_KEY], 'cluster:1', 'what Waze had, saved');
                busy = false;
                ctl.tick({ cluster: 0, hud: null });             // within the retry wait: nothing
                c.tick(6000);
                ctl.tick({ cluster: 0, hud: null });
            } catch (e) { srv.close(); reject(e); return; }
            setTimeout(() => {
                try {
                    assert.deepStrictEqual(got, [{ cmd: 'cluster', on: '0' }]);
                    write(0, 0); c.tick(1000);
                    ctl.tick({ cluster: null, hud: null });          // Stock no more: put back
                } catch (e) { srv.close(); reject(e); return; }
                setTimeout(() => {
                    try {
                        assert.deepStrictEqual(got, [{ cmd: 'cluster', on: '0' }, { cmd: 'cluster', on: '1' }]);
                        write(1, 0); c.tick(1000);
                        ctl.tick({ cluster: null, hud: null });
                        assert.strictEqual(store[W.RESTORE_KEY], '', 'forgotten once back');
                        srv.close(); resolve();
                    } catch (e) { srv.close(); reject(e); }
                }, 700);
            }, 700);
        }, 300);
    });
}));
test('Waze: not running or too old: nothing sent', () => {
    const ctl = new W.WazeCtl(quiet, { status: path.join(TMP, 'none.json'), sock: path.join(TMP, 'none.sock') });
    ctl.tick({ cluster: 0, hud: 0 });
    assert.strictEqual(ctl.state, 'none'); assert.strictEqual(ctl.view().can, false);
    const f = path.join(TMP, 'old.json');
    fs.writeFileSync(f, JSON.stringify({ ev: 'status', state: 'showing' }));
    const old = new W.WazeCtl(quiet, { status: f, sock: path.join(TMP, 'none.sock') });
    old.tick({ cluster: 0, hud: 0 });
    assert.strictEqual(old.state, 'old'); assert.strictEqual(old.stats.sends + old.stats.errors, 0);
});

/* ----- G's Dash's logo ----- */
const CL = req(DASH, 'cluster_logo.js');
const IMG = { regular: () => ({ w: 448, h: 240, d: Buffer.alloc(448 * 240 * 4) }), pixel: () => ({ w: 27, h: 15, d: Buffer.alloc(27 * 15 * 4) }) };
function logo(c, s) {
    const lg = new CL.ClusterLogo(Object.assign(crOpts(c), { images: IMG }));
    lg.update(Object.assign({ on: true, look: '' }, s));
    return { lg, cr: lastClient() };
}
const TV_LAYER = 'layer 7 video of ng_tv on map, content z 100: shown\n  40 sent, 0 dropped';
test('Logo: shown through route guidance, covering the map area', () => {
    const c = clock(), x = logo(c, { guideHides: false, exclusive: true });
    const L = only(x.cr)[0];
    assert.ok(L, 'a layer'); assert.strictEqual(L.exclusive, true); assert.strictEqual(L.visible, true); assert.strictEqual(L.contend, true);
    x.lg.guidance('nav', 2); c.tick(5000); x.lg.update({ on: true, look: '', guideHides: false, exclusive: true });
    assert.strictEqual(only(x.cr)[0].visible, true, 'still shown during the route');
    x.lg.update({ on: true, look: '', guideHides: true, exclusive: false });   // to Auto
    assert.strictEqual(only(x.cr)[0].exclusive, false, 'not exclusive in Auto');
    c.tick(100); x.lg.update({ on: true, look: '', guideHides: true });
    assert.strictEqual(only(x.cr)[0].visible, false, 'Auto: the directions show');
    assert.ok(/route guidance/i.test(x.lg.view().text));
});
test("Auto: route guidance hides the logo, debounced, and brings it back", () => {
    const c = clock(), x = logo(c, { guideHides: true });
    x.lg.guidance('carplay', true); c.tick(500); x.lg.update({ on: true, look: '', guideHides: true });
    assert.strictEqual(only(x.cr)[0].visible, true, 'not before GUIDE_ON_MS');
    c.tick(600); x.lg.update({ on: true, look: '', guideHides: true });
    assert.strictEqual(only(x.cr)[0].visible, false);
    x.lg.guidance('carplay', false); c.tick(3100); x.lg.update({ on: true, look: '', guideHides: true });
    assert.strictEqual(only(x.cr)[0].visible, true);
});
test("G's TV over the logo: the logo stays up (suspended under it), so nothing is handed to the stock map", () => {
    const c = clock(), x = logo(c, { guideHides: true });
    x.cr.statusText = TV_LAYER;
    for (let i = 0; i < 4; i++) { c.tick(1000); x.lg._tick(); }
    assert.strictEqual(only(x.cr)[0].visible, true);
    assert.ok(!x.cr.calls.some((k) => k[0] === 'set' && k[2].visible === false), 'never hidden');
    assert.ok(/G's TV/.test(x.lg.view().text));
    x.cr.statusText = ''; c.tick(1000); x.lg._tick();
    assert.strictEqual(only(x.cr)[0].visible, true);
});
test('a lost slot (a door, a phone reconnecting): no stepping aside, the renderer wins it back', () => {
    const c = clock(), x = logo(c, { guideHides: true });
    x.cr.emit('target', 'map', 'shown', '', '');
    x.cr.emit('target', 'map', 'waiting', '', 'slot locked');
    c.tick(100); x.lg.update({ on: true, look: '', guideHides: true });
    assert.strictEqual(only(x.cr)[0].visible, true);
    assert.ok(!x.cr.calls.some((k) => k[0] === 'set' && k[2].visible === false));
});
test('Logo: My GIF replaces the look\'s G and keeps sending frames while moving', () => {
    const c = clock();
    let n = 0;
    const picture = {
        id: 'gif:1', animate: true,
        frame: (still) => ({ w: 4, h: 2, d: Buffer.from([n, still ? 1 : 2, 0, 255]), stamp: still ? '0' : String(n) }),
    };
    const x = logo(c, { picture: picture, parked: false, look: 'm' });
    const L = only(x.cr, 'image')[0];
    assert.ok(L, 'an image layer, not the look\'s shader');
    assert.strictEqual(L.iw, 4); assert.strictEqual(L.ih, 2); assert.strictEqual(L.w, 4); assert.strictEqual(L.h, 2);
    assert.strictEqual(L.fps, CL.FPS_ANIM);
    assert.strictEqual(L.sampling, 'bilinear');
    x.cr.emit('target', 'map', 'shown', '', '');
    assert.strictEqual(x.lg.view().text, 'Shown - your GIF');
    const before = x.lg.stats.sends;
    n = 1; x.lg._frame();
    assert.ok(x.lg.stats.sends > before, 'a later frame while moving');
});
test('Logo: a driving-mode change keeps the layer and writes the new GIF in place', () => {
    const c = clock();
    let stamp = 'comfort@1:0', byte = 1;
    const picture = {
        id: 'gif', source: 'comfort@1', animate: true,
        frame: () => ({ w: 4, h: 2, d: Buffer.from([byte, 0, 0, 255]), stamp: stamp }),
    };
    const x = logo(c, { picture: picture, parked: false, look: 'm' });
    const made = x.lg.stats.layers, sends = x.lg.stats.sends, drops = x.lg.stats.drops;
    picture.source = 'sport@1'; byte = 9; stamp = 'sport@1:0';
    x.lg.update({ on: true, look: 'm', picture: picture, parked: false });
    assert.strictEqual(x.lg.stats.layers, made, 'the layer is not built again');
    assert.strictEqual(x.lg.stats.drops, drops, 'the old picture is not dropped');
    assert.ok(x.lg.stats.sends > sends, 'the new frame is sent');
    assert.strictEqual(only(x.cr, 'image').length, 1);
});
test('Logo: a widget-sized GIF is fitted to the Pixel emblem\'s on-screen box', () => {
    const c = clock();
    const picture = {
        id: 'gif:big', animate: false,
        frame: () => ({ w: 384, h: 256, d: Buffer.alloc(384 * 256 * 4, 40), stamp: '0' }),
    };
    const x = logo(c, { picture: picture, parked: false, look: 'm' });
    const L = only(x.cr, 'image')[0];
    const fit = CL.fitClusterGif({ w: 384, h: 256, d: Buffer.alloc(384 * 256 * 4, 40), stamp: '0' });
    assert.strictEqual(fit.w, 360); assert.strictEqual(fit.h, 240);
    assert.strictEqual(fit.d.length, 360 * 240 * 4);
    assert.strictEqual(L.iw, 360); assert.strictEqual(L.ih, 240);
    assert.ok(L.iw <= 27 * CL.CELL && L.ih <= 15 * CL.CELL);
});

/* ----- G's Music ----- */
const MC = req(MUSIC, 'music_cluster.js');
const { Canvas } = req(MUSIC, 'kit/canvas.js');
const track = { uri: 'spotify:track:1', title: 'Song', artist: 'Band', kind: 'track', duration: 200000 };
const synced = { state: 'synced', lines: [{ t: 0, text: 'one' }, { t: 5000, text: 'two' }] };
function music(c, opts, s) {
    const m = new MC.MusicCluster(Object.assign(crOpts(c), { Canvas }, opts || {}));
    m.update(Object.assign({ setting: 'lyrics', ok: true, track, playing: true, pos: 1000, lyrics: synced, source: 'auto' }, s));
    return { m, cr: lastClient() };
}
test("G's Music in the map area: up under G's TV, hidden for route guidance only in Auto", () => {
    const c = clock(), x = music(c, {}, { guideHides: true });
    x.cr.statusText = TV_LAYER;
    c.tick(1000); x.m._tick();
    assert.ok(only(x.cr).every((l) => l.visible !== false), 'not hidden under G\'s TV');
    const y = music(c, {}, { source: 'music', guideHides: false });
    y.m.guidance('nav', 2); c.tick(1500); y.m.update({ setting: 'lyrics', ok: true, track, playing: true, pos: 2000, lyrics: synced, source: 'music', guideHides: false });
    assert.ok(only(y.cr).length && only(y.cr).every((l) => l.visible !== false), 'Music: shown through the route');
    y.m.update({ setting: 'lyrics', ok: true, track, playing: true, pos: 2100, lyrics: synced, source: 'auto', guideHides: true });
    assert.ok(only(y.cr).every((l) => l.visible === false), 'Auto: hidden for the route');
});
test("G's Music's HUD lyrics: only when G's Dash's pick gives it the HUD", () => {
    const c = clock(), before = fake.all.length;
    const m = new MC.MusicCluster(Object.assign(crOpts(c), { Canvas, target: 'hud' }));
    m.update({ setting: 'off', pickNote: "Set in G's Dash: Dials & HUD is G's Dash dials", ok: true, track, playing: true, pos: 1000, lyrics: synced });
    assert.strictEqual(fake.all.length, before, 'no connection at all');
    assert.ok(/G's Dash dials/.test(m.view().text));
    m.update({ setting: 'lyrics', pickNote: '', guideHides: false, ok: true, track, playing: true, pos: 1000, lyrics: synced });
    const cr = lastClient();
    assert.strictEqual(only(cr)[0].target, 'hud');
    cr.emit('target', 'hud', 'parked', 'stock', '');
    assert.ok(!/takeover|take_over/i.test(m.view().text), 'no hud_take_over_stock advice (it leaves the HUD out)');
});

/* ----- G's Dash's dials and HUD never give way to another app's layer ----- */
test("the dials and G's Dash's HUD: never hidden for another app's panel / HUD layer", () => {
    const c = clock();
    const HS = req(DASH, 'hud_shift.js'), CS = req(DASH, 'cluster_skin.js');
    const others = [{ app: 'ng_spotify', target: 'hud', state: 'shown' }, { app: 'waze_on_cluster', target: 'hud', state: 'waiting' }];
    const st = { on: true, enabled: true, speedAvail: true, data: { speed: 0, rpm: 800 }, mode: 'skin' };
    [new HS.HudShift(Object.assign(crOpts(c), { load: () => null })), new CS.ClusterSkin(Object.assign(crOpts(c), { load: () => null }))].forEach((p) => {
        p.st = st; p.stAt = c.now(); p.others = others; p.busyAt = c.now();
        const why = p._why();
        assert.ok(!/in use/.test(why), (p.constructor.name) + ': ' + why);
    });
});

/* ----- Options > Cluster & HUD's picks ----- */
test("Options > Cluster & HUD: one tap per pick; none while G's Dash is off", () => {
    const HUB = req(DASH, 'hub.js'), REC = req(DASH, 'kit/record.js'), LK = req(DASH, 'look_m.js');
    assert.ok(!HUB.SCREENS.some((x) => x[0] === 'quick'), 'no separate dash screen');
    assert.ok(!HUB.SCREENS.some((x) => x[0] === 'showcase'), 'Showcase is gone');
    assert.strictEqual(HUB.SCREENS[0][0], 'drive');
    assert.strictEqual(HUB.SCREENS[HUB.SCREENS.findIndex((x) => x[0] === HUB.HOME)][0], 'drive');
    const PREFS = req(DASH, 'prefs.js');
    assert.deepStrictEqual(PREFS.migrateLogo({ widget: 'gif', logo: 'logo' }), { value: 'gif', migrated: true });
    assert.deepStrictEqual(PREFS.migrateLogo({ widget: 'logo' }), { value: 'logo', migrated: true });
    assert.deepStrictEqual(PREFS.migrateLogo({ logo: 'gif' }), { value: 'gif', migrated: false });
    assert.deepStrictEqual(PREFS.migrateLogo({}), { value: 'logo', migrated: false });
    const got = [];
    const model = (on) => ({
        on, src: 'logo', disp: 'none',
        srcTiles: CSRC.SOURCES.map((id) => ({ id, name: CSRC.NAMES[id], line: id, ok: id !== 'map', why: 'Needs Waze on cluster' })),
        dispTiles: CSRC.DISPLAYS.map((id) => ({ id, name: CSRC.DISPLAY_NAMES[id], line: id })),
        down: () => false, tap: (k, fn) => { got.push(k); fn(); },
        pickSrc: (v) => got.push('src=' + v), pickDisp: (v) => got.push('disp=' + v),
    });
    const S = { t: LK.palette, own: true, x: 12, y: 118, w: 1576, h: 388 }, st = HUB.style(LK, LK.palette), Q = HUB.pickLayout(S.y, S.y + S.h);
    const cv = new REC.Recorder(1600, 520);
    HUB.pickRows(cv, st, S, model(true), Q);
    // every pick but the two current ones (logo, none)
    assert.deepStrictEqual(cv.targets.map((x) => x.key).sort(), ['qd:hud', 'qd:music', 'qd:skin', 'qs:auto', 'qs:map', 'qs:music', 'qs:stock']);
    cv.targets.forEach((x) => x.run());
    assert.ok(got.indexOf('src=stock') >= 0 && got.indexOf('disp=music') >= 0, got.join(' '));
    const off = new REC.Recorder(1600, 520);
    HUB.pickRows(off, st, S, model(false), Q);
    assert.strictEqual(off.targets.length, 0, 'the page\'s switch turns G\'s Dash on first');
});
test("Options > Cluster & HUD fits the car's page (520 px, more where it reaches lower)", () => {
    const HUB = req(DASH, 'hub.js');
    // reach: the page's bottom (G.pageBottom: 512 on the usual page); the page area as main.js makes it (SET_Y 118)
    [512, 540, 560, 600, 720].forEach((reach) => {
        const top = 118, bottom = reach - 6, Q = HUB.pickLayout(top, bottom);
        assert.ok(Q.yA - 12 - 18 >= top - 4, reach + ': the first label under the header');
        assert.ok(Q.yB - 12 - 18 >= Q.yA + Q.hA + 4, reach + ': the second label between the rows');
        assert.ok(Q.yC >= Q.yB + Q.hB + 10, reach + ': the foot under the rows');
        assert.ok(Q.yC + Q.hC <= bottom, reach + ': the foot inside the page (' + (Q.yC + Q.hC) + ' > ' + bottom + ')');
        assert.ok(Q.hA >= 110 && Q.hB >= 100 && Q.hC >= 72, reach + ': room for each part (' + [Q.hA, Q.hB, Q.hC] + ')');
    });
});

(async () => {
    for (const [name, fn] of tests) {
        n++;
        try { await fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
    }
    console.log('\n' + (n - failed) + ' of ' + n + ' passed');
    process.exit(failed ? 1 : 0);
})();
