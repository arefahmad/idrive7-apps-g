'use strict';
/**
 * diag.js - the drive mode diagnostics page's second half: what the head unit's own SOME/IP catalog
 * (/etc/oap/someip/someip-interfaces.json, the file the installer generates every app's interfaces
 * from) says about the drive mode, and (0.10.0) its fields named like a time or date. Read-only, read once when the page is opened, only the lines it
 * shows are kept. Definitions from the catalog, never live values (those come from car.js).
 * Node 8: no ?., no ??, no object spread.
 */
const fs = require('fs');

const CATALOG = '/etc/oap/someip/someip-interfaces.json';
const MAX_BYTES = 48 * 1024 * 1024;     // a bigger file is not parsed (the head unit's memory)
const FES = 'de.bmw.infotainment.drivingexcitement.FES';
const FIELDS = ['statusFESVehicleDynamicSwitchHMI'];        // the drive mode G's Dash reads (car.js MODE_FIELD)
const MODEISH = /mode|modus|sport|eco|comfort|komfort|individual|adaptive|dynamic|experience|fes/i;
const VALUEISH = /sport|eco|comfort|komfort|individual|adaptive|race|track/i;

let state = null;     // { status: 'reading' | 'ok' | 'error', error, lines: [[kind, text]] }

/** A datatype as one short line (enum items, struct members), as kit/tools/sigdoc.py prints it. */
function typeText(db, ref, depth) {
    const d = db.datatypes && db.datatypes[ref];
    if (!d) return String(ref);
    if (d.type === 'enum') {
        const items = Object.keys(d.items || {});
        return 'enum(' + items.slice(0, 16).map((k) => k + '=' + d.items[k]).join(', ') + (items.length > 16 ? ', ..' : '') + ')';
    }
    if (d.type === 'typedef') return typeText(db, d.dataRef || d.baseType, depth);
    if (d.type === 'array') return '[' + typeText(db, d.elementDataRef, (depth || 0) + 1) + ']';
    if (d.type === 'struct') return depth > 1 ? 'struct' : '{' + structMembers(db, d).map((m) => m.name).join(', ') + '}';
    return d.type;
}
function structMembers(db, d) {
    let mem = [], dd = d, guard = 0;
    while (dd && guard++ < 8) {
        mem = (dd.members || []).concat(mem);
        dd = dd.extends ? db.datatypes[dd.extends] : null;
    }
    return mem;
}

function extract(db) {
    const lines = [];
    const i = db.interfaces && db.interfaces[FES];
    if (!i) { lines.push(['warn', FES + ': not in the catalog']); return lines; }
    const fields = i.fields || {};
    FIELDS.forEach((f) => {
        const fd = fields[f];
        if (!fd) { lines.push(['head', f + ': not in the catalog']); return; }
        lines.push(['head', f + (fd.getter ? '  get' : '') + (fd.notifier ? '  notify' : '')]);
        const d = db.datatypes && db.datatypes[fd.dataRef];
        if (d && d.type === 'struct') structMembers(db, d).forEach((m) => lines.push(['row', '  ' + m.name + ': ' + typeText(db, m.dataRef, 1)]));
        else lines.push(['row', '  ' + typeText(db, fd.dataRef, 0)]);
    });
    // other FES fields named like a mode, with an enum that has mode-like values
    const other = Object.keys(fields).filter((f) => FIELDS.indexOf(f) < 0 && MODEISH.test(f));
    if (other.length) lines.push(['head', 'Other FES fields named like a mode (not subscribed):']);
    other.slice(0, 24).forEach((f) => lines.push(['row', '  ' + f]));
    // enums anywhere with drive-mode-like value names
    const enums = Object.keys(db.datatypes || {}).filter((k) => {
        const d = db.datatypes[k];
        return d && d.type === 'enum' && MODEISH.test(k) && Object.keys(d.items || {}).some((n) => VALUEISH.test(n));
    });
    if (enums.length) lines.push(['head', 'Mode-like enums in the catalog (' + enums.length + '):']);
    enums.slice(0, 20).forEach((k) => lines.push(['row', '  ' + k + ' ' + typeText(db, k, 0)]));
    // 0.10.0: fields named like a time of day or a date (a car clock for Showcase: clock.js), interface.field
    const clk = clockFields(db);
    lines.push(['head', clk.length ? 'Time / date fields in the catalog (' + clk.length + '):' : 'Time / date fields in the catalog: none']);
    clk.slice(0, 16).forEach((f) => lines.push(['row', '  ' + f]));
    return lines;
}

const CLOCKISH = /time|date|clock|uhrzeit|datum/i, NOT_CLOCK = /timeout|update|validat|timer|lifetime|runtime/i;
/** Every interface field named like a time of day or a date: 'Iface (short).field', sorted. */
function clockFields(db) {
    const out = [];
    Object.keys(db.interfaces || {}).forEach((iface) => {
        const fields = (db.interfaces[iface] && db.interfaces[iface].fields) || {};
        Object.keys(fields).forEach((f) => { if (CLOCKISH.test(f) && !NOT_CLOCK.test(f)) out.push(iface.split('.').slice(-2).join('.') + '.' + f); });
    });
    return out.sort();
}

