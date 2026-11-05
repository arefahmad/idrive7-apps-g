'use strict';
/**
 * logo_stages.js - the built-in Logo example: three original GIFs, Stage 1 / 2 / 3, for Comfort, Sport
 * and Sport+. A small figure and an aura that gets stronger. No artwork from anywhere else. The car
 * scales them up the same way as a GIF sent from the phone (kit/runtime/anim.js). Node 8.
 *
 * Comfort plays Stage 1, Sport plays Stage 2, Sport+ plays Stage 3. To use your own pictures for that
 * idea (a character that changes with the mode), send those GIFs to the three slots yourself.
 */

const W = 64, H = 48, FRAMES = 6, DELAY_CS = 12;
const SLOTS = [
    { slot: 'comfort', name: 'Stage 1', stage: 0 },
    { slot: 'sport', name: 'Stage 2', stage: 1 },
    { slot: 'sportplus', name: 'Stage 3', stage: 2 },
];

/* 16 colours. 0 background, 1 figure, 2 shade, 3 outline, then each stage's aura and its bright. */
const PALETTE = [
    [16, 20, 28], [232, 238, 246], [154, 166, 184], [7, 9, 13],
    [58, 160, 255], [185, 226, 255], [255, 176, 32], [255, 227, 163],
    [255, 59, 48], [255, 255, 255], [197, 208, 220], [0, 0, 0],
    [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0],
];

/* 3x5 glyphs, one row string of '.' and '#', top to bottom. */
const GLYPH = {
    ' ': ['...', '...', '...', '...', '...'],
    '1': ['.#.', '##.', '.#.', '.#.', '###'],
    '2': ['###', '..#', '###', '#..', '###'],
    '3': ['###', '..#', '###', '..#', '###'],
    A: ['.#.', '#.#', '###', '#.#', '#.#'],
    E: ['###', '#..', '##.', '#..', '###'],
    G: ['###', '#..', '#.#', '#.#', '###'],
    S: ['###', '#..', '###', '..#', '###'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
};

function put(px, x, y, c) {
    x = x | 0; y = y | 0;
    if (x >= 0 && x < W && y >= 0 && y < H) px[y * W + x] = c;
}
function disc(px, cx, cy, r, c) {
    if (!(r > 0)) return;
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
            if (dx * dx + dy * dy <= r2) put(px, x, y, c);
        }
    }
}
function ring(px, cx, cy, r, c) {
    if (!(r > 1)) return;
    const r2 = r * r, i2 = (r - 1.35) * (r - 1.35);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
            const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = dx * dx + dy * dy;
            if (d <= r2 && d >= i2) put(px, x, y, c);
        }
    }
}
function text(px, s, x, y, c) {
    for (let i = 0; i < s.length; i++) {
        const g = GLYPH[s.charAt(i)] || GLYPH[' '];
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 3; col++) if (g[row].charAt(col) === '#') put(px, x + i * 4 + col, y + row, c);
        }
    }
}

/** One frame's palette indices (W x H). stage 0..2, frame 0..5. */
function frameIndices(stage, frame) {
    const px = new Uint8Array(W * H);
    const pulse = [0, 1, 2, 3, 2, 1][frame];
    const aura = 4 + stage * 2, bright = aura + 1;
    const cx = 32, cy = 20;
    const base = 9 + stage * 3;
    const rays = (stage + 1) * 6;
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + frame * 0.15;
        const len = base + pulse + (i % 2) * (stage + 1);
        for (let t = 6; t <= len; t++) put(px, cx + Math.cos(a) * t, cy + Math.sin(a) * t, i % 2 ? bright : aura);
    }
    for (let k = stage; k >= 0; k--) ring(px, cx, cy, base + pulse - k * 3, k === 0 ? bright : aura);
    disc(px, cx, cy - 6, 5, 3);
    disc(px, cx, cy - 6, 3.6, stage === 2 && frame % 2 === 0 ? bright : 1);
    disc(px, cx, cy + 4, 6.2, 3);
    disc(px, cx, cy + 4, 4.6, 1);
    disc(px, cx - 2, cy + 2, 1.2, 2);
    const label = 'STAGE ' + (stage + 1);
    text(px, label, Math.round((W - label.length * 4) / 2), 41, 10);
    return px;
}

