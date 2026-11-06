/*
 * Logo: send an animated GIF from the phone to G's Dash (the home-screen widget, the cluster, and a
 * driving-mode slot when the car's Logo page was on one). Static, no secrets. The
 * car's side is kit/runtime/gif_drop.js (it says the whole exchange); this page:
 *
 *   <this page>#v=1&s=<topic>.<key>&a=<app name>&w=<px>&h=<px>   from the car's QR code
 *   <this page>                                                  typed by hand: asks for the car's 6-digit code,
 *                                                                topic + key = PBKDF2-SHA256(code, "ng_widget/code/1", 100000)
 * Sends iv | AES-256-GCM(key, gif) (additional data "ng_widget/1/gif") to https://ntfy.sh/<topic> as an
 * attachment, then AES-256-GCM(key, {t:'gif', s:<topic>, url, size, sha256, fit, name}) (additional data
 * "ng_widget/1") as a message, and waits for the car's encrypted {t:'got'} and {t:'done', ok}.
 * The car checks everything again; this page's checks only save a wasted trip.
 */
(function () {
  'use strict';
  var MAILBOX = 'https://ntfy.sh';        // keep in step with connect-src in index.html
  var AAD = new TextEncoder().encode('ng_widget/1');
  var AAD_FILE = new TextEncoder().encode('ng_widget/1/gif');
  var CODE_SALT = 'ng_widget/code/1', CODE_ROUNDS = 100000;
  var MAX_GIF = 8 * 1024 * 1024;          // as the car (gif_drop.js MAX_GIF)
  var WAIT_MS = 10 * 60 * 1000;

  function $(id) { return document.getElementById(id); }
  function show(id) { ['code', 'form', 'busy', 'done', 'fail'].forEach(function (s) { $(s).hidden = s !== id; }); }
  function failWith(text) { $('fail-text').textContent = text; show('fail'); }
  function err(id, text) { $(id).textContent = text; $(id).hidden = !text; }
  function busy(title, text) { $('busy-title').textContent = title; $('busy-text').textContent = text; show('busy'); }
  function b64u(bytes) {
    var s = ''; bytes = new Uint8Array(bytes);
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64u(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var b = atob(s), out = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
    return out;
  }
  function parseState(state) {
    var p = String(state || '').split('.');
    if (p.length !== 2 || !/^[A-Za-z0-9_-]{16,64}$/.test(p[0])) return null;
    var key;
    try { key = fromB64u(p[1]); } catch (e) { return null; }
    return key.length === 32 ? { topic: p[0], key: key } : null;
  }
  function fromCode(code) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(CODE_SALT), iterations: CODE_ROUNDS }, k, 48 * 8);
    }).then(function (bits) {
      var b = new Uint8Array(bits);
      return { topic: 'ngwc_' + b64u(b.slice(0, 16)), key: b.slice(16, 48) };
    });
  }
  function cleanName(s) {
    return String(s || '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
  }

  function importKey(raw) { return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  /** iv | ciphertext+tag, as one Uint8Array */
  function encrypt(raw, aad, data) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return importKey(raw).then(function (k) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad, tagLength: 128 }, k, data);
    }).then(function (ct) {
      var all = new Uint8Array(12 + ct.byteLength);
      all.set(iv, 0); all.set(new Uint8Array(ct), 12);
      return all;
    });
  }
  function seal(raw, obj) { return encrypt(raw, AAD, new TextEncoder().encode(JSON.stringify(obj))).then(b64u); }
  /** rejects (never throws) on a message that is not ours, e.g. ntfy's plain-text note for an attachment */
  function unseal(raw, text) {
    var b;
    return Promise.resolve().then(function () {
      b = fromB64u(String(text).trim());
      return importKey(raw);
    }).then(function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), additionalData: AAD, tagLength: 128 }, k, b.slice(12));
    }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function mailboxError(r) {
    if (r.status === 413) return new Error('the mailbox refused a file that big');
    if (r.status === 429) return new Error('the mailbox is busy, try again in a minute');
    return new Error('mailbox: HTTP ' + r.status);
  }
  function retry(fn) {
    var tries = 0;
    function attempt() {
      return fn().catch(function (e) {
        if (++tries >= 3 || /refused|busy/.test(e.message)) throw e;
        return sleep(1500 * tries).then(attempt);
      });
    }
    return attempt();
  }
  /** the sealed GIF as an ntfy attachment: resolves its download link */
  function upload(topic, bytes) {
    return fetch(MAILBOX + '/' + topic, { method: 'PUT', body: new Blob([bytes], { type: 'application/octet-stream' }), headers: { Filename: 'widget.bin' },
      cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw mailboxError(r); return r.json(); })
      .then(function (m) {
        var a = m && m.attachment;
        if (!a || typeof a.url !== 'string' || a.url.indexOf(MAILBOX + '/file/') !== 0) throw new Error('the mailbox did not keep the file');
        return a.url;
      });
  }
  function post(topic, body) {
    return fetch(MAILBOX + '/' + topic, { method: 'POST', body: body, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw mailboxError(r); return r.json(); });
  }
  function poll(topic, since) {
    return fetch(MAILBOX + '/' + topic + '/json?poll=1&since=' + encodeURIComponent(since), { cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw mailboxError(r); return r.text(); })
      .then(function (t) {
        return t.split('\n').map(function (l) { try { return JSON.parse(l); } catch (e) { return null; } })
          .filter(function (m) { return m && m.event === 'message' && typeof m.message === 'string' && !m.attachment; });
      });
  }

  /** '' when the file looks like a GIF the car takes, else why not; info: its size in px from the header. */
  function gifProblem(head, size) {
    if (!size) return 'That file is empty.';
    if (size > MAX_GIF) return 'That GIF is ' + (size / 1048576).toFixed(1) + ' MB; the car takes up to ' + MAX_GIF / 1048576 + ' MB.';
    var sig = String.fromCharCode.apply(null, head.subarray(0, 6));
    if (sig !== 'GIF87a' && sig !== 'GIF89a') return 'That is not a GIF. Pick a .gif file (an animated one).';
    var w = head[6] | (head[7] << 8), h = head[8] | (head[9] << 8);
    if (!w || !h || w > 2048 || h > 2048) return 'That GIF is ' + w + ' x ' + h + ' px; the car takes up to 2048 px a side.';
    return '';
  }

  function formPage(st, size) {
    var file = null, url = null, fit = 'cover';
    show('form');
    if (size) $('preview').style.aspectRatio = size.w + ' / ' + size.h;
    function setFit(f) {
      fit = f;
      $('preview').className = 'preview ' + (f === 'contain' ? 'fit' : 'fill');
      $('fit-cover').className = f === 'cover' ? 'on' : ''; $('fit-cover').setAttribute('aria-checked', String(f === 'cover'));
      $('fit-contain').className = f === 'contain' ? 'on' : ''; $('fit-contain').setAttribute('aria-checked', String(f === 'contain'));
    }
    $('fit-cover').onclick = function () { setFit('cover'); };
    $('fit-contain').onclick = function () { setFit('contain'); };
    $('file').onchange = function () {
      var f = $('file').files && $('file').files[0];
      file = null; $('send').disabled = true; err('form-err', '');
      if (url) { URL.revokeObjectURL(url); url = null; }
      if (!f) return;
      f.slice(0, 16).arrayBuffer().then(function (ab) {
        var head = new Uint8Array(ab), why = gifProblem(head, f.size);
        if (why) { err('form-err', why); $('preview').hidden = $('info').hidden = $('fit').hidden = true; return; }
        file = f;
        url = URL.createObjectURL(f);
        $('img').src = url;
        $('preview').hidden = $('fit').hidden = $('info').hidden = false;
        $('pick-text').textContent = 'Choose another GIF';
        $('info').textContent = cleanName(f.name) + ' · ' + (head[6] | (head[7] << 8)) + ' x ' + (head[8] | (head[9] << 8)) + ' px · ' +
          (f.size < 1048576 ? Math.round(f.size / 1024) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB');
        $('send').disabled = false;
      });
    };
    $('send').onclick = function () {
      if (!file) { err('form-err', 'Choose a GIF first.'); return; }
      $('send').disabled = true;
      send(st, file, fit);
    };
  }

  function send(st, file, fit) {
    busy('Encrypting…', 'Keep this page open until the car has it.');
    var sentId = null;
    file.arrayBuffer().then(function (ab) {
      return encrypt(st.key, AAD_FILE, ab);
    }).then(function (sealed) {
      busy('Sending…', 'Uploading ' + (sealed.length < 1048576 ? Math.round(sealed.length / 1024) + ' KB' : (sealed.length / 1048576).toFixed(1) + ' MB') + ', encrypted.');
      return Promise.all([retry(function () { return upload(st.topic, sealed); }), crypto.subtle.digest('SHA-256', sealed)]).then(function (r) {
        return seal(st.key, { t: 'gif', s: st.topic, v: 1, url: r[0], size: sealed.length, sha256: b64u(r[1]), fit: fit, name: cleanName(file.name) });
      });
    }).then(function (body) {
      return retry(function () { return post(st.topic, body); });
    }).then(function (r) {
      sentId = r && r.id;
      busy('Waiting for the car…', 'Sent. The car picks it up within a few seconds while it shows the code.');
      var until = Date.now() + WAIT_MS, got = false;
      function loop() {
        if (Date.now() > until) { failWith(got ? 'The car did not use it (no answer).' : 'The car has not picked it up. Is the code still on its screen, and is the car online?'); return null; }
        return poll(st.topic, sentId || 'all').then(function (list) {
          return Promise.all(list.map(function (m) { return unseal(st.key, m.message).catch(function () { return null; }); }));
        }, function () { return []; }).then(function (ps) {
          for (var i = 0; i < ps.length; i++) {
            var p = ps[i];
            if (!p || p.from !== 'car' || p.s !== st.topic) continue;
            if (p.t === 'got' && !got) {
              got = true;
              busy('Check the car’s screen', 'The car has the GIF and is getting it ready. Tap Use on the car to keep it for the Logo.');
            }
            if (p.t === 'done') {
              if (p.ok) show('done');
              else failWith(typeof p.error === 'string' && p.error ? p.error.slice(0, 200) : 'Cancelled on the car.');
              return null;
            }
          }
          return sleep(3000).then(loop);
        });
      }
      return loop();
    }).catch(function (e) {
      failWith('Could not send it (' + (e && e.message ? e.message : e) + '). Check the phone’s internet and try again.');
    });
  }

  function codePage() {
    show('code');
    $('code-go').onclick = function () {
      var c = $('digits').value.replace(/\D/g, '');
      if (c.length !== 6) { err('code-err', 'The code has 6 digits.'); return; }
      err('code-err', '');
      $('code-go').disabled = true;
      fromCode(c).then(function (st) { formPage(st, null); }, function () { err('code-err', 'This browser cannot do that. Scan the QR code instead.'); $('code-go').disabled = false; });
    };
  }

  window.addEventListener('hashchange', function () { location.reload(); });
  if (!window.crypto || !crypto.subtle || !window.Blob || !Blob.prototype.arrayBuffer) { failWith('This browser cannot encrypt the GIF (needs an https page and a current browser).'); return; }
  var h = new URLSearchParams(location.hash.slice(1));
  // the key leaves the address bar and the history once read
  if (location.hash) history.replaceState(null, '', location.origin + location.pathname);
  if (h.get('v') === '1') {
    var st = parseState(h.get('s'));
    if (!st) { failWith('This code is not complete. Scan the code on the car’s screen again.'); return; }
    if (h.get('a')) { try { var app = cleanName(new TextDecoder().decode(fromB64u(h.get('a')))).slice(0, 40); if (app) { $('app').textContent = app + ' · logo'; document.title = app + ': send a GIF'; } } catch (e) { /* plain title */ } }
    var w = Number(h.get('w')), hh = Number(h.get('h'));
    formPage(st, w > 0 && hh > 0 && w <= 4096 && hh <= 4096 ? { w: w, h: hh } : null);
  } else {
    codePage();
  }
})();
