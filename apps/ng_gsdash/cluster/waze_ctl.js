'use strict';
/**
 * waze_ctl.js - G's Dash 0.17.0: Waze on cluster's map switched on or off as G's Dash's picks say, through
 * the tool's control socket (robertnisipeanu/idrive-apps, native/waze-on-cluster, src/control.h):
 *   {"cmd":"cluster","on":"0"|"1"}   the map on the cluster        (Waze on cluster 0.9.0 and later)
 *   {"cmd":"hud","on":"0"|"1"}       the map on the HUD
 * Each takes effect at once (no CarPlay restart, the stream keeps being decoded) and is not saved by the
 * tool: its next start goes back to its own choice (the app's Show on).
 *
 *   cluster  Stock picked: off; Waze picked: on; any other pick: Waze's own choice
 *   hud      G's Dash's dials, G's Dash's HUD or G's Music's lyrics own the dials & HUD: off (they share
 *            the HUD's scene); the car's own: Waze's own choice
 * What G's Dash changed is remembered (setting RESTORE_KEY, "cluster:1,hud:0"), and put back as soon as no
 * pick needs it, also after a G's Dash restart.
 *
 * What is there: the render's own status file (STATUS, 0644, written once a second; "cluster" and "hud"
 * since 0.9.0), read without the socket. The socket has one owner (the tool's app while one of its pages
 * is open): a second connection is told "busy" and closed, so G's Dash connects only to send, closes at
 * once, and tries again later when busy. Nothing is sent while the file says it is already so.
 *
 * Never throws, never blocks. Node 8: no ?., ?? or object spread.
 */
const net = require('net');
const fs = require('fs');
const path = require('path');

const SHM = process.env.NG_WOC_SHM || '/dev/shm/waze-on-cluster';
const RUN = process.env.NG_WOC_RUN || '/run/waze-on-cluster';
const SOCK = path.join(SHM, 'ctl.sock');
const STATUS = path.join(RUN, 'status.json');
const RESTORE_KEY = '_wazeRestore';
const STALE_MS = 15000;          // a status file older than this: the render is not running
const SEND_MS = 400;             // the connection kept this long after the commands (the tool reads them)
const RETRY_MS = 5000;           // after a refusal (busy) or a failed connect
const CHECK_MS = 6000;           // after a send: the file should say so by then, else sent again
const FIELDS = ['cluster', 'hud'];

/** "cluster:1,hud:0" <-> { cluster: 1, hud: 0 } (a field absent: null) */
function parseRestore(s) {
    const out = { cluster: null, hud: null };
    String(s || '').split(',').forEach((p) => {
        const m = /^(cluster|hud):([01])$/.exec(p.trim());
        if (m) out[m[1]] = +m[2];
    });
    return out;
}
function formatRestore(r) { return FIELDS.filter((f) => r[f] === 0 || r[f] === 1).map((f) => f + ':' + r[f]).join(','); }

/**
 * The commands that bring the tool's running state (cur: { cluster, hud } 0 / 1) to what the picks want
 * (want: { cluster, hud } 0 / 1 / null) and back (orig: what it had before G's Dash changed it).
 * -> { cmds: [{ cmd, on }], orig } (orig updated: a field remembered when first changed, forgotten once back).
 */
function plan(cur, want, orig) {
    const o = { cluster: orig.cluster, hud: orig.hud }, cmds = [];
    FIELDS.forEach((f) => {
        const c = cur[f], w = want[f];
        if (c !== 0 && c !== 1) return;                          // the tool does not report it (older)
        if (w === 0 || w === 1) {
            if (c !== w) {
                if (o[f] !== 0 && o[f] !== 1) o[f] = c;          // what Waze had, to put back later
                cmds.push({ cmd: f, on: String(w) });
            }
        } else if (o[f] === 0 || o[f] === 1) {
            if (c !== o[f]) cmds.push({ cmd: f, on: String(o[f]) });
            else o[f] = null;                                    // back as it was: forgotten
        }
    });
    return { cmds, orig: o };
}

