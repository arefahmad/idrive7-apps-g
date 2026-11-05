# Animated home-screen widget

G's Dash can play an animated GIF as its logo: the home-screen widget, and the same picture in the
instrument cluster. You send the GIF from your phone with a QR code; the car prepares it, shows it to you,
and plays it on the widget. The parts are in the kit, so G's Music or G's TV can use them too (see
[Other apps](#other-apps-gs-music-gs-tv)).

## Using it

1. In G's Dash, tap the **G**, then **Logo**, then **Send a GIF from your phone**.
2. Scan the QR code with the phone's camera. Without a camera, open
   `nickgcode.github.io/idrive7-apps/widget` and type the 6-digit code from the car's screen.
3. Pick an animated GIF and choose **Fill** (no borders, the edges are cut) or **Fit** (the whole GIF,
   with clear borders). Tap **Send to the car**.
4. The car downloads it, makes it into frames, and shows it. Tap **Use this GIF** to put it on the widget,
   or **Cancel**. The phone page shows what happened.

On the same page, **Shows** switches between the G logo and your GIF, and **Remove GIF** (tap twice)
deletes it. That choice is the logo on the home screen and in the instrument cluster. A GIF keeps
playing on the widget as before, and in the cluster too, including while the car is moving. The cluster
gets the same kind of picture update as the Pixel look's animated emblem (at most 12 a second), scaled
to fit that emblem's on-screen size (432 x 240). A tap on the widget still opens G's Dash. Leaving the
page while a GIF is on its way cancels it.

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
| Vignette | none on G's Dash's BasicWidget layout (see [The dark edge](#the-dark-edge)). A Drive Recorder layout still has the edge | none |
| Cost per frame | one `setValue` of a resource handle made ahead | one small draw message; each frame goes to the GPU once |

**HMI pictures**: every frame is written once as a PNG with its own resource handle. A frame change is one
`setValue` of that handle into the widget's picture cell. Only one call is in flight per widget, so a slow
HMI skips frames rather than falling behind, and the frame sent is always the one due at that moment.

**Stream**: the renderer draws the frames into a surface that the HMI itself composites inside the widget.
If the renderer goes away, playback falls back to HMI pictures until it is back.

The Logo page shows which way is in use and the measured frame rate.

## The dark edge

The dark edge (vignette) over a widget is drawn by `HmiMain3D` itself, from the layout the widget uses.
G's Dash uses BMW's `LT_Table_BasicWidget` (`common/widget/generated/Spec_MainMenuWidgets.pbw`). Its Big
picture cell `BackgroundImage_Big` and its Small cell `BackgroundImage_Small` feed a child of type
`LT_Label_WidgetBackground`: a full-widget picture, no mask, no `shadow_content` pass. The picture G's Dash
draws (the G mark, or the GIF) is written into both cells. How that layout crops the 384 x 256 picture
still has to be checked on the car, and the widget has to be removed and added again after installing.

G's Dash used to use BMW's Drive Recorder layout (`LT_Table_OnlineApps_DriveRecorderWidget`). A car session
(Nov 2026) took that one apart:

- The layout picks `LT_Table_OnlineApps_DriveRecorderWidget_Big` or `_Small` (both in
  `common/widget/generated/Spec_Startmenu.pbw`).
- In `_Big`, the child that shows the picture (`ImageRes1 <- BackgroundImage1`) is of type
  `LT_Label_WidgetBackgroundMask` (`bmw/id7/widget/`, 67 bytes, one render pass, `shadow_content`). **The mask
  and the picture are one child.** No cell an app writes can remove the edge and keep the picture; the
  `background` cell (G's Dash 0.15.2's Backdrop off test) doesn't either.
- `_Small` has no mask, and no picture either.

That is why the layout changed. Two ways were open, cheapest first, and G's Dash takes the first:

1. **Another BMW layout** that shows a picture without a mask. G's Dash's widget layout is
   `LT_Table_BasicWidget` (above): no Store change, no risk to the HMI. **G's Dash > Options > Diagnostics >
   Widgets** reads every widget layout on the unit (`kit/runtime/hmi_widgets.js`, read-only) and lists the
   ones with a picture, green when it is plain and amber when it is masked, with the cell to write. If the
   app is not allowed to read the HMI folders, the page says so and nothing else happens. See
   [Reading the layouts](#reading-the-layouts).
2. **A changed copy of the layout in mgu-render's overlay** (below): a `_Big` without the mask, or a mask type
   without `shadow_content` (that one changes every widget using it). Untested: whether `HmiMain3D` honours a
   second definition of a type that is already defined. The overlay covers `bmw/widget/` only.

## How the HMI's widgets are built (from the Store's mgu-render)

The Store's renderer (`robertnisipeanu/mgu-store`, `native/mgu-render`; its in-page drawing came from
display-bridge and this kit's upstream renderer) already changes the HMI's widgets for in-page drawing. This
is how:

- `HmiMain3D` builds every page and widget from the `*.pbw` files (protobuf) in its widget folder,
  `/mnt/dataro/data/hmi/bmw/widget` (`/mnt/dataro/dataro1/hmi/...` on a P18 unit, where the files are spread over
  `bmw/widget`, `bmw/id7/widget` and `common/widget/generated`), and loads every `*.pbw` it finds there.
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

## Reading the layouts

`kit/runtime/hmi_widgets.js` reads how the HMI builds its widgets. It is read-only: it writes, mounts and restarts
nothing. It reads `HmiMain3D` in pages (it never loads it whole) and the `*.pbw` files under
`/mnt/dataro/dataro1/hmi` (where they are on a P18 unit) and `/mnt/dataro/data/hmi`. For every widget layout, it
follows each cell into the child that shows it, through nested layouts such as the Drive Recorder's `_Big`, and
says whether that child is a mask:

- **In G's Dash:** Options > Diagnostics > Widgets > Read the widget layouts. It shows the layouts with a picture
  and saves the full list as `hmi_widgets.txt` in G's Dash's data folder. This works only if an app may read
  those files. On the car the app user cannot read `/mnt/dataro/dataro1/hmi` or `/mnt/dataro/data/hmi`
  (`EACCES`). The page then says it can't read the HMI widget folders and stops; it does not crash, and it
  does not try to change permissions.
- **Over SSH:** `node hmi_widgets.js` prints the full list; `--template NAME` prints one layout's whole
  definition with its identifiers named; `--hmi FILE` and `--roots DIR,DIR` point it elsewhere.

## Option A: what the Store's renderer would need

This repository has the app side only. What the Widgets reading shows decides the details; this is the shape:

1. **The layout.** Either change the stock Drive Recorder definition in mgu-render's mounted copy (drop the
   vignette child, or bind its visibility to a parameter; this changes every widget using that layout,
   G's Music's and BMW's own Drive Recorder too), or define a widget-type name the binary knows but no file defines as
   a copy without the vignette. For playback at display rate, add an `eWidgetType_EmbeddedSurface` child over the
   picture, sampling a second ivi surface id the renderer feeds. With no frames on it, the surface shows
   nothing, so the HMI-picture path still works in the same layout.
2. **The marker.** With a new name, the renderer writes it to `/var/opt/mgu-render/current/hmi-templates.json`
   as `{"streamWidget": "<name>"}`. `kit/tools/build.py` (run on the unit when the Store installs an app) uses
   that name only for an app whose `app.json` `startWidget.stream.marker` points there (G's Dash's does);
   otherwise the stock layout. If the marker later goes (the renderer was removed), the app says on its Logo
   page to install it again.
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
   `widgetPage` in `apps/ng_gsdash/main.js` (Options > Logo) does this with a preview and Use / Cancel.

## Publishing the phone page

The car's QR code points at `app.json` `config.widgetRelay` (`https://nickgcode.github.io/idrive7-apps/widget/`).
Copy `web/widget/index.html`, `widget.js` and `widget.css` to `widget/` on the `gh-pages` branch, next to
the existing `tv/` page. The page's Content-Security-Policy allows `https://ntfy.sh` only. A different
mailbox needs its own copy of the page with that server in `MAILBOX` and in `connect-src`.
