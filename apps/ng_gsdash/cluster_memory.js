'use strict';
/**
 * cluster_memory.js - G's Dash 0.11.2: the cluster renderer's pixel memory (cluster-render 0.2.2,
 * src/compositor.cpp): one budget of 16 MiB (CompositorLimits pixel_bytes) for every app's pixels together.
 * An asset counts w x h x (r8 1 | rgba8 4) twice ("its pixels and a rectangle scratch"), an image layer
 * iw x ih x 4 twice, a video w x (h + h / 2) x 4 (+ w / 4 x h / 4 x 8 with pan_blocks), an effect nothing.
 * Anything that would pass the budget is refused: "the service's pixel memory is full".
 * Node 8.
 */
const LIMIT = 16 * 1024 * 1024;
const asset = (w, h, r8) => w * h * (r8 ? 1 : 4) * 2;
const image = (w, h) => w * h * 4 * 2;
const video = (w, h, pan) => w * (h + Math.floor(h / 2)) * 4 + (pan ? Math.floor(w / 4) * Math.floor(h / 4) * 8 : 0);

/** 0.11.2: the renderer's refusal when its pixel memory (16 MiB for every app together) is used up */
const MEM_FULL = /pixel memory is full/;
const APP_NAMES = { ng_spotify: 'G\'s Music', ng_tv: 'G\'s TV', ng_gsdash: 'G\'s Dash' };
/**
 * 0.11.2: who else holds the cluster renderer's pixel memory, from a status text: its "asset N fmt WxH of APP
 * on TARGET" and "layer N kind of APP on TARGET, ..." lines -> [{ name, what: ['map video', ...], bytes }]
 * (bytes: the assets' as the renderer counts them, twice; a layer's size is not in the status). Our own
 * skin (ownApp's panel assets and layers) is left out; ownApp's others are its logo (map) or HUD (hud).
 */
function memoryUsers(text, ownApp) {
    const by = {}, order = [];
    const get = (app, target) => {
        const own = app === ownApp;
        const name = own ? (target === 'map' ? 'G\'s Dash logo' : target === 'hud' ? 'G\'s Dash HUD' : 'G\'s Dash')
            : /waze/i.test(app) ? 'Waze' : (APP_NAMES[app] || app);
        if (!by[name]) { by[name] = { name, what: [], bytes: 0, n: {} }; order.push(name); }
        return by[name];
    };
    String(text || '').split('\n').forEach((line) => {
        let m = /^asset \d+ (r8|rgba8) (\d+)x(\d+) of (\S+) on (\w+)/.exec(line);
        if (m) {
            if (m[4] === ownApp && m[5] === 'panel') return;
            const u = get(m[4], m[5]);
            u.bytes += (+m[2]) * (+m[3]) * (m[1] === 'r8' ? 1 : 4) * 2;
            const k = m[5] + ' asset';
            u.n[k] = (u.n[k] || 0) + 1;
            return;
        }
        m = /^layer \d+ (\w+) of (\S+) on (\w+),/.exec(line);
        if (!m || (m[2] === ownApp && m[3] === 'panel') || m[1] === 'effect') return;
        const u = get(m[2], m[3]), k = m[3] + ' ' + m[1];
        u.n[k] = (u.n[k] || 0) + 1;
    });
    return order.map((name) => {
        const u = by[name];
        u.what = Object.keys(u.n).map((k) => (u.n[k] > 1 ? u.n[k] + ' ' + k + 's' : k));
        delete u.n;
        return u;
    });
}
/** "Waze (map video), G's Music (2 map images)" or '' */
function memoryNote(users) {
    return (users || []).map((u) => u.name + (u.what.length ? ' (' + u.what.join(', ') + ')' : '')).join(', ');
}

/**
 * 0.12.1: the renderer's accounting frees a dropped asset at once, but its GPU texture goes only when the
 * renderer next draws (the scene's destroy, then its flush): a drop and an upload in the same batch can
 * hold the old and the new pixels together on the GPU. So the old ones are dropped first, and the new
 * ones go up only once the service has answered a status asked after the drops (it handled them) and
 * FREE_MS (several of its frames) have passed. A look switch waits SETTLE_MS for the choice to settle
 * (the old look stays shown meanwhile), so a quick run of switches makes the last look only.
 */
