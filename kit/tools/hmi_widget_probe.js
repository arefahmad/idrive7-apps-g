#!/usr/bin/env node
/*
 * hmi_widget_probe.js - what a home-screen widget template is made of, read from the unit. Read-only.
 *
 *   node hmi_widget_probe.js [--template LT_Table_OnlineApps_DriveRecorderWidget]
 *                            [--hmi /usr/bin/HmiMain3D] [--widgets /mnt/dataro/data/hmi/bmw/widget] > probe.txt
 *
 * Run on the head unit (Node 8, as root: it reads HmiMain3D whole, as mgu-render's hmi_template.js does at
 * install; `nice -n 19` is kind). It writes nothing, mounts nothing and touches no running process.
 *
 * Why: G's Dash's widget uses BMW's Drive Recorder layout, which draws a dark edge (vignette) over the
 * picture. HmiMain3D builds its widgets from the *.pbw files (protobuf) in its widget folder, every name an
 * index into an identifier table compiled into the binary (mgu-render's hmi_template.js, whose identifier
 * reader is used below, defines a page template the same way). Taking the vignette out means a changed copy
 * of that layout's definition in the widget folder mgu-render mounts; this prints the definition so the
 * child that draws the vignette, and how it is switched, can be found (docs/animated-widget.md).
 *
 * Prints: the file that defines the template; its child widgets (name, type, and each parameter: set to a
 * value, or bound to one of the template's own parameters - the cells an app writes are among those); the
 * whole definition as a tree with identifiers named; and the widget-type names this HmiMain3D knows that no
 * file defines (a template can only use a name from the binary's table). Exit status 1 when the template is
 * not found, 2 for usage, 3 for anything else.
 *
 * identifiers() is mgu-render's (kit/renderd/js/hmi_template.js, cauliflowermossgrape/idrive7-apps, MIT).
 * Node 8: no ?., ??, object spread.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* Identifier name -> number from HmiMain3D's table of pointers to names (mgu-render's hmi_template.js). */
function identifiers(data) {
    const u64 = (off) => data.readUInt32LE(off) + data.readUInt32LE(off + 4) * 0x100000000;
    const phoff = u64(0x20);
    const phentsize = data.readUInt16LE(0x36);
    const phnum = data.readUInt16LE(0x38);
    const loads = [];
    for (let i = 0; i < phnum; i++) {
        const h = phoff + i * phentsize;
        if (data.readUInt32LE(h) === 1) loads.push({ off: u64(h + 8), vaddr: u64(h + 16), size: u64(h + 32) });
    }
    const toOff = (va) => { const l = loads.find((s) => va >= s.vaddr && va < s.vaddr + s.size); return l ? va - l.vaddr + l.off : -1; };
    const toVaddr = (off) => { const l = loads.find((s) => off >= s.off && off < s.off + s.size); return l ? off - l.off + l.vaddr : -1; };
    const nameAt = (ptrOff) => {
        if (ptrOff < 0 || ptrOff + 8 > data.length) return null;
        const off = toOff(u64(ptrOff));
        if (off < 0) return null;
        const end = data.indexOf(0, off);
        if (end <= off || end - off > 1024 || data.toString('latin1', off, off + 6) !== 'eGfxId') return null;
        return data.toString('latin1', off, end);
    };
    const table = (entry) => {
        let start = entry;
        while (nameAt(start - 8)) start -= 8;
        const ids = new Map();
        for (let off = start, name; (name = nameAt(off)); off += 8) { if (!ids.has(name)) ids.set(name, (off - start) / 8 + 1); }
        return ids;
    };
    // the names are pointed to from several tables; the identifier table is the long run of consecutive pointers
    const anchor = data.indexOf('\0eGfxIdWidgetType_eWidgetType_EmbeddedSurface\0', 0, 'latin1') + 1;
    let best = new Map();
    if (anchor > 0) {
        const va = toVaddr(anchor), ptr = Buffer.alloc(8);
        ptr.writeUInt32LE(va % 0x100000000, 0); ptr.writeUInt32LE(Math.floor(va / 0x100000000), 4);
        for (let e = data.indexOf(ptr); e >= 0; e = data.indexOf(ptr, e + 1)) { const ids = table(e); if (ids.size > best.size) best = ids; }
    }
    if (best.size < 1000) throw Object.assign(new Error('no identifier table in HmiMain3D'), { code: 'HMI' });
    return best;
}