/**
 * GIF LZW (variable width, clear and end, codes packed least-significant bit first).
 * minCode is the GIF minimum code size (2..11). Returns the compressed bytes, no sub-block lengths.
 */
function lzw(indices, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1;
    const dict = new Map();
    const codes = [];
    const emit = (code) => { codes.push({ code: code, size: size }); };
    const reset = () => { dict.clear(); size = minCode + 1; next = eoi + 1; };
    emit(clear);
    reset();
    if (!indices.length) { emit(eoi); return pack(codes); }
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
        const k = indices[i], key = prefix + ',' + k;
        const got = dict.get(key);
        if (got !== undefined) { prefix = got; continue; }
        emit(prefix);
        if (next < 4096) {
            dict.set(key, next++);
            // gif.js (and the browsers it follows) adds no dictionary code for the first pixel after a
            // clear, so its width grows one code later than an encoder that counts that pixel. Bump when
            // next has passed 2^size, not when it lands on it.
            if (next > (1 << size) && size < 12) size++;
        } else {
            emit(clear);
            reset();
        }
        prefix = k;
    }
    emit(prefix);
    emit(eoi);
    return pack(codes);
}
function pack(codes) {
    let acc = 0, n = 0;
    const bytes = [];
    for (let i = 0; i < codes.length; i++) {
        acc |= (codes[i].code << n);
        n += codes[i].size;
        while (n >= 8) { bytes.push(acc & 255); acc >>>= 8; n -= 8; }
    }
    if (n > 0) bytes.push(acc & 255);
    return Buffer.from(bytes);
}
function subBlocks(bytes) {
    const parts = [];
    for (let o = 0; o < bytes.length; o += 255) {
        const n = Math.min(255, bytes.length - o);
        parts.push(Buffer.from([n]), bytes.slice(o, o + n));
    }
    parts.push(Buffer.from([0]));
    return Buffer.concat(parts);
}

/** indices (one per frame) and a delay in centiseconds -> a GIF89a that loops. */
function encodeGif(frames, delayCs) {
    const packed = 0x80 | (7 << 4) | 3;                 // global table, 16 colours
    const head = Buffer.alloc(13);
    head.write('GIF89a', 0, 6, 'ascii');
    head.writeUInt16LE(W, 6); head.writeUInt16LE(H, 8);
    head[10] = packed; head[11] = 0; head[12] = 0;
    const pal = Buffer.alloc(PALETTE.length * 3);
    PALETTE.forEach((c, i) => { pal[i * 3] = c[0]; pal[i * 3 + 1] = c[1]; pal[i * 3 + 2] = c[2]; });
    const loop = Buffer.from([0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00]);
    const parts = [head, pal, loop];
    frames.forEach((idx) => {
        const gce = Buffer.from([0x21, 0xf9, 0x04, 0x04, delayCs & 255, (delayCs >> 8) & 255, 0x00, 0x00]);
        const desc = Buffer.alloc(10);
        desc[0] = 0x2c; desc.writeUInt16LE(W, 5); desc.writeUInt16LE(H, 7); desc[9] = 0;
        parts.push(gce, desc, Buffer.from([4]), subBlocks(lzw(idx, 4)));
    });
    parts.push(Buffer.from([0x3b]));
    return Buffer.concat(parts);
}

/** [{ slot, name, gif }] the three example GIFs, generated here. */
function stages() {
    return SLOTS.map((s) => {
        const frames = [];
        for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(s.stage, f));
        return { slot: s.slot, name: s.name, gif: encodeGif(frames, DELAY_CS) };
    });
}

module.exports = { stages, frameIndices, encodeGif, W, H, FRAMES, PALETTE, SLOTS };
