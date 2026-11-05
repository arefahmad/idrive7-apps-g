# Animated home-screen widget

G's Dash 0.15 can play an animated GIF as its home-screen widget. You send the GIF from your phone with a
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
| Needs | nothing | a stream widget in the Store's renderer (below: not there yet), and G's Dash installed after it |
| Frame rate | up to 12 fps | the GIF's own rate (the renderer draws at display rate) |
| Vignette | the stock widget's dark edge and crop (see [The dark edge](#the-dark-edge)) | none |
| Cost per frame | one `setValue` of a resource handle made ahead | one small draw message; each frame goes to the GPU once |

**HMI pictures**: every frame is written once as a PNG with its own resource handle. A frame change is one
`setValue` of that handle into the widget's picture cell. Only one call is in flight per widget, so a slow
HMI skips frames rather than falling behind, and the frame sent is always the one due at that moment.

**Stream**: the renderer draws the frames into a surface that the HMI itself composites inside the widget.
If the renderer goes away, playback falls back to HMI pictures until it is back.

The Home widget page shows which way is in use and the measured frame rate.

## The dark edge

The dark edge (vignette) over the widget is drawn by `HmiMain3D` itself, as part of BMW's Drive Recorder
layout (`LT_Table_OnlineApps_DriveRecorderWidget`), which G's Dash's widget uses. An app only fills that
layout's cells, so nothing the app draws can remove it. Three ways to get rid of it, cheapest first:

1. **Dark edge test** (G's Dash 0.15.2, Options > Home widget). The layout has a Bool cell, `background`, that
   G's Dash has always set to true. **Backdrop off** sets it to false on every placed widget. It is not known
   yet what that cell switches. If the dark edge goes, leave it off. If your picture goes as well, turn it back
   on.
2. **A changed copy of the layout**, mounted by the Store's renderer (below). This needs the layout's
   definition from the unit first. Run `kit/tools/hmi_widget_probe.js` on the unit and see
   [Finding the vignette](#finding-the-vignette).
3. **The stream widget (Option A)**: the same changed copy, plus the renderer's surface over the picture for
   display-rate playback.

## How the HMI's widgets are built (from the Store's mgu-render)

The Store's renderer (`robertnisipeanu/mgu-store`, `native/mgu-render`; its in-page drawing came from
display-bridge and this kit's upstream renderer) already changes the HMI's widgets for in-page drawing. This
is how:

- `HmiMain3D` builds every page and widget from the `*.pbw` files (protobuf) in its widget folder,
  `/mnt/dataro/data/hmi/bmw/widget`, and loads every `*.pbw` it finds there.
- Every name in those files (templates, child widgets, parameters, values) is a number: an index into an
  identifier table compiled into `HmiMain3D`, so the numbers belong to one HMI build. **A template can only
  have a name that is already in that table.** mgu-render's `js/hmi_template.js` reads the table from the binary
  and defines `LT_State_A4A_WelcomeApp`, a page template the binary names but no file defines. Its content is a
  title bar plus an `eWidgetType_EmbeddedSurface` child that samples ivi surface `0x500` from the HMI's own
  compositor (`wayland-1`).
- The template is made at install (`mgu-render-hmi.sh --build`, at low priority, at most 120 s) for that
  `HmiMain3D` build. Before each HMI start, `mgu-render-hmi.service` copies the widget folder to `/run`, adds the
  template, and bind-mounts the copy over the original. Nothing on the unit's partitions is written.
  `umount /mnt/dataro/data/hmi/bmw/widget` undoes it.

So the vignette lives in the Drive Recorder layout's `.pbw` definition, and taking it out means a changed copy
of that definition in the same mounted folder.

## Finding the vignette

Nobody has looked inside the Drive Recorder layout's definition yet. `kit/tools/hmi_widget_probe.js` prints it.
It is read-only (it writes, mounts and restarts nothing) and runs on the unit's Node 8 as root, because it
reads `HmiMain3D` whole, as the template build does:

```bash
nice -n 19 node hmi_widget_probe.js > probe.txt
```

It prints:

- the file that defines the layout;
- its child widgets, each with its parameters, set to a value or bound to one of the layout's own parameters
  (the cells an app writes, such as `BackgroundImage1` and `background`, are among those);
- the lines that name a vignette, shadow, gradient, mask or background;
- the whole definition, with identifiers named;
- the widget-type names this `HmiMain3D` knows that no file defines, i.e. the names a new template could take.

`--template NAME` prints another layout. It was tested against a synthetic `HmiMain3D` and widget files
written the way mgu-render writes its own, including mgu-render's real template, which it reads back. Its
first run on a real unit is still to come.

## Option A: what the Store's renderer would need

This repository has the app side only. What the probe shows decides the details; this is the shape:

1. **The layout.** Either change the stock Drive Recorder definition in mgu-render's mounted copy (drop the
   vignette child, or bind its visibility to a parameter; this changes every widget using that layout,
   G's Music's and BMW's own Drive Recorder too), or define a free widget-type name from the probe's list as
   a copy without the vignette. For playback at display rate, add an `eWidgetType_EmbeddedSurface` child over the
   picture, sampling a second ivi surface id the renderer feeds. With no frames on it, the surface shows
   nothing, so the HMI-picture path still works in the same layout.
2. **The marker.** With a new name, the renderer writes it to `/var/opt/mgu-render/current/hmi-templates.json`
   as `{"streamWidget": "<name>"}`. `kit/tools/build.py` (run on the unit when the Store installs an app) uses
   that name only for an app whose `app.json` `startWidget.stream.marker` points there (G's Dash's does);
   otherwise the stock layout. If the marker later goes (the renderer was removed), the app says on its Home
   widget page to install it again.
3. **The protocol** (mgu-render/1; `kit/runtime/renderd.js` already speaks it, against a mock renderer):
   - **`X_READY`**: its second word lists the modes offered now (bit 0 layer, bit 1 embed). **Bit 2** would offer
     the widget surface. (Its third word, caps, is not the place: caps 32 there means "embed frames drawn
     zero-copy".)
   - **`X_MODE` 3**, sent after `READY`: this connection draws into the widget's surface, not a layer.
   - **`PLACE`**: `w` and `h` are the size the app draws at (G's Dash: 384 x 256).
   - **`SHOW` 1 / 0**: draw there or stop. The app sends 0 while no big widget is visible.
   - **Frames**: each GIF frame is sent once as a native picture (message 10); then one op 18 per frame change,
     at least once a second. When the connection closes, the renderer frees the pictures.
   - A renderer that does not offer bit 2 never gets `X_MODE` 3. The app plays through HMI pictures and asks
     again after 5 minutes. Today's mgu-render offers no bit 2, and that case is tested.

With such a layout mounted, `HmiMain3D` owns the picture. The animation then scrolls with the home-screen
pages, sits under BMW popups, notifications and CarPlay, has no vignette, and a tap still opens the app.

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
   `tv_net.js`; G's Music can share it with `"share": ["ng_tv/net/tv_net.js"]`, as G's Dash does.
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