/* ---------- protobuf, read without a schema ---------- */
function varint(b, o) {
    let n = 0, mul = 1, i = o;
    for (;;) {
        if (i >= b.length || i - o > 9) return null;
        const c = b[i++];
        n += (c & 0x7f) * mul; mul *= 128;
        if (!(c & 0x80)) return { n, end: i };
    }
}
/** The fields of b (a message), or null if b does not read as one to its last byte. */
function fields(b) {
    const out = [];
    let o = 0;
    while (o < b.length) {
        const k = varint(b, o);
        if (!k || k.n < 8) return null;
        const f = Math.floor(k.n / 8), wt = k.n % 8;
        o = k.end;
        if (wt === 0) { const v = varint(b, o); if (!v) return null; out.push({ f, wt, v: v.n }); o = v.end; }
        else if (wt === 1) { if (o + 8 > b.length) return null; out.push({ f, wt, raw: b.slice(o, o + 8) }); o += 8; }
        else if (wt === 5) { if (o + 4 > b.length) return null; out.push({ f, wt, raw: b.slice(o, o + 4) }); o += 4; }
        else if (wt === 2) {
            const l = varint(b, o);
            if (!l || l.end + l.n > b.length) return null;
            out.push({ f, wt, raw: b.slice(l.end, l.end + l.n) }); o = l.end + l.n;
        } else return null;
    }
    return out;
}
const printable = (b) => b.length > 0 && b.length <= 200 && Array.prototype.every.call(b, (c) => c >= 0x20 && c < 0x7f);

class Namer {
    constructor(ids) { this.byNum = new Map(); ids.forEach((n, name) => { if (!this.byNum.has(n)) this.byNum.set(n, name); }); this.ids = ids; }
    name(n) { return this.byNum.get(n) || null; }
    /** An identifier reference ({1: n}, as hmi_template.js writes them): its name, else null. */
    ref(b) {
        const fs2 = fields(b);
        return fs2 && fs2.length === 1 && fs2[0].f === 1 && fs2[0].wt === 0 ? this.name(fs2[0].v) : null;
    }
    short(name) { return name ? name.replace(/^eGfxId/, '') : '?'; }
}

/** The tree of message b, one line a field, identifiers named. */
function tree(b, nm, indent, out, depth) {
    const fs2 = fields(b);
    if (!fs2) { out.push(indent + '(not a message: ' + b.length + ' bytes)'); return; }
    fs2.forEach((x) => {
        const p = indent + x.f + ': ';
        if (x.wt === 0) { const nmx = nm.name(x.v); out.push(p + x.v + (nmx && x.v > 8 ? '   (#' + nm.short(nmx) + '?)' : '')); return; }
        if (x.wt === 5) { out.push(p + 'f32 ' + +x.raw.readFloatLE(0).toFixed(4) + ' / u32 ' + x.raw.readUInt32LE(0)); return; }
        if (x.wt === 1) { out.push(p + 'f64 ' + x.raw.readDoubleLE(0)); return; }
        const r = nm.ref(x.raw);
        if (r) { out.push(p + '@' + nm.short(r)); return; }
        const sub = fields(x.raw);
        if (sub && sub.length && !(printable(x.raw) && x.raw.length > 3) && depth < 40) {
            out.push(p + '{');
            tree(x.raw, nm, indent + '  ', out, depth + 1);
            out.push(indent + '}');
        } else if (printable(x.raw)) out.push(p + JSON.stringify(x.raw.toString('latin1')));
        else out.push(p + 'bytes ' + x.raw.toString('hex').slice(0, 96) + (x.raw.length > 48 ? '... (' + x.raw.length + ')' : ''));
    });
}

/** Every widget definition in a .pbw file: [{ name, raw }] (top-level field 1, its own field 1 the template's name). */
function definitions(buf, nm) {
    const top = fields(buf);
    if (!top) return [];
    return top.filter((x) => x.f === 1 && x.wt === 2).map((x) => {
        const fs2 = fields(x.raw), head = fs2 && fs2.find((y) => y.f === 1 && y.wt === 2);
        return { name: head ? nm.ref(head.raw) : null, raw: x.raw };
    }).filter((d) => d.name);
}

/**
 * A definition's child widgets (its field-3 entries, as hmi_template.js writes them: 1 name, 2 type, 3 the
 * parameters): [{ name, type, params: [{ param, bound | value }] }].
 */
function children(raw, nm) {
    return (fields(raw) || []).filter((x) => x.f === 3 && x.wt === 2).map((x) => {
        const c = fields(x.raw) || [];
        const one = (f) => { const y = c.find((z) => z.f === f && z.wt === 2); return y ? nm.ref(y.raw) : null; };
        const params = c.filter((z) => z.f === 3 && z.wt === 2).map((z) => {
            const pf = fields(z.raw) || [], pn = pf.find((q) => q.f === 1 && q.wt === 2), pv = pf.find((q) => q.f === 2 && q.wt === 2);
            const param = pn ? nm.ref(pn.raw) : null;
            if (!pv) return { param };
            const vf = fields(pv.raw) || [], src = vf.find((q) => q.f === 1 && q.wt === 2);
            const bound = src ? nm.ref(src.raw) : null;
            if (bound) return { param, bound };
            const lines = [];
            tree(pv.raw, nm, '', lines, 0);
            return { param, value: lines.join(' ').replace(/\s+/g, ' ').slice(0, 160) };
        });
        return { name: one(1), type: one(2), params };
    });
}

