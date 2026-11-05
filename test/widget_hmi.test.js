'use strict';
/**
 * The home-screen widget's picture cells, and the Diagnostics > Widgets reader when the HMI folders
 * cannot be read. Plain Node, no packages:
 *
 *     node test/widget_hmi.test.js
 */
const assert = require('assert');
const path = require('path');
const { pictureInstances } = require('../kit/runtime/widget_anim');
const HMI = require('../kit/runtime/hmi_widgets');

let n = 0, failed = 0;
function test(name, fn) {
    n++;
    try { fn(); console.log('ok  ' + name); }
    catch (e) { failed++; console.log('FAIL ' + name + '\n' + (e.stack || e)); }
}

const list = [{ big: true, spawnId: 1 }, { big: false, spawnId: 2 }];
test('Drive Recorder: only the big widget gets a picture', () => {
    assert.deepStrictEqual(pictureInstances(list, { image: 'BackgroundImage1' }).map((i) => i.spawnId), [1]);
});
test('BasicWidget: big and small both get a picture', () => {
    assert.deepStrictEqual(pictureInstances(list, { image: 'BackgroundImage_Big', imageSmall: 'BackgroundImage_Small' }).map((i) => i.spawnId), [1, 2]);
});
test('a stream template keeps the big picture cell only', () => {
    const sw = { image: 'BackgroundImage_Big', imageSmall: 'BackgroundImage_Small', built: { stream: true } };
    assert.deepStrictEqual(pictureInstances(list, sw).map((i) => i.spawnId), [1]);
});
test('permission denied is one clear sentence', () => {
    const msg = HMI.readFailure(['/mnt/dataro/dataro1/hmi (EACCES)', '/mnt/dataro/data/hmi (EPERM)'], ['/mnt/dataro/dataro1/hmi', '/mnt/dataro/data/hmi']);
    assert.ok(/permission denied/i.test(msg), msg);
    assert.ok(/can't read the HMI widget folders/i.test(msg), msg);
    assert.ok(!/\/mnt\//.test(msg), msg);
});
test('a missing folder is not reported as a permission error', () => {
    const msg = HMI.readFailure(['/no/such/hmi (ENOENT)'], ['/no/such/hmi']);
    assert.ok(!/permission denied/i.test(msg), msg);
    assert.ok(/no widget files readable/.test(msg), msg);
});

const missing = ['/no/such/hmi-a-' + process.pid, '/no/such/hmi-b-' + process.pid];
HMI.scan({ hmi: '/no/such/HmiMain3D', roots: missing, yieldMs: 1 }).then((r) => {
    test('an unreadable HMI folder resolves, it does not reject', () => {
        assert.strictEqual(r.ok, false);
        assert.ok(r.error, 'an error string');
        assert.ok(!/HmiMain3D/.test(r.error), r.error);
        assert.ok(r.layouts && r.layouts.length === 0);
        assert.ok(r.denied.length >= 2, r.denied.join('; '));
    });
    console.log(failed ? failed + ' failed of ' + n : n + ' passed');
    process.exit(failed ? 1 : 0);
}, (e) => {
    console.log('FAIL scan rejected\n' + (e.stack || e));
    process.exit(1);
});