const FREE_MS = 150, SETTLE_MS = 350;
/** 0.12.1: what we keep free of the 16 MiB for what the status does not size (other apps' image and video layers) */
const MARGIN = 1024 * 1024;
/** every asset in a status text, as the renderer counts it (twice) */
function statusBytes(text) {
    let b = 0;
    String(text || '').split('\n').forEach((line) => {
        const m = /^asset \d+ (r8|rgba8) (\d+)x(\d+) of /.exec(line);
        if (m) b += (+m[2]) * (+m[3]) * (m[1] === 'r8' ? 1 : 4) * 2;
    });
    return b;
}
/**
 * 0.12.1: would adding bytes (as counted, twice) fit, from the last status (asked after our drops)?
 * { ok, used, adding, free }: checked before anything is sent, so a look that would not fit is never uploaded.
 */
function fits(text, adding) {
    const used = statusBytes(text);
    return { ok: used + adding + MARGIN <= LIMIT, used, adding, free: LIMIT - used };
}
/**
 * 0.12.1: drops first, uploads after - the gate between them. dropped(asked) after the drops and the
 * status ask that follows them; open(answered) once that answer came and FREE_MS passed.
 */
const lastDrop = new Map();                             // a clock -> when any of G's Dash's cluster parts last dropped
class FreeGate {
    constructor(now) { this.now = now || Date.now; this.reset(); }
    reset() { this.pending = false; this.until = 0; this.at = -1e15; }
    dropped(asked) { this.pending = true; this.until = asked; this.at = this.now(); lastDrop.set(this.now, this.at); }
    /** also FREE_MS after another part's drops (the skin, HUD and full-screen test hand the panel to each other) */
    open(answered) {
        const t = this.now(), other = lastDrop.has(this.now) ? lastDrop.get(this.now) : -1e15;
        if (t - other < FREE_MS && t >= other) return false;
        if (!this.pending) return true;
        if (answered >= this.until && t - this.at >= FREE_MS) { this.pending = false; return true; }
        return false;
    }
}


/**
 * 0.13.0: our assets' uploads as the renderer's status lists them ("asset ID fmt WxH of APP on TARGET: N writes,
 * K KB, F failed"): { assets, unwritten (no whole write yet), failed (every failed or partial write so far) }.
 * The renderer draws a layer only once the assets it samples are written whole, and a failed write is retried
 * whole with the target's flush held (the last picture kept); the apps also wait for it (nothing shown
 * before the status says every asset of theirs on the target is written) and count the failures.
 */
function uploads(text, app, target) {
    const r = { assets: 0, unwritten: 0, failed: 0 };
    String(text || '').split('\n').forEach((line) => {
        const m = /^asset \d+ (?:r8|rgba8) \d+x\d+ of (\S+) on (\S+): (\d+) writes, \d+ KB, (\d+) failed/.exec(line);
        if (!m || m[1] !== app || (target && m[2] !== target)) return;
        r.assets++;
        if (+m[3] < 1) r.unwritten++;
        r.failed += +m[4];
    });
    return r;
}
const UPLOAD_LOG_MS = 30000;
/** 0.13.0: failed / partial uploads of ours, counted from the statuses; one log line a window when any */
class UploadWatch {
    constructor(log, tag, now) { this.log = log; this.tag = tag; this.now = now || Date.now; this.last = -1; this.n = 0; this.total = 0; this.at = this.now(); this.waits = 0; }
    /** a status: the failures since the last one counted (a renderer restart or new assets start again from 0) */
    see(u) {
        if (this.last >= 0 && u.failed > this.last) { this.n += u.failed - this.last; this.total += u.failed - this.last; }
        this.last = u.failed;
    }
    waited() { this.waits++; }
    reset() { this.last = -1; }
    tick(force) {
        const t = this.now();
        if (!force && t - this.at < UPLOAD_LOG_MS) return null;
        let line = null;
        if (this.n || this.waits) {
            line = this.tag + ': uploads last ' + Math.round((t - this.at) / 1000) + ' s: ' + this.n + ' failed or partial (retried whole by the renderer, the last picture kept), ' +
                this.waits + ' status checks waiting for a write; ' + this.total + ' failed since connecting';
            this.log.info(line);
        }
        this.n = 0; this.waits = 0; this.at = t;
        return line;
    }
}