/**
 * 0.13.8: the catalog (4.85 MB on the car) parsed in slices instead of one JSON.parse on the main thread (that held
 * the event loop, the HUD and the dials for a few hundred ms on the head unit). Read in 64 KB chunks, parsed by a
 * resumable parser that gives what JSON.parse gives (strings and numbers through JSON.parse / Number themselves),
 * at most SLICE_MS of work per turn of the event loop. The lines kept by size + mtime: opening the page again does
 * not parse again.
 */
const CHUNK = 64 * 1024, SLICE_MS = 8;
// the clock looked at every 256 tokens
const WS = { ' ': 1, '\t': 1, '\n': 1, '\r': 1 };
const NUM_CH = { '-': 1, '+': 1, '.': 1, e: 1, E: 1, 0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 };
const NUM_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

function Parser(keep, keepDepth) {
    this.buf = ''; this.i = 0; this.base = 0; this.stack = []; this.mode = 'value'; this.root = undefined; this.done = false; this.ended = false;
    this.keep = keep || null; this.keepDepth = keepDepth || 3;
}
/** a value about to start: false when keep() leaves it out (parsed, never built: less memory, less GC) */
Parser.prototype.skipNext = function () {
    const top = this.stack[this.stack.length - 1];
    if (!top) return false;
    if (top.skip) return true;
    if (!this.keep || top.arr || this.stack.length > this.keepDepth) return false;
    return !this.keep(this.stack.map((f) => f.key));
};
Parser.prototype.feed = function (s) { this.buf = this.buf.slice(this.i) + s; this.base += this.i; this.i = 0; };
Parser.prototype.end = function () { this.ended = true; };
Parser.prototype.fail = function (why) { throw new SyntaxError(why + ' at position ' + (this.base + this.i)); };
Parser.prototype.put = function (v, skip) {
    const top = this.stack[this.stack.length - 1];
    if (skip || (top && top.skip)) { this.mode = 'after'; return; }
    if (!top) { this.root = v; this.mode = 'end'; return; }
    if (top.arr) top.v.push(v);
    else if (top.key === '__proto__') Object.defineProperty(top.v, '__proto__', { value: v, writable: true, enumerable: true, configurable: true });
    else top.v[top.key] = v;
    this.mode = 'after';
};
/** the string at i (the quote), or undefined when it runs past the buffer */
Parser.prototype.str = function () {
    const b = this.buf;
    let j = this.i;
    for (;;) {
        j = b.indexOf('"', j + 1);
        if (j < 0) { if (this.ended) this.fail('unterminated string'); return undefined; }
        let k = j - 1, n = 0;
        while (b.charCodeAt(k) === 92) { n++; k--; }
        if (!(n & 1)) break;
    }
    const raw = b.slice(this.i, j + 1);
    this.i = j + 1;
    return raw.indexOf('\\') < 0 && !/[\u0000-\u001f]/.test(raw) ? raw.slice(1, -1) : JSON.parse(raw);
};
/** some work, until the buffer runs out (false) or the deadline (true: more to do) */
Parser.prototype.run = function (deadline) {
    const b = this.buf;
    let n = 0;
    while (this.i < b.length) {
        if ((++n & 255) === 0 && Date.now() >= deadline) return true;
        const c = b[this.i];
        if (WS[c]) { this.i++; continue; }
        const m = this.mode;
        if (m === 'end') this.fail('unexpected ' + JSON.stringify(c) + ' after the end');
        if (m === 'after') {
            const top = this.stack[this.stack.length - 1];
            if (c === ',') { this.i++; this.mode = top.arr ? 'value' : 'key'; continue; }
            if (c === (top.arr ? ']' : '}')) { this.i++; this.stack.pop(); this.put(top.v, top.skip); continue; }
            this.fail('unexpected ' + JSON.stringify(c));
        }
        if (m === 'colon') { if (c !== ':') this.fail('expected :'); this.i++; this.mode = 'value'; continue; }
        if (m === 'keyOrEnd' || m === 'key') {
            if (c === '}' && m === 'keyOrEnd') { this.i++; const top = this.stack.pop(); this.put(top.v, top.skip); continue; }
            if (c !== '"') this.fail('expected a key');
            const k = this.str();
            if (k === undefined) return false;
            this.stack[this.stack.length - 1].key = k; this.mode = 'colon'; continue;
        }
        // a value ('value' or 'valueOrEnd')
        if (c === ']' && m === 'valueOrEnd') { this.i++; const top = this.stack.pop(); this.put(top.v, top.skip); continue; }
        if (c === '{') { this.i++; const sk = this.skipNext(); this.stack.push({ v: sk ? null : {}, arr: false, key: null, skip: sk }); this.mode = 'keyOrEnd'; continue; }
        if (c === '[') { this.i++; const sk = this.skipNext(); this.stack.push({ v: sk ? null : [], arr: true, skip: sk }); this.mode = 'valueOrEnd'; continue; }
        if (c === '"') { const v = this.str(); if (v === undefined) return false; this.put(v, this.skipNext()); continue; }
        if (c === '-' || (c >= '0' && c <= '9')) {
            let j = this.i + 1;
            while (j < b.length && NUM_CH[b[j]]) j++;
            if (j >= b.length && !this.ended) return false;     // may go on in the next chunk
            NUM_RE.lastIndex = this.i;
            const mm = NUM_RE.exec(b);
            if (!mm || mm[0].length !== j - this.i) this.fail('bad number');
            this.i = j; this.put(Number(mm[0]), this.skipNext()); continue;
        }
        const lit = c === 't' ? 'true' : c === 'f' ? 'false' : c === 'n' ? 'null' : '';
        if (!lit) this.fail('unexpected ' + JSON.stringify(c));
        if (this.i + lit.length > b.length) { if (this.ended) this.fail('bad literal'); return false; }
        if (b.substr(this.i, lit.length) !== lit) this.fail('bad literal');
        this.i += lit.length; this.put(lit === 'true' ? true : lit === 'false' ? false : null, this.skipNext());
    }
    if (this.ended) {
        if (this.mode !== 'end') this.fail('unexpected end');
        this.done = true;
    }
    return false;
};