function pbwFiles(dir) {
    const out = [];
    const walk = (d, depth) => {
        let list = [];
        try { list = fs.readdirSync(d); } catch (e) { return; }
        list.forEach((f) => {
            const p = path.join(d, f);
            let st;
            try { st = fs.statSync(p); } catch (e) { return; }
            if (st.isDirectory() && depth < 4) walk(p, depth + 1);
            else if (st.isFile() && /\.pbw$/i.test(f)) out.push(p);
        });
    };
    walk(dir, 0);
    return out.sort();
}

function probe(opt) {
    const lines = [], say = (s) => lines.push(s === undefined ? '' : s);
    const ids = identifiers(fs.readFileSync(opt.hmi));
    const nm = new Namer(ids);
    const want = 'eGfxIdWidgetType_' + opt.template.replace(/^eGfxIdWidgetType_/, '');
    const files = pbwFiles(opt.widgets), defined = new Map();
    let found = null;
    files.forEach((f) => {
        let buf;
        try { buf = fs.readFileSync(f); } catch (e) { return; }
        definitions(buf, nm).forEach((d) => {
            if (!defined.has(d.name)) defined.set(d.name, f);
            if (d.name === want && !found) found = { file: f, raw: d.raw };
        });
    });
    say('hmi_widget_probe: ' + opt.hmi + ' (' + ids.size + ' identifiers), ' + files.length + ' widget files in ' + opt.widgets + ', ' + defined.size + ' definitions');
    say('template ' + want + ' (#' + (ids.has(want) ? ids.get(want) : 'not in this HmiMain3D') + '): ' + (found ? found.file + ', ' + found.raw.length + ' bytes' : 'no file defines it'));
    if (found) {
        say(); say('== children (name  type  params: param = value | <- bound to the template\'s own parameter)');
        children(found.raw, nm).forEach((c) => {
            say('- ' + nm.short(c.name) + '   ' + nm.short(c.type));
            c.params.forEach((p) => say('    ' + nm.short(p.param) + (p.bound ? '  <- ' + nm.short(p.bound) : p.value !== undefined ? '  = ' + p.value : '')));
        });
        const hint = [];
        tree(found.raw, nm, '', hint, 0);
        const marks = hint.filter((l) => /ignette|hadow|radient|Fade|Mask|Darken|Overlay|Scrim|background/i.test(l));
        if (marks.length) { say(); say('== lines naming a vignette, shadow, gradient, fade, mask, overlay or background'); marks.forEach((l) => say('  ' + l.trim())); }
        say(); say('== the whole definition');
        hint.forEach((l) => say(l));
    }
    say(); say('== widget-type names in this HmiMain3D that no widget file defines (a new template can only take one of these)');
    const free = [];
    ids.forEach((n, name) => { if (/^eGfxIdWidgetType_LT_/.test(name) && !defined.has(name)) free.push(name); });
    free.sort().forEach((name) => say('  ' + nm.short(name)));
    say(); say('== other start-widget layouts that files define (OnlineApps / Widget in the name)');
    Array.from(defined.keys()).filter((name) => /OnlineApps|Widget$/.test(name) && /^eGfxIdWidgetType_LT_/.test(name)).sort()
        .forEach((name) => say('  ' + nm.short(name) + '   ' + path.basename(defined.get(name))));
    return { text: lines.join('\n') + '\n', found: !!found };
}

if (require.main === module) {
    const opt = { hmi: '/usr/bin/HmiMain3D', widgets: '/mnt/dataro/data/hmi/bmw/widget', template: 'LT_Table_OnlineApps_DriveRecorderWidget' };
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
        const k = args[i].replace(/^--/, '');
        if (!(k in opt) || i + 1 >= args.length) { console.error('usage: node hmi_widget_probe.js [--template NAME] [--hmi FILE] [--widgets DIR]'); process.exit(2); }
        opt[k] = args[i + 1];
    }
    let r;
    try { r = probe(opt); } catch (e) { console.error('hmi_widget_probe: ' + (e && e.message || e)); process.exit(3); }
    process.stdout.write(r.text);
    process.exit(r.found ? 0 : 1);
}

module.exports = { identifiers, fields, definitions, children, probe, Namer };