/**
 * 0.13.0: the memory watchdog - the renderer's pixel memory (every app's assets, as it counts them) from the
 * statuses (its assets: the status does not size image and video layers): the peak, ours at the peak and what else held it, and "memory is full" refusals; one log line a
 * window when the peak passed HIGH (3/4 of the 16 MiB) or anything was refused as full, quiet otherwise.
 */
const HIGH = 12 * 1024 * 1024;
const mib = (b) => (b / 1048576).toFixed(1);
function ownBytes(text, app) {
    let b = 0;
    String(text || '').split('\n').forEach((line) => {
        const m = /^asset \d+ (r8|rgba8) (\d+)x(\d+) of (\S+) /.exec(line);
        if (m && m[4] === app) b += (+m[2]) * (+m[3]) * (m[1] === 'r8' ? 1 : 4) * 2;
    });
    return b;
}
class MemWatch {
    constructor(log, tag, app, now) { this.log = log; this.tag = tag; this.app = app; this.now = now || Date.now; this.at = this.now(); this._clear(); this.max = 0; this.cur = 0; }
    _clear() { this.peak = 0; this.ours = 0; this.who = ''; this.full = 0; }
    /** a status text */
    see(text) {
        const b = statusBytes(text);
        this.cur = b;
        if (b > this.max) this.max = b;
        if (b > this.peak) { this.peak = b; this.ours = ownBytes(text, this.app); this.who = memoryNote(memoryUsers(text, this.app).filter((u) => !/^G's Dash/.test(u.name))); }
    }
    /** a "pixel memory is full" refusal of ours */
    refused() { this.full++; }
    tick(force) {
        const t = this.now();
        if (!force && t - this.at < UPLOAD_LOG_MS) return null;
        let line = null;
        if (this.peak >= HIGH || this.full) {
            line = this.tag + ': renderer memory last ' + Math.round((t - this.at) / 1000) + ' s: assets peak ' + mib(this.peak) + ' of ' + mib(LIMIT) + ' MiB (ours ' + mib(this.ours) +
                (this.who ? '; also ' + this.who + ', image / video layers not sized' : '') + '), now ' + mib(this.cur) + ', ' + this.full + ' refused as full; highest since connecting ' + mib(this.max);
            this.log.info(line);
        }
        this._clear(); this.at = t;
        return line;
    }
}


/**
 * 0.13.8: the write wait, bounded. The renderer (compositor.cpp's render(), 0.3.3) writes a target's assets only
 * while the target is asked for (some layer on it visible) and not parked behind the HMI's content. A layer made
 * hidden (the skins, the full-screen test) or replayed hidden (the HUD after a renderer drop) therefore never had
 * its assets written, and 0.13.0's "shown only once every asset is written" waited for ever ("Making the skin").
 * The wait now holds only while our layer is visible in the renderer and for WRITE_WAIT_MS at most; then it is
 * confirmed as before 0.13.0: the renderer itself draws a layer only once the assets it samples are written whole
 * (compositor.cpp: "an asset it samples is not written yet"), so nothing half-written is ever on the screen.
 * c: the look's record ({ lifted: our layer sent visible, waitAt }). 'go': confirm now; 'wait': ask again on the next
 * pump; 'slow': still
 * not written after WRITE_WAIT_MS (writes failing, or the target parked by the HMI): asked again on the next poll
 * (1 s), never shown before it is written; 'lift': the caller sends its layer visible, still clear (u_fresh 0, unbound: draws nothing), so the renderer
 * asks for the target and writes the assets, then waits (the 0.13.0 guarantee kept: nothing shown before it is written).
 */
const WRITE_WAIT_MS = 3000;
function writeWait(up, c, now) {
    if (!up || !up.unwritten || !c) return 'go';
    if (!c.lifted) return 'lift';
    if (!c.waitAt) c.waitAt = now;
    return now - c.waitAt < WRITE_WAIT_MS ? 'wait' : 'slow';
}
/** the old yes/no form (true: wait) */
function waitWrites(up, c, now) { return writeWait(up, c, now) === 'wait'; }

/**
 * 0.13.8: one look's build (made -> confirmed), timed: ring lines for its start, finish, failure and duration; a
 * build not confirmed within STUCK_MS is dropped and made again after BACKOFF (2, 5, 10, 30 s, then 30 s), never
 * at once; after MAX_TRIES in a row it is reported (the stock dials stay) until a setting change or Refresh cluster.
 */
const BUILD_STUCK_MS = 10000, BUILD_BACKOFF = [2000, 5000, 10000, 30000], BUILD_MAX_TRIES = 5;
class BuildWatch {
    constructor(log, tag, now) { this.log = log; this.tag = tag; this.now = now || Date.now; this.reset(); }
    reset() { this.id = ''; this.at = 0; this.held = 0; this.tries = 0; this.retryAt = -1e15; this.last = null; }
    start(id) {
        this.id = String(id); this.at = this.now() || 1; this.held = 0;
        this.log.info(this.tag + ': build ' + this.id + ' started' + (this.tries ? ' (try ' + (this.tries + 1) + ')' : ''));
    }
    get busy() { return !!this.at; }
    done() {
        if (!this.at) return;
        const ms = this.now() - this.at;
        this.log.info(this.tag + ': build ' + this.id + ' finished in ' + ms + ' ms');
        this.last = { id: this.id, ok: true, ms }; this.at = 0; this.tries = 0; this.retryAt = -1e15;
    }
    /** a failed build: next try after the backoff; returns the wait (ms) */
    failed(why) {
        const ms = this.at ? this.now() - this.at : 0;
        this.tries++;
        const wait = BUILD_BACKOFF[Math.min(this.tries - 1, BUILD_BACKOFF.length - 1)];
        this.retryAt = this.now() + wait;
        this.log.warn(this.tag + ': build ' + (this.id || '?') + ' failed (' + why + ') after ' + ms + ' ms, try ' + this.tries + ', again in ' + Math.round(wait / 1000) + ' s');
        this.last = { id: this.id, ok: false, ms, why }; this.at = 0;
        return wait;
    }
    /** dropped before it finished (a look switch, closed): no failure */
    cancel() { this.at = 0; }
    /** waiting on something that is not the renderer (driving, a popup): not counted as stuck */
    hold() { if (this.at) this.held = this.now() || 1; }
    stuck() { return !!this.at && this.now() - Math.max(this.at, this.held) >= BUILD_STUCK_MS; }
    may() { return this.now() >= this.retryAt && this.tries < BUILD_MAX_TRIES; }
    get gaveUp() { return this.tries >= BUILD_MAX_TRIES; }
}

/** 0.13.8: state changes of a layer for the ring ("state a -> b"), at most one line a second (the rest counted) */
class StateLog {
    constructor(log, tag, now) { this.log = log; this.tag = tag; this.now = now || Date.now; this.state = ''; this.said = ''; this.at = -1e15; this.n = 0; }
    see(state) {
        state = String(state || '');
        if (state === this.state) return;
        this.state = state; this.n++;
        this.flush();
    }
    flush() {
        if (this.state === this.said || this.now() - this.at < 1000) return;
        this.log.info(this.tag + ': state ' + (this.said || 'start') + ' -> ' + this.state + (this.n > 1 ? ' (' + this.n + ' changes)' : ''));
        this.said = this.state; this.at = this.now(); this.n = 0;
    }
}

/** 0.13.8: another app's art in the renderer that was not there when the pause began (by name; G's Dash's own left
 *  out): a paused layer lets go at once, so its kept memory never stands in another app's way */
function userNames(text, app) { return memoryUsers(text, app).map((u) => u.name).filter((n) => !/^G's Dash/.test(n)); }
function newUsers(before, text, app) { const was = before || []; return userNames(text, app).filter((n) => was.indexOf(n) < 0); }

/** 0.13.8: connected, its status asked every second, no answer this long: reconnected (10, 20, 40, then 60 s) */
const SILENT_MS = [10000, 20000, 40000, 60000];
const LOST_MS = 5000;   // silent this long and answering again: the asks meanwhile counted lost
const silentWait = (n) => SILENT_MS[Math.min(n, SILENT_MS.length - 1)];

/** 0.13.8: a popup's pause - how long a hidden layer is kept made (scene, assets, connection) for the screen to come back */
const PAUSE_MS = 90000;

/**
 * 0.14.2: the Cluster renderer gone within CRASH_MS of our ask for a target (its 'acquiring' event): a strike.
 * On the car cluster-render 0.3.3 .. 0.3.6 ended in its vsomeip thread 8 .. 100 ms after the HUD's scene
 * (0x01000400, shared with the panel and the HMI's speech dialog) was asked for again after a release, and again
 * at each of its restarts while G's Dash asked again at once: every app's cluster layers (Waze's map too) down
 * for about 40 s. After a strike the target is asked for again only after STRIKE_WAIT_MS[n]; after STRIKES_MAX
 * in a row it is left alone for the run (Refresh cluster or the user's own switch: forgive()). Shown
 * STRIKE_RESET_MS: the strikes forgotten.
 */
const CRASH_MS = 3000, STRIKE_WAIT_MS = [20000, 60000], STRIKES_MAX = 3, STRIKE_RESET_MS = 60000;
class CrashGuard {
    constructor(log, tag, now, what) { this.log = log; this.tag = tag; this.now = now; this.what = what; this.state = ''; this.forgive(); }
    forgive() { this.strikes = 0; this.until = 0; this.crashed = false; this.acqAt = 0; this.shownAt = 0; }
    /** the target's event state */
    see(state) {
        const now = this.now() || 1;
        if (state === 'acquiring' && this.state !== 'acquiring') this.acqAt = now;
        if (state === 'shown' && this.state !== 'shown') { this.shownAt = now; this.acqAt = 0; }
        this.state = state || '';
    }
    /** the connection lost: a strike when our ask was pending and recent */
    lost() {
        const since = this.now() - this.acqAt, pending = this.state === 'acquiring';
        const recent = !!this.acqAt && since <= CRASH_MS;
        this.state = ''; this.acqAt = 0;
        if (!recent) return false;
        if (!pending) { this.log.info(this.tag + ': the renderer went ' + since + ' ms after the ' + this.what + ' was asked for'); return false; }
        this.strikes++;
        const why = 'the Cluster renderer ended ' + since + ' ms after we asked for the ' + this.what;
        if (this.strikes >= STRIKES_MAX) {
            this.crashed = true; this.until = 0;
            this.log.warn(this.tag + ': ' + why + ' (' + this.strikes + ' times in a row) - the ' + this.what + ' stays off until Refresh cluster');
        } else {
            const wait = STRIKE_WAIT_MS[Math.min(this.strikes - 1, STRIKE_WAIT_MS.length - 1)];
            this.until = this.now() + wait;
            this.log.warn(this.tag + ': ' + why + ' (' + this.strikes + ' of ' + STRIKES_MAX + ') - asking again in ' + Math.round(wait / 1000) + ' s');
        }
        return true;
    }
    /** '' | 'renderer restarting' (waiting out a strike) | 'renderer crashed' (off for the run) */
    why() { return this.crashed ? 'renderer crashed' : this.now() < this.until ? 'renderer restarting' : ''; }
    /** every poll: shown long enough, the strikes forgotten */
    tick() {
        if (this.strikes && !this.crashed && this.state === 'shown' && this.now() - this.shownAt >= STRIKE_RESET_MS) {
            this.log.info(this.tag + ': shown ' + Math.round(STRIKE_RESET_MS / 1000) + ' s - the renderer\'s restarts forgotten');
            this.strikes = 0;
        }
    }
}

module.exports = { LOST_MS, SILENT_MS, silentWait, userNames, newUsers, WRITE_WAIT_MS, writeWait, waitWrites, BuildWatch, BUILD_STUCK_MS, BUILD_BACKOFF, BUILD_MAX_TRIES, StateLog, PAUSE_MS, CrashGuard, CRASH_MS, STRIKE_WAIT_MS, STRIKES_MAX, STRIKE_RESET_MS, LIMIT, asset, image, video, MEM_FULL, APP_NAMES, memoryUsers, memoryNote, FREE_MS, SETTLE_MS, MARGIN, statusBytes, fits, FreeGate, uploads, UploadWatch, UPLOAD_LOG_MS, MemWatch, HIGH, ownBytes };