/**
 * A JSON file parsed in slices (never more than about sliceMs at a time); cb(err, value).
 * o: { chunk, sliceMs, onSlice(ms) (tests) }. Returns { cancel }.
 */
function parseFileSliced(file, o, cb) {
    o = o || {};
    const chunk = o.chunk || CHUNK, slice = o.sliceMs || SLICE_MS;
    const p = new Parser(o.keep, o.keepDepth), dec = new (require('string_decoder').StringDecoder)('utf8'), buf = Buffer.alloc(chunk);
    let fd = null, pos = 0, stopped = false;
    const finish = (err, v) => { if (stopped) return; stopped = true; if (fd !== null) fs.close(fd, () => {}); cb(err, v); };
    const work = () => {
        if (stopped) return;
        const t0 = Date.now();
        let more;
        try { more = p.run(t0 + slice); } catch (e) { finish(e); return; }
        if (o.onSlice) o.onSlice(Date.now() - t0);
        if (more) { setImmediate(work); return; }
        if (p.done) { finish(null, p.root); return; }
        if (p.ended) { finish(new SyntaxError('unexpected end')); return; }
        read();
    };
    const read = () => {
        fs.read(fd, buf, 0, chunk, pos, (e, n) => {
            if (stopped) return;
            if (e) { finish(e); return; }
            pos += n;
            const t0 = Date.now();
            if (n > 0) p.feed(dec.write(buf.slice(0, n)));
            else { p.feed(dec.end()); p.end(); }
            if (o.onSlice) o.onSlice(Date.now() - t0);
            setImmediate(work);
        });
    };
    fs.open(file, 'r', (e, f) => { if (e) { finish(e); return; } fd = f; read(); });
    return { cancel: () => { stopped = true; if (fd !== null) fs.close(fd, () => {}); } };
}

/** what extract() reads: datatypes, and per interface its fields (methods, events, instance ids left out) */
const KEEP = (p) => (p.length === 1 ? p[0] === 'interfaces' || p[0] === 'datatypes' : p.length === 3 && p[0] === 'interfaces' ? p[2] === 'fields' : true);
let file = CATALOG, kept = null;     // kept: { key: size + mtime, lines, bytes }
/** Start reading the catalog (once); returns the current state. */
function catalog(log) {
    if (state) return state;
    state = { status: 'reading', error: '', lines: [] };
    const mine = state;
    const set = (s) => { if (state === mine) state = s; };
    fs.stat(file, (err, st) => {
        if (err) { set({ status: 'error', error: err.code || err.message, lines: [] }); return; }
        if (st.size > MAX_BYTES) { set({ status: 'error', error: 'too big to read here (' + Math.round(st.size / 1048576) + ' MB)', lines: [] }); return; }
        const key = st.size + ':' + st.mtime.getTime();
        if (kept && kept.key === key) { set({ status: 'ok', error: '', lines: kept.lines, bytes: kept.bytes }); return; }
        const t0 = Date.now();
        parseFileSliced(file, { keep: KEEP }, (e, db) => {
            if (e) { set({ status: 'error', error: e instanceof SyntaxError ? 'not readable as JSON (' + e.message + ')' : e.code || e.message, lines: [] }); return; }
            let lines;
            try { lines = extract(db); } catch (x) { set({ status: 'error', error: 'not readable (' + x.message + ')', lines: [] }); return; }
            db = null;
            kept = { key, lines, bytes: st.size };
            set({ status: 'ok', error: '', lines, bytes: st.size });
            if (log) log.info('diagnostics: catalog read, ' + lines.length + ' lines, ' + Math.round(st.size / 1024) + ' KB in ' + (Date.now() - t0) + ' ms (in slices)');
        });
    });
    return state;
}
/** Read it again next time (the page's Reload). */
function reset() { if (state && state.status !== 'reading') state = null; }

module.exports = { catalog, reset, CATALOG, extract, clockFields, parseFileSliced, Parser, KEEP, _file: (f) => { file = f || CATALOG; kept = null; state = null; } };