class WazeCtl {
    /** opts: settings ({ get, set }: RESTORE_KEY), now, sock, status (tests) */
    constructor(log, opts) {
        const o = opts || {};
        this.log = log || { info() {}, warn() {} };
        this.settings = o.settings || null;
        this.now = o.now || Date.now;
        this.sock = o.sock || SOCK;
        this.statusFile = o.status || STATUS;
        this.state = 'none';      // none (not installed / not running), old (no switches: before 0.9.0), ok
        this.cur = { cluster: null, hud: null };
        this.want = { cluster: null, hud: null };
        this.busy = false; this.retryAt = 0; this.sentAt = -1e15; this.sentKey = '';
        this.lastErr = ''; this.lastLine = '';
        this.stats = { sends: 0, busy: 0, errors: 0 };
    }
    _orig() { return parseRestore(this.settings ? this.settings.get(RESTORE_KEY) : ''); }
    _saveOrig(r) {
        const s = formatRestore(r);
        if (this.settings && (this.settings.get(RESTORE_KEY) || '') !== s) { try { this.settings.set(RESTORE_KEY, s); } catch (e) { /* read-only */ } }
    }
    /** The render's status file: { cluster, hud } 0 / 1 / null, or null (not running). */
    _read() {
        let st, txt;
        try { st = fs.statSync(this.statusFile); } catch (e) { return null; }
        if (this.now() - st.mtime.getTime() > STALE_MS || st.size > 16384) return null;
        try { txt = fs.readFileSync(this.statusFile, 'utf8'); } catch (e) { return null; }
        let j;
        try { j = JSON.parse(txt); } catch (e) { return null; }
        if (!j || typeof j !== 'object') return null;
        const bit = (v) => (v === 1 || v === '1' || v === true ? 1 : v === 0 || v === '0' || v === false ? 0 : null);
        return { cluster: bit(j.cluster), hud: bit(j.hud), state: typeof j.state === 'string' ? j.state : '' };
    }

    /**
     * From G's Dash's loop (every second or two): want = { cluster, hud } (0, 1 or null: Waze's own choice),
     * all null while G's Dash is off on the cluster & HUD (everything put back).
     */
    tick(want) {
        this.want = { cluster: want && (want.cluster === 0 || want.cluster === 1) ? want.cluster : null,
            hud: want && (want.hud === 0 || want.hud === 1) ? want.hud : null };
        const s = this._read();
        if (!s) { this.state = 'none'; this.cur = { cluster: null, hud: null }; return; }
        this.cur = { cluster: s.cluster, hud: s.hud };
        this.state = s.cluster === null && s.hud === null ? 'old' : 'ok';
        if (this.state !== 'ok') return;
        const p = plan(this.cur, this.want, this._orig());
        this._saveOrig(p.orig);
        if (!p.cmds.length) { this.sentKey = ''; return; }
        const now = this.now(), key = JSON.stringify(p.cmds);
        if (this.sock_ || now < this.retryAt) return;
        if (key === this.sentKey && now - this.sentAt < CHECK_MS) return;   // sent: the file will say so
        this._send(p.cmds, key);
    }
    _send(cmds, key) {
        const now = this.now();
        this.sentAt = now; this.sentKey = key; this.busy = false;
        const line = cmds.map((c) => c.cmd + ' ' + (c.on === '1' ? 'on' : 'off')).join(', ');
        if (line !== this.lastLine) { this.lastLine = line; this.log.info('waze ctl: ' + line + ' (G\'s Dash\'s picks)'); }
        let s, buf = '', done = false;
        const end = (err) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { s.destroy(); } catch (e) { /* gone */ }
            this.sock_ = null;
            if (err) {
                this.retryAt = this.now() + RETRY_MS; this.sentKey = '';
                if (err !== this.lastErr) { this.lastErr = err; this.log.info('waze ctl: ' + err + ' - trying again in ' + (RETRY_MS / 1000) + ' s'); }
            } else this.lastErr = '';
        };
        const timer = setTimeout(() => end(''), SEND_MS + 1000);
        try {
            s = this.sock_ = net.connect(this.sock);
        } catch (e) { this.stats.errors++; this.sock_ = null; end('cannot connect (' + e.message + ')'); return; }
        s.setEncoding('utf8');
        s.on('connect', () => {
            try { cmds.forEach((c) => s.write(JSON.stringify({ cmd: c.cmd, on: c.on }) + '\n')); this.stats.sends++; } catch (e) { end('send failed'); return; }
            setTimeout(() => end(''), SEND_MS);
        });
        s.on('data', (d) => {
            buf += d;
            if (buf.length > 65536) buf = buf.slice(-4096);
            // the tool's answer to a second connection: busy (its app's page is open)
            if (/"reason"\s*:\s*"busy"/.test(buf)) { this.busy = true; this.stats.busy++; end('busy (Waze on cluster\'s page is open)'); }
        });
        s.on('error', (e) => { this.stats.errors++; end('not reachable (' + (e.code || e.message) + ')'); });
        s.on('close', () => end(''));
    }
    close() { if (this.sock_) { try { this.sock_.destroy(); } catch (e) { /* gone */ } this.sock_ = null; } }

    /**
     * For the Cluster & HUD page: whether the picks can switch Waze's map: { can, text }. can false: the
     * tool is not running, or older than 0.9.0 (the page says so where it matters).
     */
    view() {
        if (this.state === 'none') return { can: false, text: 'Waze on cluster not running' };
        if (this.state === 'old') return { can: false, text: 'Update Waze on cluster (0.9.0) to let the picks switch its map' };
        if (this.busy) return { can: true, text: "Waiting - Waze on cluster's page is open" };
        return { can: true, text: '' };
    }
}

module.exports = { WazeCtl, plan, parseRestore, formatRestore, RESTORE_KEY, PATHS: { SOCK, STATUS } };
