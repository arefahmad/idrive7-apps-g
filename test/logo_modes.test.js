'use strict';
/**
 * Per-driving-mode logos (G's Dash): which slot a mode uses, the empty-slot fallback, the decoded-frame
 * cache, and the built-in Stage 1 / 2 / 3 GIFs. Plain Node, no packages:
 *
 *     node test/logo_modes.test.js
 *
 * The driving mode is car.data().driveMode, the badge kit/runtime/car.js reads from
 * FES.statusFESVehicleDynamicSwitchHMI.actualValueModeDrivingExperience.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LM = require('../apps/ng_gsdash/core/logo_modes');
const { FrameCache, containBox } = require('../apps/ng_gsdash/core/logo_cache');
const PREFS = require('../apps/ng_gsdash/core/prefs');
const STAGES = require('../apps/ng_gsdash/core/logo_stages');
const { LogoPlayer } = require('../apps/ng_gsdash/core/logo_player');
const { Store, Clip } = require('../kit/runtime/anim');
const GIF = require('../kit/runtime/gif');
const Car = require('../kit/runtime/car');

let n = 0, failed = 0;
function test(name, fn) {
    n++;
    try { fn(); console.log('ok  ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + '\n' + (e.stack || e)); }
}

const quiet = { info() {}, warn() {} };

test('the FES badge maps onto a slot, and a mode with no badge does not', () => {
    const want = {
        COMFORT: 'comfort', COMFORT_PLUS: 'comfortplus', SPORT_DYNAMIC: 'sport', SPORT_EXPERT: 'sportplus',
        SPORT_INDIVIDUAL: 'individual', COMFORT_INDIVIDUAL: 'individual', ECO_PRO_EFFICIENT: 'ecopro',
        ECO_PRO_PLUS: 'ecoproplus', ECO_PRO_INDIVIDUAL: 'individual', ADAPTIVE: 'adaptive', INITIALISIERUNG: null,
    };
    Object.keys(want).forEach((name) => {
        const mode = Car.decodeMode({ actualValueModeDrivingExperience: name }).mode;
        assert.strictEqual(LM.slotForMode(mode), want[name], name + ' -> ' + mode);
    });
    for (let i = 0; i <= 10; i++) {
        const mode = Car.decodeMode(i).mode;
        assert.strictEqual(LM.slotForMode(mode), LM.slotForMode(Car.modeOf(i)), 'wire ' + i);
    }
    assert.strictEqual(LM.slotForMode(null), null);
    assert.strictEqual(LM.slotForMode('TRACK'), null);
});

test('per driving mode off: the main Logo, whatever the mode and whatever is saved', () => {
    const filled = { comfort: true, sport: true, sportplus: true, ecopro: true, adaptive: true };
    ['COMFORT', 'SPORT', 'SPORT+', 'ECO PRO', 'ADAPTIVE', null, 'TRACK'].forEach((label) => {
        const r = LM.resolve(false, label, filled);
        assert.strictEqual(r.use, 'main', label);
        assert.strictEqual(r.slot, null, label);
        assert.strictEqual(r.reason, 'off', label);
    });
});

test('per driving mode on: a filled slot plays, an empty one falls back to the main Logo', () => {
    const filled = { sport: true, adaptive: true };
    const sport = LM.resolve(true, 'SPORT', filled);
    assert.strictEqual(sport.use, 'slot');
    assert.strictEqual(sport.slot, 'sport');
    assert.strictEqual(sport.reason, 'slot');
    const comfort = LM.resolve(true, 'COMFORT', filled);
    assert.strictEqual(comfort.use, 'main');
    assert.strictEqual(comfort.slot, 'comfort');
    assert.strictEqual(comfort.reason, 'empty');
    const plus = LM.resolve(true, 'SPORT+', filled);
    assert.strictEqual(plus.use, 'main');
    assert.strictEqual(plus.reason, 'empty');
    assert.strictEqual(plus.slot, 'sportplus');
    const eco = LM.resolve(true, 'ECO PRO', {});
    assert.strictEqual(eco.use, 'main');
    assert.strictEqual(eco.slot, 'ecopro');
    const adapt = LM.resolve(true, 'ADAPTIVE', filled);
    assert.strictEqual(adapt.use, 'slot');
    assert.strictEqual(adapt.slot, 'adaptive');
    const none = LM.resolve(true, null, filled);
    assert.strictEqual(none.use, 'main');
    assert.strictEqual(none.reason, 'none');
    const unknown = LM.resolve(true, 'TRACK', filled);
    assert.strictEqual(unknown.use, 'main');
    assert.strictEqual(unknown.reason, 'unknown');
    assert.strictEqual(unknown.slot, null);
});

test('Comfort, Sport and Sport+ are always listed; Eco Pro and Adaptive once the car reports them', () => {
    assert.deepStrictEqual(LM.visibleSlots([]).map((s) => s.id), ['comfort', 'sport', 'sportplus']);
    const seen = LM.noteSeen(LM.noteSeen(LM.noteSeen([], 'ECO PRO'), 'ADAPTIVE'), 'COMFORT');
    assert.deepStrictEqual(seen, ['ecopro', 'adaptive']);
    assert.deepStrictEqual(LM.noteSeen(seen, 'ECO PRO'), seen, 'a mode already seen is not added again');
    assert.deepStrictEqual(LM.noteSeen(seen, 'NOT A MODE'), seen);
    const ids = LM.visibleSlots(LM.parseSeen(LM.serializeSeen(seen))).map((s) => s.id);
    assert.deepStrictEqual(ids, ['comfort', 'ecopro', 'sport', 'sportplus', 'adaptive']);
    assert.deepStrictEqual(LM.parseSeen('ECO PRO,comfort,nope'), ['ecopro']);
});

test('Drive\'s right panel stays the g-meter unless Spotify or Logo is chosen', () => {
    assert.strictEqual(PREFS.panelOf(undefined), 'g');
    assert.strictEqual(PREFS.panelOf('g'), 'g');
    assert.strictEqual(PREFS.panelOf('nope'), 'g');
    assert.strictEqual(PREFS.panelOf('spotify'), 'spotify');
    assert.strictEqual(PREFS.panelOf('logo'), 'logo');
    assert.strictEqual(PREFS.panelName('logo'), 'Logo');
    assert.strictEqual(PREFS.panelName(''), 'G-meter');
});

test('a Logo contained in the right panel keeps its shape and stays inside', () => {
    const wide = containBox(384, 256, 200, 400);
    assert.strictEqual(wide.w, 200);
    assert.strictEqual(wide.h, Math.round(256 * 200 / 384));
    assert.ok(wide.y >= 0 && wide.y + wide.h <= 400);
    const tall = containBox(384, 256, 800, 200);
    assert.strictEqual(tall.h, 200);
    assert.ok(tall.x >= 0 && tall.x + tall.w <= 800);
    assert.ok(Math.abs(wide.w / wide.h - 384 / 256) < 0.05);
});

test('slot files sit beside the main Logo, which keeps its name', () => {
    assert.strictEqual(LM.fileName('main'), 'widget_anim.bin');
    assert.strictEqual(LM.fileName('sport'), 'widget_anim_sport.bin');
    assert.strictEqual(LM.fileName('sportplus'), 'widget_anim_sportplus.bin');
    assert.strictEqual(LM.fileName('nope'), null);
    const names = LM.SLOTS.map((s) => LM.fileName(s.id));
    assert.strictEqual(new Set(names).size, names.length);
});

test('decoded frames stay per slot until the budget says otherwise, and the PNG frames stay', () => {
    const cache = new FrameCache(1500);
    const clip = (n) => ({ cache: [], drop() { this.cache = []; }, frames: [{ png: Buffer.alloc(n) }] });
    const a = clip(10), b = clip(10), c = clip(10);
    cache.put('comfort', a, { name: 'Stage 1' });
    cache.put('sport', b, { name: 'Stage 2' });
    a.cache[0] = new Uint8Array(1000);
    b.cache[0] = new Uint8Array(1000);
    cache.trim('sport');
    assert.strictEqual(b.cache.length, 1, 'the slot on screen keeps its frames');
    assert.strictEqual(a.cache.length, 0, 'the other slot is decoded again next time');
    assert.strictEqual(a.frames.length, 1, 'its PNG frames were not thrown away');
    assert.strictEqual(cache.peek('comfort').clip, a);
    c.cache[0] = new Uint8Array(100);
    cache.put('sportplus', c, {});
    cache.trim('sport');
    assert.strictEqual(c.cache.length, 1, 'a small one still fits beside the one showing');
    assert.ok(cache.bytes() <= 1500);
});

test('Stage 1, 2 and 3 are original GIFs, and each stage moves', () => {
    const list = STAGES.stages();
    assert.deepStrictEqual(list.map((s) => s.slot), ['comfort', 'sport', 'sportplus']);
    assert.deepStrictEqual(list.map((s) => s.name), ['Stage 1', 'Stage 2', 'Stage 3']);
    const first = [];
    list.forEach((s, stage) => {
        const info = GIF.parse(s.gif);
        assert.strictEqual(info.w, STAGES.W);
        assert.strictEqual(info.h, STAGES.H);
        assert.strictEqual(info.frames.length, STAGES.FRAMES);
        assert.ok(info.frames.every((f) => f.delay >= 20), 'delays the player will not rewrite');
        const it = GIF.frames(info);
        const seen = [];
        for (let f = 0; f < STAGES.FRAMES; f++) {
            const fr = it.next();
            assert.ok(fr, s.name + ' frame ' + f);
            const want = STAGES.frameIndices(stage, f);
            for (let i = 0; i < want.length; i++) {
                const c = STAGES.PALETTE[want[i]], o = i * 4;
                assert.strictEqual(fr.rgba[o], c[0], s.name + ' frame ' + f + ' px ' + i);
                assert.strictEqual(fr.rgba[o + 1], c[1]);
                assert.strictEqual(fr.rgba[o + 2], c[2]);
            }
            seen.push(Buffer.from(fr.rgba));
        }
        assert.strictEqual(it.next(), null);
        assert.notDeepStrictEqual(seen[0], seen[1], s.name + ' changes from one frame to the next');
        first.push(seen[0]);
    });
    assert.notDeepStrictEqual(first[0], first[1]);
    assert.notDeepStrictEqual(first[1], first[2]);
});

function prepared(byte) {
    return {
        w: 2, h: 2, fit: 'cover', duration: 200, source: null,
        frames: [{ png: Buffer.from([byte, 0, 0, 0]), delay: 100 }, { png: Buffer.from([byte, 1, 0, 0]), delay: 100 }],
    };
}
function fakeAw(file) {
    const aw = {
        log: quiet, store: new Store(file), clip: null, meta: null, gen: 0, assets: null, assetsGen: -1,
        shown: {}, under: {}, streamIdx: -1, useAt: 0, on: false, w: null,
        has() { return !!this.clip; },
        kick() {},
        enable(on) { this.on = !!on; },
        _dropImages() { this.dropped = (this.dropped || 0) + 1; },
        _releaseAssets() { this.assets = null; this.assetsGen = -1; },
        _set(meta, frames) {
            if (this.clip && this.clip.drop) this.clip.drop();
            this.gen++;
            this.meta = meta;
            this.clip = frames && frames.length ? new Clip(frames, meta.w, meta.h) : null;
        },
        _load() {
            let a = null;
            try { a = this.store.load(); } catch (e) { a = null; }
            this._set(a ? a.meta : null, a ? a.frames : null);
        },
        remove() { this.store.remove(); this._set(null, null); },
        replace(p, extra) { const meta = this.store.save(p, extra); this._set(meta, p.frames); return meta; },
    };
    aw._load();
    return aw;
}

test('switching slots keeps the decoded frames, and an empty slot is not a clip', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-logo-'));
    const aw = fakeAw(path.join(dir, 'widget_anim.bin'));
    const player = new LogoPlayer(aw, { dir: dir, log: quiet, Store: Store, Clip: Clip, budget: 5000 });
    aw.replace(prepared(9), { name: 'Main' });
    const mainClip = aw.clip;
    player.save('comfort', prepared(1), { name: 'Stage 1' });
    player.save('sport', prepared(2), { name: 'Stage 2' });
    assert.strictEqual(player.play('sportplus'), false, 'Sport+ has no GIF');
    assert.deepStrictEqual(player.filled(), { comfort: true, sport: true });
    player.play('comfort');
    const comfort = player.cache.peek('comfort').clip;
    comfort.cache[0] = new Uint8Array(800);
    const drops = comfort.drop;
    let dropped = 0;
    comfort.drop = function () { dropped++; return drops.call(comfort); };
    player.play('sport');
    assert.strictEqual(aw.clip, player.cache.peek('sport').clip);
    assert.strictEqual(dropped, 0, 'Comfort was not decoded away');
    assert.strictEqual(comfort.cache[0].length, 800);
    assert.strictEqual(player.cache.peek('comfort').clip, comfort, 'the same clip, not a fresh read');
    player.showMain();
    assert.strictEqual(aw.clip, mainClip, 'the main Logo is the clip already in memory');
    assert.strictEqual(player.source().indexOf('main@'), 0);
    player.play('sport');
    player.remove('sport');
    assert.strictEqual(player.filled().sport, undefined);
    assert.strictEqual(aw.clip, mainClip, 'a removed slot falls back to the main Logo');
    fs.readdirSync(dir).forEach((f) => fs.unlinkSync(path.join(dir, f)));
    fs.rmdirSync(dir);
});

console.log(failed ? failed + ' failed of ' + n : n + ' passed');
process.exit(failed ? 1 : 0);
