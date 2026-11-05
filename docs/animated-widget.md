# Animated home-screen widget

G's Dash 0.15.0 can play an animated GIF as its home-screen widget. You send the GIF from your phone with a
QR code; the car prepares it, shows it to you, and plays it on the widget. The parts are in the kit, so
G's Music or G's TV can use them too (see [Other apps](#other-apps-gs-music-gs-tv)).

## Using it

1. In G's Dash, tap the **G**, then **Home widget**, then **Send a GIF from your phone**.
2. Scan the QR code with the phone's camera. Without a camera, open
   `nickgcode.github.io/idrive7-apps/widget` and type the 6-digit code from the car's screen.
3. Pick an animated GIF and choose **Fill** (no borders, the edges are cut) or **Fit** (the whole GIF,
   with clear borders). Tap **Send to the car**.
4. The car downloads it, makes it into frames, and shows it. Tap **Use this GIF** to put it on the widget,
   or **Cancel**. The phone page shows what happened.

On the same page, **Shows** switches between the G logo and your GIF, and **Remove GIF** (tap twice)
deletes it. A tap on the widget still opens G's Dash. Leaving the page while a GIF is on its way cancels it.

Limits: a GIF up to 8 MB and 2048 px on a side, at most 2000 frames. The car keeps at most 60 frames at
the widget's size (384 x 256). Longer GIFs are thinned in time, so the loop keeps its length and pace
(a 120-frame GIF at 30 fps becomes about 53 frames at about 15 fps). The frames are kept in one file in
G's Dash's data folder (4 MB at most), so they survive restarts and app updates.

Privacy: the GIF is encrypted on the phone (AES-256-GCM) with a key that only travels inside the QR code.
The mailbox, ntfy.sh, only ever holds ciphertext and deletes attachments after a few hours. The phone
page is static and talks to nothing else.

## How it plays

`kit/runtime/widget_anim.js` picks one of two ways, and picks again whenever something changes:

| | HMI pictures (every unit) | Stream (Option A) |
|---|---|---|
| Needs | nothing | the Store's renderer with the stream widget (below), and G's Dash installed after it |
| Frame rate | up to 12 fps | the GIF's own rate (the renderer draws at display rate) |
| Vignette | the stock widget's dark edge and crop | none |
| Cost per frame | one `setValue` of a resource handle made ahead | one small draw message; each frame goes to the GPU once |

**HMI pictures**: every frame is written once as a PNG with its own resource handle. A frame change is one
`setValue` of that handle into the widget's picture cell. Only one call is in flight per widget, so a slow
HMI skips frames rather than falling behind, and the frame sent is always the one due at that moment.

**Stream**: the renderer draws the frames into a surface that the HMI itself composites inside the widget.
If the renderer goes away, playback falls back to HMI pictures until it is back.

The Home widget page shows which way is in use and the measured frame rate.

## Option A: what the Store's renderer needs to provide

This repository has the app side only. The native side (`mgu-render` and `mgu-renderd-hmi.service`) lives in
the Store, so until it ships the parts below, every unit plays through HMI pictures. Nothing here changes
how a unit without them behaves. The app side is tested against a mock renderer that speaks this contract.

### 1. The template

`mgu-renderd-hmi.service` already runs before `HmiMain3D` and bind-mounts a modified copy of the HMI's widget
assets for in-page drawing. Into that copy it adds a startWidget template named
**`LT_Table_OnlineApps_MguStreamWidget`**: a clone of `LT_Table_OnlineApps_DriveRecorderWidget` (the layout
G's Dash and G's Music use) with these changes:

- the vignette overlay quad/material is removed (or its alpha set to 0);
- the same cells as the stock layout (`Title`, `BackgroundImage1`, `TextRecordings`, `TextCam`, `Progress`, ...),
  so an app fills it exactly as before, and `BackgroundImage1` is still drawn;
- over `BackgroundImage1`'s quad, a quad textured by a RAMSES stream texture bound to the renderer's widget
  stream source (the `ramses-ivi` surface id), with a fully transparent fallback texture. With no stream the
  template looks like the stock one without the vignette, so the HMI-picture path still works in it.

Every placed instance of the template shows the same stream.

### 2. The marker

While the template is mounted on every boot, the tool lists it in
`/var/opt/mgu-render/current/hmi-templates.json`:

```json
{ "startWidget": ["LT_Table_OnlineApps_MguStreamWidget"] }
```

`kit/tools/build.py` runs on the head unit when the Store installs an app. It builds an app's widget with the
template only if the app asks for it (`app.json` `startWidget.stream`) and the marker lists it; otherwise it
uses the stock layout as before. The template must stay as long as the marker does. If an app was built
with the template and the marker later disappears (the tool was removed), the HMI no longer has that
template. The app then says on its Home widget page to install it again, and a reinstall goes back to
the stock layout.

### 3. The protocol (mgu-render/1, `kit/runtime/renderd.js`)

- **`X_READY` caps bit 32 (`widget`)**: set only when this boot's HMI has the template mounted and its stream
  source bound.
- **`MODE` 3** (`0x4d520001`, one u32), sent after `READY`: this connection draws into the widget's stream
  surface. It is not a layer over the screen: no foreground gate, no touch claims, no controller grab.
- **`PLACE`**: `w` and `h` are the size the app draws at (G's Dash: 384 x 256; `x`, `y`, `ox`, `oy` 0,
  `scale` 1). The HMI's stream texture stretches the surface over the widget's picture quad.
- **`SHOW` 1 / 0**: draw into the surface, or stop (the template's own picture shows). The app sends 0 while
  no big widget is visible.
- **Frames**: each GIF frame is sent once as a native picture (message 10, premultiplied RGBA); then a `FRAME`
  (7) with one op 18 per frame change, at least once a second; `TICK` as usual.
- When the connection closes, the renderer frees its pictures. The app reconnects to swap an animation.
- A renderer that does not set bit 32 never gets `MODE` 3. The app closes that connection and plays
  through HMI pictures, asking again after 5 minutes.

`MODE` 3 and caps bit 32 are the values this repository uses (`X_MODE_WIDGET` and `CAP_WIDGET` in
`kit/runtime/renderd.js`). If mgu-render's `PROTOCOL.md` assigns them differently, change those two
constants.

With the template mounted, `HmiMain3D` owns the quad. As the discovery describes, the animation then
scrolls with the home-screen pages, sits under BMW popups, notifications and CarPlay, has no vignette,
and the widget's tap and iDrive click still go to MainApp, which opens the app.

## Other apps (G's Music, G's TV)

The pieces are in the kit, which every app ships, and none of them is specific to G's Dash:

| File | What it does |
|---|---|
| `kit/runtime/gif.js` | GIF decoder (GIF87a / 89a, all disposal modes, transparency, interlace), matched pixel for pixel against Chromium |
| `kit/runtime/anim.js` | `prepare()`: GIF to widget-sized frames; `Store`: one data file; `Clip` / `Timeline`: which frame shows when |
| `kit/runtime/widget_anim.js` | `AnimatedWidget`: plays the stored animation on the app's widget (stream or HMI pictures) |
| `kit/runtime/gif_drop.js` | `GifDrop`: the car's side of the phone hand-off (QR / 6-digit code, ntfy.sh, checks) |
| `web/widget/` | the phone page (published on the `gh-pages` branch under `/widget/`) |

To add it to an app:

1. `app.json`: a `startWidget` (G's TV has none yet: copy G's Dash's), optionally its `"stream"` entry; a
   `config` with `widgetRelay` and `widgetMailbox`; and an HTTP client for `GifDrop`. G's TV has
   `tv_net.js`; G's Music can share it with `"share": ["ng_tv/tv_net.js"]`, as G's Dash does.
2. In `main.js`, in place of `ctx.widget.loop(fps, draw)`:

   ```js
   const { AnimatedWidget } = require('./kit/widget_anim');
   const aw = new AnimatedWidget(ctx, { file: path.join(ctx.dataDir, 'widget_anim.bin'), draw }).start();
   ```

   `draw(inst, playing)` is the app's own picture (and its text cells) for when no animation plays.
   G's Music's album-art widget keeps working this way and only shows the GIF when one is set.
3. A page that runs `GifDrop` and `ANIM.prepare` and then calls `aw.replace(prepared, { name })`. G's Dash's
   `widgetPage` in `apps/ng_gsdash/main.js` does this with a preview and Use / Cancel.

## Publishing the phone page

The car's QR code points at `app.json` `config.widgetRelay` (`https://nickgcode.github.io/idrive7-apps/widget/`).
Copy `web/widget/index.html`, `widget.js` and `widget.css` to `widget/` on the `gh-pages` branch, next to
the existing `tv/` page. The page's Content-Security-Policy allows `https://ntfy.sh` only. A different
mailbox needs its own copy of the page with that server in `MAILBOX` and in `connect-src`.
