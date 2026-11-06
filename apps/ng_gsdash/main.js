'use strict';
/**
 * G's Dash - a driver display and car hub for the iDrive 7 (MGU) head unit, in seven looks.
 *
 *   - four screens, a horizontal swipe apart (page dots beside the G button, stopping at the ends):
 *     Drive (the look's dash, below; the screen the app opens on) · Warm-up (oil / coolant, the warm-up
 *     rev limit) · G-force (peak hold, hold a finger down to reset) · Tires (TPMS pressure / temperature).
 *     hub.js draws all but Drive. A cold start opens Warm-up and goes back to Drive by itself once warm
 *     (a swipe cancels that).
 *   - the drive mode badge: FES.statusFESVehicleDynamicSwitchHMI.actualValueModeDrivingExperience
 *     (car.js), shown by every look (Eco Pro, Comfort, Comfort+, Sport, Sport+, Individual)
 *   - shift lights over the last 2000 rpm before your shift point, gear (from the gearbox, or learned
 *     from rpm / speed when the car sends none), rpm, speed, a live g-meter with session peaks
 *     (accel / brake / lateral), oil and coolant in colour zones (0.11.0, lib.js TEMP_ZONES: blue cold,
 *     green normal, red too hot); mph, °F and psi unless Options > Units says km/h, °C, bar or kPa (0.13.6, units.js)
 *   - looks (setting "look", look_*.js): each its own layout, type, gauges and tab style -
 *     M Style (the default; 0.11.0: Carbon Grid), GT, Digital '84, Sim Racing, Lumen, Pixel (0.7.0). 0.9.0 took Simple, Heritage
 *     and Flight out: a saved one of those opens as M Style (migrated at start)
 *   - setting "panel": the right side of Drive. G-meter (the default), Spotify, or the Logo (the same
 *     picture as the widget and the cluster, including a per-mode GIF). Spotify is music.js (G's Music's
 *     code shared in by the build): what plays, art, previous / play-pause / next, a bar to tap or drag; its own QR sign-in
 *   - Options > Diagnostics (0.10.0: a plain entry, the 5-tap gesture went): Cluster - the tools'
 *     versions, the logo / skins / HUD state, the renderer's refusals, Waze on cluster's state, Refresh
 *     cluster, the alignment card and Stock redraw, the clock's source; Widgets - the HMI's widget
 *     layouts (read-only; a permission denial is said on the page); Audio - what the unit offers for sound
 *   - full screen, touch, GPU renderer (app.json "fullscreen": true): the G button opens Options
 *     (0.10.0: Theme, Cluster & HUD, Driving, Spotify, Diagnostics; every Options page has a Dash button
 *     at the top right back to the dash, the sub pages also "< Options"); Theme has the looks as a
 *     gallery (each card drawn once in software into a picture, so the looks' big fonts don't fill the
 *     renderer's shared glyph texture) and the right panel. Shift lights always in the Race colours
 *     (0.6.0 took that setting out). The Drive page's bottom bars are oil and coolant (0.9.0 took the
 *     fuel choice out: no reliable fuel signal for now). No demo data.
 *   - Logo (Options > Logo, setting "logo", was "widget"): the G mark by default, or a GIF sent from the
 *     phone with a QR code (kit gif_drop.js, the phone page web/widget/). The same choice is the home-screen
 *     widget (widget_logo.js, or the GIF played by kit widget_anim.js) and the cluster graphic (the look's
 *     own G, or that GIF, which keeps playing in the cluster while the car moves).
 *     Per driving mode (setting "logoPerMode", off by default): Comfort, Sport, Sport+ and any other mode
 *     the car reports (the same FES badge as the Drive screen, car.js) can each have a GIF. An empty slot
 *     keeps this Logo. The home widget and the cluster both follow the mode.
 *     The widget uses BMW's BasicWidget layout, whose picture has no mask (docs/animated-widget.md).
 *   - Options > Cluster source (0.8.3, cluster_source.js, setting "clusterSource", default Auto): what the
 *     cluster's centre map area shows - Auto (as before: the logo while G's Dash is open, G's Music over it
 *     while a track plays), Logo (also while G's Dash runs in the background), Music (G's Music's lyrics /
 *     visualizer, the logo when nothing plays), Map (Waze on cluster's CarPlay map) or Stock (the car's own;
 *     Waze on cluster has to be off). Route guidance always shows directions; G's TV only after its own
 *     Cluster button, and it yields to route guidance. The pick is shared with G's Music and G's TV in
 *     /dev/shm/ng-cluster/source.json, written only here (cluster_source.js has the rules).
 *     The logo: the G's Dash logo in the cluster's map area while no
 *     route guidance runs (cluster_logo.js, setting "clusterLogo" for Auto; the guidance from the car's
 *     navigation status and CarPlay's / Android Auto's, 0.7.4; 0.7.5: over Waze's map unless route
 *     guidance runs, shown too when no guidance signal answers; each signal's state on the page), and below it CarPlay's map on the
 *     instrument cluster (cluster.js), on / off, through the separately installed "Waze on cluster"
 *     tool's patch service: off unless the tool is installed and the user turns it on (with a
 *     confirmation); G's Dash stores nothing for it.
 *   - favourite looks (0.10.0, prefs.js; saved as "favLooks"): a star on each Theme card; with two or
 *     more, a tap on the gear (0.11.0: the gear only) on Drive switches to the next one (a toast says which). Not on a
 *     swipe or a moving finger, never while the shift lights build or flash. Looks that went drop out.
 *   - Spotify's controls (0.11.0, music.js): no boxes; 96-120 px targets 24 px apart or more, a filled
 *     play / pause circle, a soft disc pressed (stepped on Pixel), quiet targets (no kit press flash, a
 *     round controller ring); a 6 px seek bar with its times.
 *   - every clock H:MM with a colon (0.10.0, clock.js): the head unit's clock in its own zone (the car
 *     keeps it set). The session clocks are stopwatches: m:ss.t. The full-screen cluster test uses the same clock.
 *   - Dials & HUD (0.10.0, setting "displays", Options > Cluster & HUD): Cluster dials, G's Dash HUD,
 *     0.17.0 G's Music lyrics (on the HUD) or Car's own (the default) - one owner at a time (they share one
 *     scene), shared with G's Music and G's TV (cluster_source.js), Waze's HUD map off while one of ours owns
 *     it (waze_ctl.js). 0.9.0's two settings (clusterSkin, hudShift) are moved over once at start (prefs.js);
 *     0.17.0: G's Music's own HUD lyrics setting once, when the pick was Car's own.
 *   - cluster skins (0.8.0, cluster_skin.js, "displays" Cluster dials): with the cluster in
 *     its M / Sport layout (any drive mode), the cluster's own dials redrawn in the G's Dash look (the look switches the skin;
 *     Stock, the stock dials redrawn, from diagnostics), the telltales on top. 0.8.1: driving too - the
 *     speedometer, tachometer, digital speed and gear live from every car sample (car.onSample, 30 Hz at
 *     most); fuel, oil and the ACC / speed-limit / assist area left the car's own; back to stock when a
 *     value is over 300 ms old while moving, or anything is wrong. Diagnostics > Refresh cluster drops and makes
 *     again every G's Dash layer in the cluster (the logo takes the map back from the stock map). On the
 *     diagnostics page, parked: the alignment card (a 1 px outline of the measured geometry) and the
 *     Stock redraw.
 *   - HUD (gear, tach, shift lights) (0.13.0; 0.9.0-0.12.0 also showed the speed, 0.8.2 had the lights +
 *     gear; hud_shift.js, "displays" HUD): while open, the whole HUD in the look's style - the gearbox's
 *     own gear, big, D3 style (none in P or unknown; a guessed number: D alone) and a tach arc with the
 *     shift-light colours over the last 2000 rpm before the shift point (the whole arc flashing from it);
 *     the car's own HUD shows the speed. Any drive mode. No speed limit.
 *     Hidden on values over 300 ms old, no speed signal, demo data or a renderer error, and while G's TV
 *     plays on the HUD (back about 1 s after). The panel and the HUD share one scene: one at a time.
 *   - Full-screen cluster test (0.12.0, fcluster.js / fcluster_core.js, Options > Diagnostics, TEST): classic
 *     twin round dials over the whole cluster panel (1920 x 720), any gear or speed; covers the car's warning
 *     lights while on. Off by default and never saved (fcTest lives in memory only). The skins and the HUD
 *     are paused while it is on; it fades to stock on late values or anything wrong.
 *
 * Built on the idrive7-apps kit (kit/runtime). Node 8: no optional chaining, no ?? and no object spread.
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const Car = require('./kit/car');
const { Canvas } = require('./kit/canvas');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const record = require('./kit/record');
const PNG = require('./kit/png');
const HUB = require('./hub');
const LOGO = require('./widget_logo');
const L = require('./lib');
const Music = require('./music').Music;
const ClusterMap = require('./cluster').ClusterMap;
const CL = require('./cluster_logo');
const CSRC = require('./cluster_source');
const { WazeCtl } = require('./waze_ctl');
const CS = require('./cluster_skin');
const HS = require('./hud_shift');
const FCL = require('./fcluster');
const P = require('./px');
const PREFS = require('./prefs');
const LM = require('./logo_modes');
const { LogoPlayer } = require('./logo_player');
const STAGES = require('./logo_stages');
const { containBox } = require('./logo_cache');
const CLOCK = require('./clock');
const UNITS = require('./units');
const TINTS = require('./tints');
const ANIM = require('./kit/anim');
const HMIW = require('./kit/hmi_widgets');
const AP = require('./kit/audio_probe');
const { AnimatedWidget } = require('./kit/widget_anim');
const { GifDrop } = require('./kit/gif_drop');
const { Net } = require('./tv_net');
const qrcodegen = require('./qrcodegen');

const LOOKS = [require('./look_m'), require('./look_gt'), require('./look_digital'), require('./look_simracing'),
    require('./look_lumen'), require('./look_pixel'), require('./look_vector'), require('./look_space'), require('./look_aura'), require('./look_desktop')];
// M Style is the default look, and where any other id lands (0.9.0: Simple, Heritage and Flight went)
const DEFAULT_LOOK = 'm';
const lookOf = (id) => LOOKS.find((l) => l.id === id) || LOOKS.find((l) => l.id === DEFAULT_LOOK);

const MPH = 1.609344;
const TRAIL_MS = 3000;
const OIL_READY_F = 194, COOLANT_READY_F = 176, HYST_F = 4;
// the installed version (Options' top line): the package's own (source/package.json, one level up from
// the app's scripts; app.json beside them in the dev tree); was a constant left at 0.13.0
const VERSION = (() => {
    for (const f of [path.join(__dirname, '..', 'package.json'), path.join(__dirname, 'app.json')]) {
        try { const v = JSON.parse(fs.readFileSync(f, 'utf8')).version; if (v) return String(v); } catch (e) { /* not there */ }
    }
    return '';
})();
// Warm-up: the rev limit is COLD_RPM at or below COLD_F oil, rising (250 rpm steps) to WARM_REDLINE at
// the "oil temp for full revs" setting. Auto-jump: AUTO_MS after READY it opens Drive.
const COLD_RPM = 4000, COLD_F = 104, WARM_REDLINE = 6000, OIL_FULL_F = 180, AUTO_MS = 5000;
const HIST_MS = 20000, HIST_N = 80, ENV_N = 48;                  // G-force: last 20 s, the peak envelope
const SWIPE_START = 40, SWIPE_GO = 110, HOLD_MS = 700, HOLD_SLOP = 24;
// record.setImage ids (cards: + look index; wprev: the Logo page's preview)
const IMG = { card: 0x6710, wprev: 0x6720, panel: 0x6730 };
const toF = (c) => (L.isNum(c) ? c * 9 / 5 + 32 : c);

// content box: full screen from page y BOX_OWN to the page's bottom (G.pageBottom), else BOX_STD + BOX_H.
// The renderer's touch area starts at screen y 76 (about page y 22 here: the HMI keeps the strip above
// for its pull-down), so nothing to tap sits higher than BOX_OWN.
const BOX_OWN = 40, BOX_STD = 52, BOX_H = 456;
// the G button (full screen): opens the settings; GB_W x GB_H page px in the content's bottom-right
// corner (~126 x 89 screen px), every look keeps that corner free. The Options pages' header row:
// Back (to the dash) at the left, the G (lit) at the right, page y HEAD_Y .. HEAD_Y + HEAD_H.
const GB_W = 108, GB_H = 76, HEAD_Y = 40, HEAD_H = 64, SET_Y = 118;

/* Options page rows (stepped with - / +): key, label, value text */
const ENGINE = [
    ['redline', 'Redline', (v) => v + ' rpm'],
    ['shiftBefore', 'Shift point, before redline', (v) => (Number(v) ? v + ' rpm' : 'At redline')],
    ['oilFullRevs', 'Oil temp for full revs', (v) => UNITS.tempSetting(v, UNIT_PICK.temp)],
    ['oilReady', 'Oil ready', (v) => UNITS.tempSetting(v, UNIT_PICK.temp)],
    ['coolantReady', 'Coolant ready', (v) => UNITS.tempSetting(v, UNIT_PICK.temp)],
];
// the units shown (Options > Units, 0.13.6; units.js): read once a frame; the values stay mph-from-km/h, °F and psi inside
let UNIT_PICK = Object.assign({}, UNITS.DEFAULTS);
const GSCALE = ['gScale', 'G-meter scale', (v) => Number(v).toFixed(1) + ' g'];
// fixed since 0.6.0 (the setting went): the shift lights' Race colours
const LIGHT_STYLE = 'f1';
const STAR = '#ffc93a';                 // the favourite looks' star
const DASH_W = 250;                     // the Dash button (top right of every Options page)

mgu.run({
    async start(ctx) {
        const { ui, settings, log } = ctx;
        // car data only: no demo feed (opts.demo false), a value not sent shows '--'
        const car = new Car(ctx, ['rpm', 'speed', 'temps', 'accel', 'gear', 'program', 'drivemode', 'tpms', 'units'], { demo: false });
        // 0.9.0: a saved look that is gone (simple, heritage, flight) or unknown becomes M Style
        const savedLook = settings.get('look');
        if (!LOOKS.some((l) => l.id === savedLook)) {
            log.info('look ' + savedLook + ' is gone: M Style');
            settings.set('look', DEFAULT_LOOK);
        }
        // 0.14.0: colour variants (tints.js) - a saved value read as this version knows it (none: every look's default)
        const savedTints = settings.get(TINTS.KEY), tintsNow = TINTS.clean(savedTints);
        if ((savedTints || '') !== tintsNow) { log.info('look colours: "' + (savedTints || '') + '" -> "' + tintsNow + '"'); settings.set(TINTS.KEY, tintsNow); }
        // Logo was "widget" (Home widget). Copy a saved choice once, then drop the old key (not a retiredSetting:
        // the kit would have deleted it before this could read it).
        const lm = PREFS.migrateLogo(settings.values);
        if (lm.migrated || Object.prototype.hasOwnProperty.call(settings.values, 'widgetBackdrop')) {
            const from = settings.values.widget;
            delete settings.values.widget;
            delete settings.values.widgetBackdrop;
            if (lm.migrated) log.info('logo: saved home widget "' + from + '" kept as Logo (' + lm.value + ')');
            settings.set(PREFS.LOGO_KEY, lm.value);
        }
        // 0.10.0: 0.9.0's "clusterSkin" / "hudShift" become "displays" (Cluster dials / HUD / Neither), once.
        // They are not app.json retiredSettings (the kit would delete them before this could read them).
        const dm = PREFS.migrateDisplays(settings.values);
        if (dm.migrated) {
            PREFS.OLD_KEYS.forEach((k) => { delete settings.values[k]; });
            log.info('displays: ' + dm.value + ' (from 0.9.0\'s settings)');
            settings.set('displays', dm.value);
        } else if (settings.get('displays') !== dm.value) settings.set('displays', dm.value);
        // favourite looks (prefs.js): kept outside the settings list, looks that went drop out
        const favs = () => PREFS.parseFavs(settings.get(PREFS.FAV_KEY), LOOKS.map((l) => l.id));
        const clock = new CLOCK.Clock();

        // a look with colour variants is recoloured to its chosen one (tints.js) before it draws
        const tintOf = (l) => TINTS.of(l.id, settings.get(TINTS.KEY));
        const tinted = (l) => { if (l) L.lookFonts(l.id, log); if (l && l.applyTint) l.applyTint(tintOf(l)); if (l) l.tintKey = TINTS.key(l.id, settings.get(TINTS.KEY)); return l; };
        const look = () => tinted(lookOf(settings.get('look')));
        const skinKey = () => TINTS.key(look().id, settings.get(TINTS.KEY));
        const palette = () => { const l = look(); return typeof l.palette === 'function' ? l.palette(settings) : l.palette; };
        // the kit's own parts (header, the controller's marks) in the look's colours
        if (ctx.setTheme) ctx.setTheme(palette);
        settings.onChange((k) => { if ((k === 'look' || k === TINTS.KEY) && ctx.setTheme) ctx.setTheme(palette); });
        // 0.13.7: the Settings list's temperatures (kept in °F) shown in Options > Units' temperature unit
        settings.format = (it, v) => (it && it.unit === '\u00b0F' ? UNITS.tempSetting(v, UNITS.pick(settings).temp) : null);
        // 0.13.4: every look switch one line (the remote logs' ring keeps it with the cluster / HUD lines around it)
        settings.onChange((k, v) => { if (k === 'look') log.info('look: ' + lookOf(v).id); else if (k === TINTS.KEY) log.info('look colour: ' + (v || 'defaults') + ' (' + skinKey() + ')'); });

        let peak = null, since = Date.now(), env = [], hist = [], gSeen = false, sessionAt = 0;
        const SESSION_FLASH_MS = 450;
        const trail = [];
        const reset = () => {
            peak = { rpm: 0, speed: 0, acc: 0, brk: 0, lat: 0, left: 0, right: 0 }; trail.length = 0; since = Date.now();
            env = []; for (let i = 0; i < ENV_N; i++) env.push(0);
            hist = []; gSeen = false;
        };
        reset();
        car.onSample((d, t) => {
            if (L.isNum(d.rpm)) peak.rpm = Math.max(peak.rpm, d.rpm);
            if (L.isNum(d.speed)) peak.speed = Math.max(peak.speed, d.speed);
            // a road car cannot pull more than ~3 g: anything above is a bad sample
            if (L.isNum(d.gLong) && L.isNum(d.gLat) && Math.abs(d.gLong) < 3 && Math.abs(d.gLat) < 3) {
                peak.acc = Math.max(peak.acc, d.gLong);
                peak.brk = Math.max(peak.brk, -d.gLong);
                peak.lat = Math.max(peak.lat, Math.abs(d.gLat));
                // right / left as the g-meter draws them (+lat to the right)
                peak.right = Math.max(peak.right, d.gLat); peak.left = Math.max(peak.left, -d.gLat);
                const mag = Math.sqrt(d.gLat * d.gLat + d.gLong * d.gLong);
                if (mag > 0.02) {
                    let a = Math.atan2(d.gLat, d.gLong); if (a < 0) a += 2 * Math.PI;
                    const k = Math.round(a / (2 * Math.PI) * ENV_N) % ENV_N;
                    env[k] = Math.max(env[k], mag);
                }
                gSeen = true;
                trail.push([t, d.gLat, d.gLong]);
                while (trail.length && t - trail[0][0] > TRAIL_MS) trail.shift();
            }
        }, reset);
        ui.onClick('BTN_RESET', () => { reset(); log.info('peaks reset'); });

        const speedOf = (kmh) => (L.isNum(kmh) ? kmh / MPH : kmh);          // always mph
        const num = (k, dflt) => { const v = Number(settings.get(k)); return isFinite(v) && v > 0 ? v : dflt; };
        const ready = { oil: false, coolant: false };
        const warm = (key, f, thr) => {
            if (!L.isNum(f)) return null;
            ready[key] = ready[key] ? f >= thr - HYST_F : f >= thr;
            return ready[key];
        };

        // the page: 0 = the hub (screen scr: HUB.SCREENS), 1 = Options (the G), 2 = Spotify, 3 = Diagnostics,
        // 4 = Cluster & HUD, 5 = Theme, 6 = Driving (2..6 go back to Options; Dash on each: the hub); the
        // bar's Reset moves to the settings page (no bar: the page reaches the screen's bottom)
        let page = 0, armed = 0, gDown = 0, downKey = '';
        // the screen is up (Spotify polls only then; the logo's background path, 0.8.3)
        const visible = () => (ui.isVisible ? ui.isVisible('MAIN') : true);
        const SCR = (id) => HUB.SCREENS.findIndex((x) => x[0] === id);
        let scr = SCR(HUB.HOME);                 // the hub screen (HUB.SCREENS index): Drive, not index 0
        const go = (i) => { scr = i; };
        if (ctx.hideButton) ctx.hideButton('BTN_RESET');
        // the dash again: Back on Options, the G there, the controller pushed left (ctx.onBack), and
        // whenever the screen is left (the HMI's back arrow / BACK closes it; it comes back on the hub)
        const toDash = () => { if (page === 0) return false; if (ask) { ask = null; return true; } page = page >= 2 ? 1 : 0; return true; };
        if (ctx.onBack) ctx.onBack(toDash);
        if (ui.onVisible) ui.onVisible((st, on) => { if (!on) { page = 0; ask = null; skinMode = 'skin'; } });
        // the logo in the cluster's map area (cluster_logo.js, setting "clusterLogo"): only while G's Dash
        // is open, the regular logo or (Pixel look) the pixel emblem, its motion only while standing still
        let regImg = null, bakedImg = null;
        const clogo = new CL.ClusterLogo({ log, app: 'ng_gsdash', images: {
            regular: () => regImg || (regImg = CL.regularImage(Canvas, L.badge, L.badgeWidth)),
            pixel: (o) => CL.pixelImage(P, o),
            // 0.13.1: the look's baked picture, the fallback when its shader logo cannot be drawn; only the
            // active look's is decoded and kept (the one before is let go)
            baked: (id) => { if (!bakedImg || bakedImg.id !== id) { bakedImg = null; bakedImg = { id, img: PNG.decode(fs.readFileSync(path.join(__dirname, 'logo_' + id + '.png'))) }; } return bakedImg.img; },
        } });
        const logoOn = () => settings.get('clusterLogo') !== 'off';
        // your look on the car's displays (0.10.0, setting "displays"): the cluster skins (Cluster dials), the
        // HUD, or Neither - one at a time, the panel and the HUD share one scene (prefs.js)
        const displays = () => (PREFS.validDisplay(settings.get('displays')) ? settings.get('displays') : PREFS.DEFAULT_DISPLAY);
        // the cluster skins (cluster_skin.js, "displays" skin): any drive mode, parked and driving, the look's;
        // skinMode from the diagnostics page: 'skin', 'align' (the alignment card), 'stock' (the Stock redraw)
        const cskin = new CS.ClusterSkin({ log, app: 'ng_gsdash', load: (f) => PNG.decode(fs.readFileSync(path.join(__dirname, f))) });
        const skinOn = () => displays() === 'skin';
        // the HUD - gear, tach, shift lights (0.13.0; hud_shift.js, "displays" hud)
        const hud = new HS.HudShift({ log, app: 'ng_gsdash', load: (f) => PNG.decode(fs.readFileSync(path.join(__dirname, f))) });
        const hudOn = () => displays() === 'hud';
        let skinMode = 'skin', refreshedAt = -1e15;
        // 0.12.0: Diagnostics > Full-screen cluster test (TEST): classic round dials over the whole cluster panel
        // (fcluster.js). Off by default and held here only - never a setting, never saved: off again after every
        // app or head unit restart. While on, the cluster skins and the HUD are paused (they share the scene).
        let fcTest = false;
        // 0.13.8: when the test was switched while the HUD / skins (or the test) were up: the other side waits out the
        // shared scene id's hand-over (fcluster.js HANDOVER_MS)
        let fcSwitchAt = null;
        const fcl = new FCL.FullCluster({ log, app: 'ng_gsdash', load: (f) => PNG.decode(fs.readFileSync(path.join(__dirname, f))) });
        const SPEED_IFACE = 'de.bmw.infotainment.vehicle.Vehicle2';
        // the Cluster source pick (0.8.3, cluster_source.js): setting "clusterSource", shared with G's Music and
        // G's TV in CSRC.SOURCE_DIR (written only here: at start, on a change and on Refresh cluster)
        const srcPick = () => (CSRC.valid(settings.get('clusterSource')) ? settings.get('clusterSource') : CSRC.DEFAULT);
        // 0.13.9: G's Dash on the cluster & HUD (setting "clusterControl", saved): Off = the car stock - no logo,
        // dials, HUD or test, nothing held or asked for again, and Stock shared so G's Music stays out too
        let ending = false; // the app ending: nothing of ours asked for again (a last frame after 'exit')
        const gsdOn = () => !ending && settings.get('clusterControl') !== 'off';
        const sharedPick = () => (gsdOn() ? srcPick() : 'stock');
        // 0.17.0: the dials & HUD's owner, shared too (G's Music's HUD lyrics and G's TV's HUD go by it)
        const sharedDisplays = () => (gsdOn() ? displays() : 'none');
        let srcRev = 0, srcPub = { ok: false, text: '' };
        const publishSource = (why) => {
            srcRev++;
            srcPub = CSRC.publish(sharedPick(), srcRev, { displays: sharedDisplays() });
            if (srcPub.error) log.warn('cluster source: ' + srcPub.text);
            else log.info('cluster source: ' + sharedPick() + ', dials & HUD ' + sharedDisplays() + ' shared (' + why + (gsdOn() ? '' : ', G\'s Dash off') + ')');
        };
        publishSource('start');
        /** My GIF for the cluster, or null for the look's own G. Filled in once the widget animation exists. */
        let logoPicture = function () { return null; };
        /** Which GIF plays (the main Logo, or the driving mode's). Filled in with the widget. No work until then. */
        let logoSync = function () { return false; };
        let logoIv = null;
        /** The logo per the pick: Auto as before (open and clusterLogo on), Logo / Music also in the background, Map / Stock none. */
        const clogoUpdate = (open) => {
            const d = car.data(), src = srcPick(), on = gsdOn();
            clogo.update({ on: on && CSRC.logoWanted(src, open, settings.get('clusterLogo')), enabled: on && (src === 'auto' ? logoOn() : (src === 'logo' || src === 'music')),
                guideHides: CSRC.guideHides(src), exclusive: CSRC.logoExclusive(src),
                pixel: look().id === 'pixel', look: skinKey(), parked: L.isNum(d.speed) && d.speed < 1,
                picture: logoPicture(),
                idleText: !on ? 'Off - G\'s Dash is off on the cluster' : src === 'auto' ? 'On - while G\'s Dash is open' : 'Off - ' + CSRC.NAMES[src] + ' picked' });
            centreTrack();
        };
        // in the background (the screen's loop stops when it is hidden): the logo kept per the pick every second
        const bgLogo = setInterval(() => { if (!visible()) clogoUpdate(false); }, 1000);
        if (bgLogo.unref) bgLogo.unref();
        const logoUpdate = (open) => {
            const d = car.data();
            logoSync();
            clogoUpdate(open);
            const sub = car.subBy ? car.subBy[SPEED_IFACE] : null;
            const speedAvail = !!(sub && sub.available && !sub.error);
            // 0.12.0: the full-screen cluster test pauses the skins and the HUD (closed for them while it is on)
            // 0.13.8: keep - closed only because the screen is covered (an HMI popup such as Siri, or left for a moment):
            // the skins and HUD hidden at once as before, their layers and scene kept and shown again on return
            // 0.13.9: G's Dash off on the cluster & HUD: all three closed for good (enabled false: no keep, no re-arm)
            const on = gsdOn();
            if (!on) { fcTest = false; skinMode = 'skin'; }
            const skinWant = on && (skinOn() || skinMode !== 'skin');
            cskin.update({ on: !!open && !fcTest && skinWant, enabled: skinWant, look: skinKey(), mode: skinMode, data: d,
                speedAvail, gear: L.gearText(d.gear, d.stage, d.program), at: car.at || null, speedUnit: UNITS.pick(settings).speed,
                keep: !open && !fcTest && skinWant });
            const redline = num('redline', 6500);
            hud.update({ on: on && !!open && !fcTest && hudOn() && skinMode === 'skin', enabled: on && hudOn(), look: skinKey(), data: d, gear: L.gearText(d.gear, d.stage, d.program),
                at: car.at || null, redline, shift: redline - (Number(settings.get('shiftBefore')) || 0),
                keep: on && !open && !fcTest && hudOn() && skinMode === 'skin', after: fcTest ? null : fcSwitchAt });
            // any gear, any speed; night: G's Dash has no day / night signal from the car (no look switches), so day
            fcl.update({ on: on && !!open && fcTest, enabled: on && fcTest, data: d, speedAvail, at: car.at || null, night: false, clock: clock.now(), units: UNITS.pick(settings),
                after: fcTest ? fcSwitchAt : null });
        };
        // the skins' live path (0.8.1): every speed / rpm / accel sample straight on, not at the loop's 10 fps
        car.onSample(() => {
            if (cskin.want) { const d = car.data(); cskin.sample(d, car.at || null, L.gearText(d.gear, d.stage, d.program)); }
            if (hud.want) { const d = car.data(); hud.sample(d, car.at || null, L.gearText(d.gear, d.stage, d.program)); }
            if (fcl.want) fcl.sample(car.data(), car.at || null);
        });
        /** Diagnostics > Refresh cluster: every G's Dash layer in the cluster dropped and made again */
        const refreshCluster = () => {
            const a = clogo.refresh(), b = cskin.refresh(), c = hud.refresh(), f = fcl.refresh();
            publishSource('refresh');
            refreshedAt = Date.now();
            log.info('refresh cluster: logo ' + (a ? 'remade' : 'not up') + ', skin ' + (b ? 'remade' : 'not up') + ', hud ' + (c ? 'remade' : 'not up') + (f ? ', full-screen test remade' : ''));
        };
        if (ui.onVisible) ui.onVisible((st, on) => { if (st === 'MAIN') logoUpdate(on); });
        settings.onChange((k) => {
            if (k === 'clusterControl') log.info('cluster control: G\'s Dash ' + (gsdOn() ? 'on the cluster & HUD again' : 'off - the cluster and HUD left to the car (everything of ours let go)'));
            if (k === 'clusterSource' || k === 'clusterControl' || k === 'displays') publishSource('change');
            if (k === 'clusterSource' || k === 'clusterControl' || k === 'clusterLogo' || k === 'logo' || k === LM.PER_KEY || k === 'displays' || k === 'look' || k === TINTS.KEY || k === 'redline' || k === 'shiftBefore' || k === 'unitSpeed') logoUpdate(ui.isVisible ? ui.isVisible('MAIN') : true);
        });
        // 0.17.0: Waze on cluster's map switched as the picks say (waze_ctl.js): off on the cluster for Stock, on for
        // Waze, off on the HUD while one of ours owns it; what Waze had put back once nothing needs it, and with
        // G's Dash off on the cluster & HUD
        const wctl = new WazeCtl(log, { settings });
        const wazeWant = () => (gsdOn() ? { cluster: CSRC.wazeCluster(srcPick()), hud: CSRC.wazeHud(displays()) } : {});
        const wazeTick = () => { try { wctl.tick(wazeWant()); } catch (e) { log.warn('waze ctl: ' + e.message); } };
        const wazeIv = setInterval(wazeTick, 2000);
        if (wazeIv.unref) wazeIv.unref();
        wazeTick();
        // 0.17.0, once: G's Music's HUD lyrics (its own HUD setting, 0.8.0) become the dials & HUD pick when nothing of
        // G's Dash's had it (Car's own); with the dials or G's Dash's HUD picked, that pick stays (shown in G's Music)
        const MIGRATED_KEY = '_hudPickMigrated';
        const hudMigrate = () => {
            if (settings.get(MIGRATED_KEY)) return;
            const ms = CSRC.readMusic();
            if (ms.error || ms.hud === null) return;              // G's Music not seen yet, or before 0.9.0: later
            try { settings.set(MIGRATED_KEY, 'done'); } catch (e) { return; }
            if (ms.hud === 'lyrics' && displays() === 'none') {
                log.info("dials & HUD: G's Music's lyrics (its HUD setting was on)");
                settings.set('displays', 'music');
            }
        };
        const migIv = setInterval(() => { hudMigrate(); if (settings.get(MIGRATED_KEY)) clearInterval(migIv); }, 5000);
        if (migIv.unref) migIv.unref();
        hudMigrate();
        process.once('exit', () => { ending = true; clearInterval(bgLogo); if (logoIv) clearInterval(logoIv); clearInterval(wazeIv); wctl.close(); clogo.close(); cskin.close(); hud.close(); fcl.close(); });
        // route guidance (0.7.4, 0.7.5): the logo steps aside while it runs, and only then (or for G's TV). The stock navigation's guidingState
        // (INACTIVE / CALCULATING_ROUTE / ACTIVE) and the phone's projectedGuidanceActive (CarPlay: Waze
        // or Maps with a route; Android Auto), all app.json "_optional"; read again every GUIDE_POLL_MS
        // in case a change notification is missed. No answer from any: the logo still shows (the page
        // says "route detection unavailable"); each watch's state goes to clogo.guideLink() for the
        // page's "Route: nav .. CarPlay .. AA .." line (n/a: no config or refused; no answer: subscribed,
        // the provider not there), kept up every GUIDE_LINK_MS.
        const GUIDE = [
            ['de.bmw.infotainment.navigation.navigationstatus.NavigationStatus', '1', 'guidingState', 'nav'],
            ['de.bmw.infotainment.a4a.carplay.CarPlayManager', 'CarPlayManagerInst1', 'projectedGuidanceActive', 'carplay'],
            ['de.bmw.infotainment.sdi.aap.androidautoprojectedmanager.AndroidAutoProjectedManager', 'AndroidAutoProjectedManagerInst1', 'projectedGuidanceActive', 'aa'],
        ];
        const GUIDE_POLL_MS = 10000, GUIDE_LINK_MS = 2000;
        if (ctx.signals && ctx.signals.watch) GUIDE.forEach((g) => {
            const h = {};
            h[g[2]] = (v) => clogo.guidance(g[3], v);
            ctx.signals.watch(g[0], g[1], h, log, { pollMs: GUIDE_POLL_MS })
                .then((r) => {
                    log.info('guidance ' + g[3] + ': ' + (r.error ? 'unavailable (' + r.error + ')' : r.available ? 'available' : 'subscribed'));
                    const link = () => clogo.guideLink(g[3], r.error ? 'error' : r.available ? 'up' : 'down', r.error ? String(r.error) : '');
                    link();
                    if (!r.error) { const iv = setInterval(link, GUIDE_LINK_MS); if (iv.unref) iv.unref(); }
                })
                .catch((e) => { log.warn('guidance ' + g[3] + ': ' + e); clogo.guideLink(g[3], 'error', String(e && e.message || e)); });
        });
        // settings 0.4.0 had and 0.5.0 dropped (demo, layout, renderer, speedUnit, spotifyPoll, showBadge),
        // 0.6.0's (lights: the Race colours, LIGHT_STYLE; theme) and 0.9.0's (bars: the fuel choice)
        // are app.json "retiredSettings": the kit deletes saved values for them at start (mgu.js Settings)
        /** A press on the G (or Back): shown pressed for a moment, then the page changes. */
        const press = (to, key) => { gDown = Date.now(); downKey = key; setTimeout(() => { page = to; }, 140); };
        const isDown = (key) => downKey === key && Date.now() - gDown < 180;

        // CarPlay's map on the cluster (cluster.js): the patch service's socket only while its page is open, apply /
        // revert only from the confirmation (ask: { cmd, at }, it goes after ASK_MS)
        const cmap = new ClusterMap(log);
        let ask = null;
        const ASK_MS = 20000;
        const panelOn = () => settings.get('panel') === 'spotify';
        let ownNow = false;
        const musicOnHub = () => {
            const id = HUB.SCREENS[scr][0];
            // G-force (0.11.1) always shows its g readouts on the right, never Spotify
            return panelOn() && id === 'drive' && !!look().panelRect;
        };
        const music = new Music(ctx, {
            shown: () => visible() && ((page === 0 && musicOnHub()) || page === 2),
            qrShown: () => visible() && ownNow && page === 2,
            openPage: () => press(2, 'sp:signin'),
        });
        /*
         * Touch on the hub: the Spotify bar's drag first (music.touch), then a horizontal swipe changes the
         * screen (more than SWIPE_START px mostly sideways to start, SWIPE_GO px on release; it stops at the
         * ends), and on G-force a finger held still HOLD_MS resets the peaks. Taking the gesture (true)
         * keeps the kit's tap targets from firing under a swipe or a hold.
         */
        // tg: the hub's last gesture as the favourite looks' tap sees it ({ moved: furthest px from the start,
        // swiped }), kept after the finger lifts: the kit fires a target after this handler's phase 3
        let sw = null, tg = null, toastMsg = null, autoJump = null, userSwiped = false, coldChecked = false, holdT = null;
        const say = (text, sub) => { toastMsg = { text, sub: sub || '', at: Date.now() }; };
        const endHold = () => { if (holdT) { clearTimeout(holdT); holdT = null; } };
        if (ctx.onTouch) ctx.onTouch((phase, x, y) => {
            if (page !== 0) { sw = null; tg = null; endHold(); return false; }
            if (phase === 1) tg = { x0: x, y0: y, moved: 0, swiped: false };
            else if (tg) tg.moved = Math.max(tg.moved, Math.abs(x - tg.x0), Math.abs(y - tg.y0));
            if (musicOnHub() && music.touch(phase, x, y)) { sw = null; if (tg) tg.swiped = true; endHold(); return true; }
            if (phase === 1) {
                sw = { x0: x, y0: y, on: false, held: false };
                endHold();
                if (HUB.SCREENS[scr][0] === 'gforce' && !(gRectNow && x >= gRectNow.x && y >= gRectNow.y)) {
                    holdT = setTimeout(() => {
                        holdT = null;
                        if (sw && !sw.on && page === 0 && HUB.SCREENS[scr][0] === 'gforce') { sw.held = true; reset(); log.info('peaks reset (long press)'); say('Peaks reset'); }
                    }, HOLD_MS);
                }
                return false;
            }
            if (!sw) return false;
            const dx = x - sw.x0, dy = y - sw.y0;
            if (Math.abs(dx) > HOLD_SLOP || Math.abs(dy) > HOLD_SLOP) endHold();
            if (phase === 2) {
                if (!sw.on && Math.abs(dx) > SWIPE_START && Math.abs(dx) > 1.5 * Math.abs(dy)) sw.on = true;
                if (tg && (sw.on || sw.held)) tg.swiped = true;
                return sw.on || sw.held;
            }
            // phase 3
            const was = sw; sw = null; endHold();
            if (tg && (was.on || was.held)) tg.swiped = true;
            if (was.on && Math.abs(dx) > SWIPE_GO) {
                const to = Math.max(0, Math.min(HUB.SCREENS.length - 1, scr + (dx < 0 ? 1 : -1)));
                if (to !== scr) { go(to); userSwiped = true; autoJump = null; }
            }
            return was.on || was.held;
        });
        /*
         * Favourite looks on Drive (0.10.0; 0.11.0: the gear only): a still tap on the gear (S.zones.gear) goes to the
         * next favourite, with a toast for LOOK_TOAST_MS; fewer than two favourites: a hint how to add them.
         * Ignored on a swipe or a moving finger (PREFS.stillTap) and while the shift lights build or flash.
         */
        const LOOK_TOAST_MS = PREFS.TOAST_MS;
        let lookToast = null;                // { lines, at, hint }
        const favTap = (S) => {
            if (!PREFS.stillTap(tg)) return;
            const d = car.data(), redline = num('redline', 6500), shift = redline - (Number(settings.get('shiftBefore')) || 0);
            if (PREFS.nearShift({ rpm: d.rpm, shift, range: 2000, strobe: L.isNum(d.rpm) && d.rpm >= shift })) return;
            const nx = PREFS.nextFav(favs(), look().id);
            if (!nx) { lookToast = { lines: PREFS.HINT, at: Date.now(), hint: true }; return; }
            settings.set('look', nx.id);
            log.info('look ' + nx.id + ' (favourite ' + nx.i + ' of ' + nx.n + ')');
            lookToast = { lines: PREFS.favToast(lookOf(nx.id).name, nx.i, nx.n), at: Date.now(), hint: false };
        };

        /** Everything a look draws from, for this frame. */
        function state(cv, t, reach) {
            const d = car.data(), now = Date.now();
            const redline = num('redline', 6500), shift = redline - (Number(settings.get('shiftBefore')) || 0);
            const oil = toF(d.oil), cool = toF(d.coolant), un = UNIT_PICK = UNITS.pick(settings);
            const oilThr = num('oilReady', OIL_READY_F), coolThr = num('coolantReady', COOLANT_READY_F);
            const strobe = L.isNum(d.rpm) && d.rpm >= shift;
            return {
                t, own: !!cv.own, x: 12, y: cv.own ? BOX_OWN : BOX_STD, w: 1576, h: cv.own ? reach - BOX_OWN - 6 : BOX_H, now,
                // speed in the unit shown (unit: its label); mph: always mph, for what moves with the speed (backgrounds)
                rpm: d.rpm, speed: UNITS.speed(d.speed, un.speed), mph: speedOf(d.speed), unit: UNITS.speedLabel(un.speed), imperial: un.speed === 'mph',
                speedMax: un.speed === 'kmh' ? 290 : 180, units: un,
                gear: d.gear, stage: d.stage, guessed: !!d.gearGuessed, gearText: L.gearText(d.gear, d.stage, d.program),
                redline, shift, range: 2000, maxRpm: Math.ceil((redline + 500) / 1000) * 1000,
                strobe, blink: Math.floor(now / 120) % 2 === 0, lightStyle: LIGHT_STYLE,
                gLat: d.gLat, gLong: d.gLong, gMax: Number(settings.get('gScale')) || 1.5,
                trail: trail.map((p) => [p[1], p[2]]),
                peak: { acc: peak.acc, brk: peak.brk, lat: peak.lat, rpm: peak.rpm, speed: UNITS.speed(peak.speed, un.speed) },
                // f: °F (the zones and thresholds); shown / unit: as the Units page says (°F or °C)
                oil: { f: oil, thr: oilThr, ok: warm('oil', oil, oilThr), kind: 'oil', shown: UNITS.tempNum(oil, un.temp), unit: UNITS.tempUnit(un.temp) },
                cool: { f: cool, thr: coolThr, ok: warm('coolant', cool, coolThr), kind: 'coolant', shown: UNITS.tempNum(cool, un.temp), unit: UNITS.tempUnit(un.temp) },
                demo: false, session: now - since,
                // a tap on a look's session clock (L.sessionTap): that clock back to 0:00 (the peaks stay), a flash
                sessionTap: cv.own ? () => { since = Date.now(); sessionAt = since; log.info('session clock reset (tap)'); } : null,
                sessionFlash: sessionAt && now - sessionAt < SESSION_FLASH_MS ? 1 - (now - sessionAt) / SESSION_FLASH_MS : 0,
                panel: PREFS.panelOf(settings.get('panel')),
                // the drive mode badge: a label only when the car sent a mode we could read (car.js MODE_LABEL)
                mode: d.driveMode || null, modeTone: L.modeTone(d.driveMode || null),
                d,
            };
        }

        /* ---------- the hub screens' data (hub.js) ---------- */
        // oil temperature history for the warm-up estimate: [t, degF], the last few minutes
        const oilHist = [];
        setInterval(() => {
            const d = car.data(), now = Date.now(), f = toF(d.oil);
            if (L.isNum(f)) { oilHist.push([now, f]); while (oilHist.length && now - oilHist[0][0] > 180000) oilHist.shift(); }
            // G-force history: combined g every HIST_MS / HIST_N, a gap (null) when nothing came
            const ok = L.isNum(d.gLat) && L.isNum(d.gLong) && Math.abs(d.gLat) < 3 && Math.abs(d.gLong) < 3;
            hist.push(ok ? Math.sqrt(d.gLat * d.gLat + d.gLong * d.gLong) : null);
            while (hist.length > HIST_N) hist.shift();
        }, HIST_MS / HIST_N);
        const eta = (f, thr) => {
            if (!L.isNum(f)) return 'No data';
            if (f >= thr) return 'Ready';
            if (oilHist.length < 2) return 'Warming up';
            const a = oilHist[0], b = oilHist[oilHist.length - 1], span = (b[0] - a[0]) / 1000, rate = span >= 30 ? (b[1] - a[1]) / span : 0;
            if (!(rate > 0.01)) return 'Warming up';
            const min = Math.ceil((thr - f) / rate / 60);
            return min <= 1 ? 'Almost there' : '~' + min + ' min to ready (est.)';
        };
        const fullRevsAt = () => num('oilFullRevs', OIL_FULL_F);
        /** The warm-up rev limit for an oil temperature (degF): null when there is none. */
        const revLimit = (oil) => {
            if (!L.isNum(oil)) return null;
            const full = fullRevsAt();
            if (oil >= full) return WARM_REDLINE;
            const f = Math.max(0, Math.min(1, (oil - COLD_F) / Math.max(1, full - COLD_F)));
            return Math.floor((COLD_RPM + (WARM_REDLINE - COLD_RPM) * f) / 250) * 250;
        };
        function warmModel(S) {
            const oil = L.isNum(S.oil.f) ? S.oil.f : null, cool = L.isNum(S.cool.f) ? S.cool.f : null;
            const ready = S.oil.ok === true && S.cool.ok === true;
            return {
                oil, cool, oilReady: S.oil.thr, coolReady: S.cool.thr, fullAt: fullRevsAt(), limit: revLimit(oil), ready,
                oilEta: eta(oil, S.oil.thr), coolEta: cool === null ? 'No data' : cool >= S.cool.thr ? 'Ready' : 'Warming up',
                auto: !!autoJump, tu: S.units ? S.units.temp : 'f',
                countdown: autoJump && autoJump.readyAt ? Math.max(0, Math.ceil((AUTO_MS - (Date.now() - autoJump.readyAt)) / 1000)) : 5,
            };
        }
        const mmss = (ms) => { const s2 = Math.floor(ms / 1000); return Math.floor(s2 / 60) + ':' + (s2 % 60 < 10 ? '0' : '') + (s2 % 60); };
        function gModel(S) {
            // the envelope: per direction the furthest reach, widened a little to its neighbours (a hull)
            const e = [];
            for (let i = 0; i < ENV_N; i++) {
                let m = 0;
                for (let k = -3; k <= 3; k++) { const j = (i + k + ENV_N) % ENV_N, c = Math.cos(k * 2 * Math.PI / ENV_N); m = Math.max(m, env[j] * c); }
                e.push(m);
            }
            const h = hist.slice();
            while (h.length < HIST_N) h.unshift(null);
            return {
                lat: L.isNum(S.gLat) ? S.gLat : null, long: L.isNum(S.gLong) ? S.gLong : null, trail: S.trail, envelope: e, history: h,
                session: mmss(S.session), live: gSeen, peak: { acc: peak.acc, brk: peak.brk, left: peak.left, right: peak.right },
            };
        }
        function tireModel(S) {
            const ty = S.d.tyres || null, now = Date.now(), M = { tires: {}, units: S.units || UNITS.DEFAULTS };
            [['fl', 'FLH'], ['fr', 'FRH'], ['rl', 'RLH'], ['rr', 'RRH']].forEach((w) => {
                const g = (o) => (ty && o && L.isNum(o[w[1]]) ? o[w[1]] : null);
                M.tires[w[0]] = { p: g(ty && ty.p), t: g(ty && ty.t), target: g(ty && ty.target) };
            });
            const any = ty && ty.at && Object.keys(M.tires).some((k) => M.tires[k].p !== null || M.tires[k].t !== null);
            M.fresh = any ? 'TPMS  /  updated ' + Math.max(0, Math.round((now - ty.at) / 1000)) + ' s ago' : 'TPMS  /  no data yet';
            return M;
        }

        // auto-jump: a cold start (the first oil reading, within the first minute, below "oil ready")
        // opens Warm-up; once READY, Drive opens AUTO_MS later with a toast. A swipe cancels it.
        const bootAt = Date.now();
        function autoStep(S) {
            const now = Date.now();
            if (!coldChecked) {
                if (L.isNum(S.oil.f)) {
                    coldChecked = true;
                    if (S.oil.f < S.oil.thr && !userSwiped && now - bootAt < 60000) {
                        go(SCR('warmup')); autoJump = { readyAt: 0 };
                        log.info('cold start (oil ' + Math.round(S.oil.f) + '°F): Warm-up');
                    }
                } else if (now - bootAt > 60000) coldChecked = true;
            }
            if (!autoJump) return;
            if (userSwiped || page !== 0) { if (userSwiped) autoJump = null; return; }
            const ready = S.oil.ok === true && S.cool.ok === true;
            if (!ready) { autoJump.readyAt = 0; return; }
            if (!autoJump.readyAt) autoJump.readyAt = now;
            if (now - autoJump.readyAt >= AUTO_MS) {
                autoJump = null; go(SCR(HUB.HOME));
                say('Engine warm', 'Switched from Warm-up');
                log.info('warm: Drive');
            }
        }

        /** The G button: the G badge on a quiet plate, in the look's own style when it has one (lk.gButton). */
        function gButton(cv, t, lk, r, lit, down) {
            if (lk.gButton) { lk.gButton(cv, t, r, lit, down); return; }
            const rad = lk.ui.radius, acc = t.sel || t.accent;
            cv.roundRect(r.x, r.y, r.w, r.h, rad, down ? L.withAlpha(acc, 0.28) : lit ? L.withAlpha(acc, 0.16) : L.withAlpha('#ffffff', 0.04));
            cv.strokeRoundRect(r.x, r.y, r.w, r.h, rad, lit || down ? 2 : 1, lit || down ? acc : L.withAlpha('#ffffff', 0.12));
            const h = down ? 28 : 30, bw = L.badgeWidth(h);
            L.badge(cv, r.x + (r.w - bw) / 2, r.y + (r.h + h) / 2, h, lk.badgeLetter);
        }

        /**
         * A page's header row. Sub pages (backTo 1): "< Options" at the left, then the page's name; Options
         * itself: its name at the left. Every Options page (0.10.0): the Dash button at the top right, lit in
         * the look's accent (the G and DASH; back to the dash), the version dim to its left.
         */
        function header(cv, S, lk, lbl, card, title, backTo) {
            const t = S.t, u = lk.ui, by = HEAD_Y, cy = by + HEAD_H / 2;
            let tx = S.x;
            if (backTo) {
                const bx = S.x, bw = 210;
                card(cv, t, bx, by, bw, HEAD_H, isDown('back'));
                cv.line(bx + 36, cy - 11, bx + 24, cy, 3, t.text);
                cv.line(bx + 24, cy, bx + 36, cy + 11, 3, t.text);
                cv.text(u.upper ? 'OPTIONS' : 'Options', bx + 52, cy + 9, u.size + 4, t.text, { font: u.txt, spacing: u.upper ? u.spacing : 0, literal: true });
                cv.target(bx, by, bw, HEAD_H, () => press(backTo, 'back'), 'back', u.radius);
                tx = bx + bw + 32;
            }
            lbl(title || 'Options', tx, cy + 11, 30, t.text);
            const dr = { x: S.x + S.w - DASH_W, y: by, w: DASH_W, h: HEAD_H };
            lbl("G's Dash" + (VERSION ? ' ' + VERSION : ''), dr.x - 24, cy + 7, 16, t.dim, { align: 'right' });
            dashButton(cv, t, lk, card, dr, isDown('dash'));
            cv.target(dr.x, dr.y, dr.w, dr.h, () => press(0, 'dash'), 'dash', u.radius);
        }
        /** The Dash button: the look's card, lit; the G badge and DASH. */
        function dashButton(cv, t, lk, card, r, down) {
            const u = lk.ui, acc = t.sel || t.accent;
            card(cv, t, r.x, r.y, r.w, r.h, true);
            if (down) cv.roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, u.radius, L.withAlpha(acc, 0.3));
            const bh = 30, bw = L.badgeWidth(bh), f = { font: u.txt, spacing: u.upper ? u.spacing : 2, literal: true };
            const lw = cv.textWidth('DASH', u.size + 6, f), x = r.x + (r.w - bw - 18 - lw) / 2;
            L.badge(cv, x, r.y + (r.h + bh) / 2, bh, lk.badgeLetter);
            cv.text('DASH', x + bw + 18, r.y + r.h / 2 + 10, u.size + 6, t.text, f);
        }

        /* ---------- Options (the G) and Theme ---------- */
        // the look gallery's card size: the same on Options (the current look) and Theme (all), so each
        // card is drawn once (cardImage)
        const TILE_W = 208, TILE_H = 190, ROW_H = 64, ROW_GAP = 19;
        const valueText = (u, s2) => (u.upper ? s2.toUpperCase() : s2);
        /** A chevron (>) at (x, y), size k. */
        const chevron = (cv, x, y, k, c) => { cv.line(x - k / 2, y - k, x + k / 2, y, 2.5, c); cv.line(x + k / 2, y, x - k / 2, y + k, 2.5, c); };
        /** A row's two lines: the setting (small, dim), its value (larger); sub: a dim note after the value. */
        function rowText(cv, S, lk, x, y, w, h, label, value, opts) {
            const t = S.t, u = lk.ui, o = opts || {};
            const lbl = lblOf(cv, u);
            lbl(label, x + 18, y + 24, Math.round(u.size * 0.72), t.dim);
            const vf = { font: u.txt, spacing: u.upper ? u.spacing * 0.6 : 0, literal: true };
            let vs = u.size + 2;
            // o.shrink: a smaller size (down to 15) before the text is cut
            if (o.shrink) while (vs > 15 && cv.textWidth(valueText(u, value), vs, vf) > w - 36) vs--;
            const v = fitText(cv, valueText(u, value), vs, w - 36, vf);
            cv.text(v, x + 18, y + h - 12, vs, o.warn ? t.crit : t.text, vf);
            if (o.sub) cv.text(valueText(u, o.sub), x + 18 + cv.textWidth(v, vs, vf) + 12, y + h - 13, 14, t.dim, { font: u.lbl || u.txt, spacing: u.upper ? u.spacing : 0, literal: true });
        }
        /**
         * A number setting as a row with - and + (each the row's full height, 76 page px wide, ~88 x 75
         * screen px): one step down / up the setting's steps (app.json), stopping at the ends.
         */
        function stepRow(cv, S, lk, x, y, w, h, row) {
            const t = S.t, u = lk.ui, card = cardOf(lk), key = row[0], it = settings.item(key) || {};
            const steps = it.steps || [], v = Number(settings.get(key));
            let i = steps.indexOf(v);
            if (i < 0) i = steps.reduce((b, s2, k) => (Math.abs(s2 - v) < Math.abs(steps[b] - v) ? k : b), 0);
            const bw = 76;
            card(cv, t, x, y, w, h, false);
            rowText(cv, S, lk, x, y, w - 2 * bw, h, row[1], row[2](settings.get(key)), { sub: it.markDefault && v === it.default ? 'default' : '' });
            [[-1, x + w - 2 * bw], [1, x + w - bw]].forEach((b) => {
                const to = i + b[0], ok = to >= 0 && to < steps.length, bx = b[1], cx = bx + bw / 2, cy = y + h / 2, k2 = 'st:' + key + (b[0] < 0 ? '-' : '+');
                cv.fillRect(bx, y + 12, 1, h - 24, L.withAlpha('#ffffff', 0.12));
                if (isDown(k2)) cv.roundRect(bx + 4, y + 4, bw - 8, h - 8, u.radius, L.withAlpha(t.sel || t.accent, 0.28));
                const c = ok ? t.text : L.withAlpha(t.dim, 0.4);
                cv.line(cx - 12, cy, cx + 12, cy, 3, c);
                if (b[0] > 0) cv.line(cx, cy - 12, cx, cy + 12, 3, c);
                if (ok) cv.target(bx, y, bw, h, () => { gDown = Date.now(); downKey = k2; settings.set(key, steps[to]); }, k2, u.radius);
            });
        }
        /** A small glyph for an Options entry (theme, cluster, engine, g, spotify, diag). */
        function entryIcon(cv, kind, cx, cy, c, acc) {
            if (kind === 'theme') { cv.arc(cx, cy, 24, 28, 200, 540, c); cv.line(cx, cy, cx + 14, cy - 12, 3, acc); cv.circle(cx, cy, 4, c); }
            else if (kind === 'cluster') {
                cv.arc(cx - 15, cy - 4, 13, 16, 0, 360, c); cv.arc(cx + 15, cy - 4, 13, 16, 0, 360, c);
                cv.line(cx - 15, cy - 4, cx - 9, cy - 11, 2.5, acc); cv.line(cx + 15, cy - 4, cx + 21, cy - 11, 2.5, acc);
                cv.roundRect(cx - 12, cy + 17, 24, 4, 2, acc);
            } else if (kind === 'engine') {
                cv.roundRect(cx - 5, cy - 24, 10, 34, 5, c); cv.circle(cx, cy + 14, 10, c); cv.circle(cx, cy + 14, 5, acc); cv.roundRect(cx - 2, cy - 6, 4, 18, 2, acc);
                [-16, -8, 0].forEach((d) => cv.line(cx + 10, cy + d, cx + 17, cy + d, 2, c));
            } else if (kind === 'g') { cv.arc(cx, cy, 24, 26, 0, 360, c); cv.arc(cx, cy, 11, 13, 0, 360, c); cv.circle(cx + 8, cy - 6, 6, acc); }
            else if (kind === 'units') {
                // 0.13.6: a ruler (its ticks) under a two-way swap arrow
                cv.strokeRoundRect(cx - 25, cy + 2, 50, 18, 3, 2.5, c);
                [-15, -5, 5, 15].forEach((d, k) => cv.line(cx + d, cy + 2, cx + d, cy + (k % 2 ? 9 : 13), 2, c));
                cv.line(cx - 20, cy - 16, cx + 20, cy - 16, 3, acc); cv.line(cx + 20, cy - 16, cx + 12, cy - 23, 3, acc);
                cv.line(cx - 20, cy - 8, cx + 20, cy - 8, 3, acc); cv.line(cx - 20, cy - 8, cx - 12, cy - 1, 3, acc);
            }
            else if (kind === 'widget') {
                // 0.15.0: a widget tile with a play mark
                cv.strokeRoundRect(cx - 25, cy - 17, 50, 34, 7, 2.5, c);
                cv.quad([[cx - 6, cy - 10], [cx - 6, cy + 10], [cx + 10, cy], [cx + 10, cy]], acc);
            }
            else if (kind === 'spotify') [[-12, 30], [0, 44], [12, 22]].forEach((b) => cv.roundRect(cx + b[0] - 4, cy - b[1] / 2, 8, b[1], 4, c));
            else if (kind === 'diag') { cv.arc(cx, cy, 13, 15.5, 0, 360, c); cv.roundRect(cx - 1.5, cy - 7, 3, 9, 1.5, c); cv.circle(cx, cy + 6, 2, c); }
        }
        /** An Options entry: icon, title, one value line (tone: a dot before it), chevron; a tap opens page `to`. */
        function entry(cv, S, lk, x, y, w, h, key, icon, title, value, to, tone) {
            const t = S.t, u = lk.ui, acc = t.sel || t.accent;
            cardOf(lk)(cv, t, x, y, w, h, isDown(key));
            entryIcon(cv, icon, x + 50, y + h / 2, t.text, acc);
            const tx = x + 96, mw = w - 96 - 52, tf = { font: u.txt, spacing: u.upper ? u.spacing * 0.6 : 0, literal: true };
            cv.text(fitText(cv, valueText(u, title), u.size + 6, mw, tf), tx, y + h / 2 - 4, u.size + 6, t.text, tf);
            let vx = tx;
            if (tone) { cv.circle(tx + 6, y + h / 2 + 22, 6, tone); vx += 20; }
            cv.text(fitText(cv, value, 19, mw - (vx - tx)), vx, y + h / 2 + 29, 19, t.dim, { literal: true });
            chevron(cv, x + w - 28, y + h / 2, 10, t.dim);
            cv.target(x, y, w, h, () => press(to, key), key, u.radius);
        }
        const displaysLine = () => ({ skin: 'Cluster dials', hud: "G's Dash HUD", music: "G's Music lyrics on HUD", none: "Car's own dials & HUD" })[displays()];
        // 0.13.6: and the G-meter (its tile went; the same Driving page)
        const engineLine = () => { const r = num('redline', 6500); return 'Redline ' + r + ' \u00b7 shift ' + (r - (Number(settings.get('shiftBefore')) || 0)) + ' rpm \u00b7 G-meter ' + (Number(settings.get('gScale')) || 1.5).toFixed(1) + ' g'; };
        /** Something of ours in the cluster / HUD that should work does not: the renderer is missing or says no. */
        const clusterTrouble = () => {
            const bad = (v) => v.kind === 'none' || v.kind === 'error';
            return bad(clogo.view()) || (skinOn() && bad(cskin.view())) || (hudOn() && bad(hud.view()));
        };

        /**
         * Options (the G), 0.10.0. Left, "Look & displays": the Theme card (the look's own card, its name and
         * right panel; Change look opens Theme) and Cluster & HUD under it. Right: Driving (Engine & warm-up,
         * G-meter & session: both the Driving page), Music (Spotify) and a small Diagnostics entry.
         */
        function optionsPage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), card = cardOf(lk), acc = t.sel || t.accent;
            header(cv, S, lk, lbl, card, 'Options');
            const top = S.y + 34, gap = 32, lw = Math.round(S.w * 0.56), x0 = S.x, bottom = S.y + S.h;
            lbl('Look & displays', x0, S.y + 20, 18, t.dim);
            cv.roundRect(x0, top, lw, bottom - top, u.radius, L.withAlpha('#ffffff', 0.025));
            cv.strokeRoundRect(x0, top, lw, bottom - top, u.radius, 1, L.withAlpha('#ffffff', 0.10));
            // Theme
            const hx = x0 + 14, hy = top + 14, hw = lw - 28, hh = TILE_H + 28, down = isDown('opt:theme');
            card(cv, t, hx, hy, hw, hh, down);
            const im = cardImage(lk, LOOKS.indexOf(lk), TILE_W, TILE_H, cv.textScale || 1);
            if (im) cv.image(im, hx + 14, hy + 14, TILE_W, TILE_H);
            cv.strokeRoundRect(hx + 14, hy + 14, TILE_W, TILE_H, 10, 1, L.withAlpha('#ffffff', 0.12));
            const tx = hx + 14 + TILE_W + 32, mw = hx + hw - 60 - tx, tf = { font: u.txt, spacing: u.upper ? u.spacing * 0.6 : 0, literal: true };
            lbl('Theme', tx, hy + 48, Math.round(u.size * 0.8), t.dim);
            cv.text(fitText(cv, valueText(u, lk.name), u.size + 16, mw, tf), tx, hy + 98, u.size + 16, t.text, tf);
            if (lk.tints) tintRow(cv, S, lk, tx, hy + 110, 'opt');
            else cv.text(fitText(cv, 'Right panel: ' + PREFS.panelName(settings.get('panel')), 20, mw), tx, hy + 138, 20, t.dim, { literal: true });
            cv.roundRect(tx, hy + hh - 62, 260, 44, u.radius, L.withAlpha(acc, down ? 0.34 : 0.18));
            lbl('Change look', tx + 18, hy + hh - 33, u.size, t.text);
            chevron(cv, tx + 236, hy + hh - 40, 8, t.text);
            chevron(cv, hx + hw - 28, hy + hh / 2, 10, t.dim);
            cv.target(hx, hy, hw, hh, () => press(5, 'opt:theme'), 'opt:theme', u.radius);
            // Cluster & HUD: the source and your look on the car's displays (amber: something needs attention); beside it
            // Logo: the home-screen widget and the cluster graphic
            const cy = hy + hh + 14, ch = bottom - 14 - cy, ew = Math.floor((hw - 14) / 2);
            entry(cv, S, lk, hx, cy, ew, ch, 'opt:cluster', 'cluster', 'Cluster & HUD', gsdOn() ? 'Source ' + CSRC.NAMES[srcPick()] + ' \u00b7 ' + displaysLine() : "G's Dash off: the car is stock", 4,
                clusterTrouble() ? '#ffb020' : null);
            entry(cv, S, lk, hx + ew + 14, cy, hw - ew - 14, ch, 'opt:widget', 'widget', 'Logo', widgetLine(), 8);
            // right: Driving, Music, Diagnostics
            const rx = x0 + lw + gap, rw = S.x + S.w - rx, eh = 100, eg = 16, dh = 56;
            lbl('Driving', rx, S.y + 20, 18, t.dim);
            entry(cv, S, lk, rx, top, rw, eh, 'opt:engine', 'engine', 'Engine & warm-up', engineLine(), 6);
            // 0.13.6: Units where the G-meter tile was (its settings are on Driving, which Engine & warm-up opens)
            entry(cv, S, lk, rx, top + eh + eg, rw, eh, 'opt:units', 'units', 'Units', UNITS.summary(UNIT_PICK), 7);
            const sy = top + 2 * (eh + eg) + 22, dy = bottom - dh;
            lbl('Music', rx, sy - 10, 18, t.dim);
            entry(cv, S, lk, rx, sy, rw, Math.min(eh, dy - 14 - sy), 'opt:spotify', 'spotify', 'Spotify', music.statusLine(), 2);
            // Diagnostics: small and quiet, plainly labelled
            const dd = isDown('opt:diag');
            cv.roundRect(rx, dy, rw, dh, u.radius, L.withAlpha('#ffffff', dd ? 0.10 : 0.03));
            cv.strokeRoundRect(rx, dy, rw, dh, u.radius, 1, L.withAlpha('#ffffff', 0.10));
            entryIcon(cv, 'diag', rx + 32, dy + dh / 2, t.dim, t.dim);
            lbl('Diagnostics', rx + 62, dy + dh / 2 + 7, Math.round(u.size * 0.85), t.dim);
            cv.text('Tools, cluster, widgets', rx + rw - 48, dy + dh / 2 + 6, 16, L.withAlpha(t.dim, 0.8), { align: 'right', literal: true });
            chevron(cv, rx + rw - 24, dy + dh / 2, 8, t.dim);
            cv.target(rx, dy, rw, dh, () => { press(3, 'opt:diag'); }, 'opt:diag', u.radius);
        }
        const REFRESHED_MS = 2600;
        /** A plain row that opens a page (a label and a chevron). */
        function linkMini(cv, S, lk, x, y, w, h, key, label, fn) {
            const t = S.t, u = lk.ui;
            cardOf(lk)(cv, t, x, y, w, h, isDown(key));
            lblOf(cv, u)(label, x + 20, y + h / 2 + 7, u.size, t.text);
            chevron(cv, x + w - 26, y + h / 2, 9, t.dim);
            cv.target(x, y, w, h, fn, key, u.radius);
        }
        /** A five-point star at (cx, cy), radius r: filled (a favourite) or outlined. */
        function star(cv, cx, cy, r, on, c) {
            const pts = [];
            for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
            if (on) { for (let i = 0; i < 5; i++) cv.quad([[cx, cy], pts[(2 * i + 9) % 10], pts[2 * i], pts[2 * i + 1]], c); }
            else if (cv.polyline) cv.polyline(pts.concat([pts[0]]), 2.5, c);
        }

        /**
         * Driving (0.10.0): Engine & warm-up (five stepped rows) and G-meter & session (the scale, the session
         * peaks' reset: tap twice).
         */
        /**
         * Units (0.13.6, Options > Units): speed, temperature, pressure - each a row of choices (the current
         * one lit). Only what G's Dash shows changes: the zones and the Engine settings stay in °F, the car's
         * values as they come.
         */
        function unitsPage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), card = cardOf(lk), acc = t.sel || t.accent;
            header(cv, S, lk, lbl, card, 'Units', 1);
            const top = S.y + 34, bw = 236, bh = 64, g = 14, rh = 112, un = UNIT_PICK = UNITS.pick(settings);
            const ROWS = [['speed', 'Speed', { mph: 'Miles per hour', kmh: 'Kilometres per hour' }],
                ['temp', 'Temperature', { f: 'Fahrenheit', c: 'Celsius' }],
                ['press', 'Tire pressure', { psi: 'Pounds per sq in', bar: 'Bar', kpa: 'Kilopascals' }]];
            ROWS.forEach((r, k) => {
                const y = top + k * rh;
                lbl(r[1], S.x, y + 6, 18, t.dim);
                UNITS.CHOICES[r[0]].forEach((o, i) => {
                    const ox = S.x + i * (bw + g), oy = y + 20, on = un[r[0]] === o[0];
                    if (on) { cv.roundRect(ox, oy, bw, bh, u.radius, L.withAlpha(acc, 0.22)); cv.strokeRoundRect(ox, oy, bw, bh, u.radius, 3, acc); } else card(cv, t, ox, oy, bw, bh, false);
                    cv.text(fitText(cv, o[1], 24, bw - 28), ox + 16, oy + bh / 2 - 1, 24, on ? t.text : t.dim, { literal: true });
                    cv.text(fitText(cv, r[2][o[0]], 15, bw - 28), ox + 16, oy + bh / 2 + 21, 15, t.dim, { literal: true });
                    cv.target(ox, oy, bw, bh, () => {
                        if (settings.get(UNITS.KEYS[r[0]]) !== o[0]) { settings.set(UNITS.KEYS[r[0]], o[0]); UNIT_PICK = UNITS.pick(settings); log.info('units: ' + UNITS.summary(UNIT_PICK)); }
                    }, 'unit:' + r[0] + ':' + o[0], u.radius);
                });
            });
            // what it covers, right of the choices
            const nx = S.x + 3 * (bw + g) + 40, nw = S.x + S.w - nx;
            lbl('Shown in', nx, top + 6, 18, t.dim);
            ['Drive (every look), Warm-up, Tires,', 'the cluster skins\' speed dial and', 'readout, the full-screen cluster', 'test and the Settings list.', '',
                'Warm-up zones and the Engine settings', 'keep their values; only the unit shown', 'changes.']
                .forEach((l2, k) => { if (l2) cv.text(fitText(cv, l2, 17, nw), nx, top + 44 + k * 26, 17, t.dim, { literal: true }); });
        }
        function drivingPage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), card = cardOf(lk);
            header(cv, S, lk, lbl, card, 'Driving', 1);
            const top = S.y + 34, gap = 32, cw = (S.w - gap) / 2, slot = (k) => top + k * (ROW_H + ROW_GAP);
            lbl('Engine & warm-up', S.x, S.y + 20, 18, t.dim);
            ENGINE.forEach((r, k) => stepRow(cv, S, lk, S.x, slot(k), cw, ROW_H, r));
            const x2 = S.x + cw + gap;
            lbl('G-meter & session', x2, S.y + 20, 18, t.dim);
            stepRow(cv, S, lk, x2, slot(0), cw, ROW_H, GSCALE);
            const live = Date.now() - armed < 5000, ry = slot(1);
            card(cv, t, x2, ry, cw, ROW_H, false);
            rowText(cv, S, lk, x2, ry, cw - 170, ROW_H, live ? 'Tap again to confirm' : 'Session peaks', live ? 'Reset all peaks?' : 'All g and top peaks', { warn: live });
            const rb = { x: x2 + cw - 156, y: ry + 8, w: 144, h: ROW_H - 16 };
            if (live) { cv.roundRect(rb.x, rb.y, rb.w, rb.h, u.radius, L.withAlpha(t.crit || '#ff3b30', 0.3)); cv.strokeRoundRect(rb.x, rb.y, rb.w, rb.h, u.radius, 2, t.crit || '#ff3b30'); }
            else cv.roundRect(rb.x, rb.y, rb.w, rb.h, u.radius, L.withAlpha('#ffffff', 0.08));
            lbl(live ? 'Confirm' : 'Reset', rb.x + rb.w / 2, rb.y + rb.h / 2 + 8, u.size, t.text, { align: 'center' });
            cv.target(x2, ry, cw, ROW_H, () => {
                if (Date.now() - armed < 5000) { armed = 0; reset(); log.info('peaks reset'); say('Peaks reset'); } else armed = Date.now();
            }, 'opt:reset', u.radius);
            cv.text(fitText(cv, 'Hold a finger on the G-force screen to reset there too.', 17, cw), x2, slot(2) + 30, 17, t.dim, { literal: true });
        }

        /**
         * Colour: the look's variants (tints.js) as round swatches, the chosen one ringed in the look's
         * selection colour and ticked; each a 56 x 56 target (first target wins: drawn before the card's own).
         * compact: on the chosen gallery card (a dark pill, no label).
         */
        function tintRow(cv, S, lk, x, y, tag, compact) {
            // compact (a gallery card): a vertical pill down the card's left edge, clear of the star and the name
            const t = S.t, cur = tintOf(lk), list = lk.tints, step = compact ? 32 : 64, r = compact ? 11 : 17;
            if (compact) cv.roundRect(x, y, 34, list.length * step + 4, 17, L.withAlpha('#000000', 0.62));
            else cv.text(cur.name, x + list.length * step + 8, y + 25, 20, t.dim, { literal: true });
            list.forEach((v, i) => {
                const cx = compact ? x + 17 : x + r + 2 + i * step, cy = compact ? y + 2 + step / 2 + i * step : y + 18, on = v.id === cur.id;
                if (on) cv.arc(cx, cy, r + (compact ? 2 : 4), r + (compact ? 4 : 7), 0, 360, '#ffffff');
                if (v.swatch2) v.swatch2.forEach((c, k, a) => cv.arc(cx, cy, 0, r, -90 + 360 * k / a.length, -90 + 360 * (k + 1) / a.length, c));
                else cv.circle(cx, cy, r, v.swatch);
                cv.arc(cx, cy, r - 1, r, 0, 360, L.withAlpha('#000000', 0.5));
                if (on) { const k = compact ? 0.7 : 1; cv.line(cx - 6 * k, cy, cx - 2 * k, cy + 5 * k, 2.5 * k, '#000000'); cv.line(cx - 2 * k, cy + 5 * k, cx + 7 * k, cy - 6 * k, 2.5 * k, '#000000'); }
                const tw = compact ? step : 56;
                cv.target(cx - tw / 2, cy - tw / 2, tw, tw, () => { settings.set(TINTS.KEY, TINTS.set(settings.get(TINTS.KEY), lk.id, v.id)); }, tag + ':tint:' + v.id, tw / 2);
            });
        }

        /**
         * Theme: the looks as a gallery of cards, each drawn in its own look (a tap switches at once, the
         * page itself redraws in it), and the right panel on Drive: the g-meter and peaks, or Spotify.
         * 0.10.0: a star on each card (its own 64 x 64 target, top right) makes it a favourite; the
         * favourites' column says how they switch on Drive; Cluster & HUD at its foot.
         */
        function themePage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), card = cardOf(lk), acc = t.sel || t.accent, cur = lk.id;
            header(cv, S, lk, lbl, card, 'Theme', 1);
            // six looks: 3 x 2 (0.9.0); seven or eight: 4 x 2 (0.14.0); nine or ten: 5 x 2 in the same width (0.19.0)
            const x0 = S.x, top = S.y + 34, cols = LOOKS.length > 8 ? 5 : LOOKS.length > 6 ? 4 : 3, g = 14;
            const TILE_W = cols > 4 ? Math.floor((4 * 170 + 3 * g - (cols - 1) * g) / cols) : cols > 3 ? 170 : 208;
            const fl = favs(), ids = LOOKS.map((l) => l.id);
            lbl('Look', x0, S.y + 20, 18, t.dim);
            LOOKS.forEach((l, i) => {
                const cx = x0 + (i % cols) * (TILE_W + g), cy = top + Math.floor(i / cols) * (TILE_H + g), on = l.id === cur;
                // each card in its own look (background, motif, name in its own type): a picture drawn once
                // in software (cardImage), so the other looks' big fonts never reach the renderer's glyph texture
                const im = cardImage(l, i, TILE_W, TILE_H, cv.textScale || 1);
                if (im) cv.image(im, cx, cy, TILE_W, TILE_H);
                // the chosen one: a ring in this (the current) look's selection colour and a tick
                if (on) {
                    cv.strokeRoundRect(cx - 4, cy - 4, TILE_W + 8, TILE_H + 8, 14, 3, acc);
                    const kx = cx + TILE_W - 30, ky = cy + TILE_H - 32;
                    cv.circle(kx, ky, 14, acc);
                    cv.line(kx - 7, ky, kx - 2, ky + 6, 3, t.selText || '#ffffff');
                    cv.line(kx - 2, ky + 6, kx + 7, ky - 6, 3, t.selText || '#ffffff');
                } else cv.strokeRoundRect(cx, cy, TILE_W, TILE_H, 10, 1, L.withAlpha('#ffffff', 0.12));
                // the favourite star: its target first (the first target that matches wins)
                if (on && l.tints) tintRow(cv, S, l, cx + 8, cy + 10, 'th', true);
                const fav = fl.indexOf(l.id) >= 0, sx = cx + TILE_W - 30, sy = cy + 30;
                cv.circle(sx, sy, 22, L.withAlpha('#000000', 0.55));
                if (!fav) cv.arc(sx, sy, 21, 22.5, 0, 360, L.withAlpha('#ffffff', 0.25));
                star(cv, sx, sy, 14, fav, fav ? STAR : L.withAlpha('#ffffff', 0.8));
                cv.target(sx - 32, sy - 32, 64, 64, () => {
                    settings.set(PREFS.FAV_KEY, PREFS.serializeFavs(PREFS.toggleFav(favs(), l.id, ids)));
                    log.info('favourite looks: ' + (settings.get(PREFS.FAV_KEY) || 'none'));
                }, 'fav:' + l.id, 32);
                cv.target(cx, cy, TILE_W, TILE_H, () => { settings.set('look', l.id); }, 'look:' + l.id, 10);
            });
            // the right panel: two choices, the current one lit
            const px = x0 + cols * TILE_W + (cols - 1) * g + 40, fcw = cols > 3 ? 330 : 400, pw = S.x + S.w - px - fcw - 32, ph = 72;
            lbl('Right panel on Drive', px, S.y + 20, 18, t.dim);
            [['g', 'G-meter', 'Live g-meter and session peaks'], ['spotify', 'Spotify', 'What plays, with touch controls'], ['logo', 'Logo', 'The same Logo as the widget and cluster']].forEach((o, i) => {
                const oy = top + i * (ph + g), on = PREFS.panelOf(settings.get('panel')) === o[0];
                if (on) { cv.roundRect(px, oy, pw, ph, u.radius, L.withAlpha(acc, 0.22)); cv.strokeRoundRect(px, oy, pw, ph, u.radius, 3, acc); } else card(cv, t, px, oy, pw, ph, false);
                // a small glyph: rings for the g-meter, three bars for Spotify, three stripes for the Logo
                const gx = px + 44, gy = oy + ph / 2, c = on ? t.text : t.dim;
                if (o[0] === 'g') { cv.arc(gx, gy, 24, 26, 0, 360, c); cv.arc(gx, gy, 11, 13, 0, 360, c); cv.circle(gx + 8, gy - 5, 5, on ? acc : c); }
                else if (o[0] === 'logo') [0, 1, 2].forEach((k) => cv.roundRect(gx - 16 + k * 12, gy - 16, 8, 32, 2, c));
                else [[-14, 30], [0, 44], [14, 22]].forEach((b) => cv.roundRect(gx + b[0] - 4, gy - b[1] / 2, 8, b[1], 4, c));
                lbl(o[1], px + 84, oy + 34, u.size + 2, t.text);
                cv.text(fitText(cv, o[2], 16, pw - 100), px + 84, oy + 56, 16, t.dim, { literal: true });
                cv.target(px, oy, pw, ph, () => settings.set('panel', o[0]), 'panel:' + o[0], u.radius);
            });
            // favourite looks: their own column, and Cluster & HUD at its foot
            const fx = px + pw + 32, fh = 2 * 112 + g, tf = { font: u.txt, spacing: u.upper ? u.spacing * 0.6 : 0, literal: true };
            lbl('Favourite looks', fx, S.y + 20, 18, t.dim);
            card(cv, t, fx, top, fcw, fh, false);
            star(cv, fx + 34, top + 44, 14, true, STAR);
            const names = fl.map((id) => lookOf(id).name).join(' + ') || 'None yet';
            cv.text(fitText(cv, valueText(u, names), u.size + 4, fcw - 76, tf), fx + 60, top + 53, u.size + 4, t.text, tf);
            ['Tap the gear on Drive to', 'switch between them.', '', 'Star a look (top-right of its', 'card) to add it; 2 or more.'].forEach((l2, k) => {
                if (l2 && top + 100 + k * 26 < top + fh - 8) cv.text(fitText(cv, l2, 18, fcw - 48), fx + 24, top + 100 + k * 26, 18, k < 2 ? t.text : t.dim, { literal: true });
            });
            linkMini(cv, S, lk, fx, S.y + S.h - 64, fcw, 64, 'th:cluster', 'Cluster & HUD', () => { ask = null; press(4, 'th:cluster'); });
        }

        /*
         * A look's gallery card as a picture: recorded at the page's scale, played into a software canvas
         * at the pixels it is shown at (record.play), uploaded once (record.setImage). Redrawn only when
         * its size or scale changes.
         */
        const cards = {};
        function cardImage(l, i, cw, ch, sc) {
            const key = [Math.round(cw), Math.round(ch), sc, TINTS.key(l.id, settings.get(TINTS.KEY))].join('|');
            const id = IMG.card + i;
            if (cards[l.id] === key) return id;
            tinted(l);
            try {
                const lt = typeof l.palette === 'function' ? l.palette(settings) : l.palette;
                const r = new record.Recorder(Math.ceil(cw), Math.ceil(ch), { textScale: sc });
                if (l.cardBg) l.cardBg(r, lt, 0, 0, cw, ch); else r.roundRect(0, 0, cw, ch, 10, lt.bg);
                l.swatch(r, lt, 0, 6, cw, ch - 74);
                const nu = l.ui;
                const nm = nu.upper ? l.name.toUpperCase() : l.name, nsz = nu.nameSize || 26, nf = { font: nu.nameFont || nu.txt, spacing: nu.upper ? nu.spacing : 0, literal: true };
                // the name: at the left, or centred (ui.nameAlign 'center', 0.9.0) on the looks whose swatch is
                // centred (GT, Sim Racing, Lumen); the chosen card's tick (bottom right) still clears it
                // narrow cards (five a row, 0.19.0): less room kept for the chosen card's tick, smaller type allowed
                const narrow = cw < 150, mid = nu.nameAlign === 'center', room = mid ? cw - 2 * (narrow ? 26 : 48) : cw - (narrow ? 52 : 70);
                const nw = r.textWidth(nm, nsz, nf), fs = nw > room ? Math.max(narrow ? 12 : 16, Math.floor(nsz * room / nw)) : nsz;
                r.text(nm, mid ? cw / 2 : narrow ? 12 : 16, ch - 22, fs, lt.text, mid ? Object.assign({ align: 'center' }, nf) : nf);
                const W = Math.min(1024, Math.round(cw * sc)), H = Math.min(1024, Math.round(ch * sc));
                const c = new Canvas(W, H);
                record.play(r.words(), c, W / cw);
                record.setImage(id, W, H, c.d);
                cards[l.id] = key;
            } catch (e) { log.warn('gallery card ' + l.id + ': ' + (e.stack || e)); cards[l.id] = key; }
            return id;
        }

        const lblOf = (cv, u) => (s, x, y, size, c, o) => cv.text(u.upper ? s.toUpperCase() : s, x, y, size, c, Object.assign({ font: u.lbl || u.txt, spacing: u.upper ? u.spacing : 0, literal: true }, o || {}));
        const cardOf = (lk) => lk.card || ((c, th, x, y, w, h, on) => {
            c.roundRect(x, y, w, h, lk.ui.radius, on ? L.withAlpha(th.sel || th.accent, 0.16) : L.withAlpha('#ffffff', 0.05));
            c.strokeRoundRect(x, y, w, h, lk.ui.radius, on ? 2.5 : 1, on ? th.sel || th.accent : L.withAlpha('#ffffff', 0.14));
        });

        /** The Spotify page: sign-in with the phone, state, refresh rate (music.js). */
        function spotifyPage(cv, S, lk) {
            header(cv, S, lk, lblOf(cv, lk.ui), cardOf(lk), 'Spotify', 1);
            music.page(cv, S, lk, { x: S.x, y: S.y, w: S.w - 0, h: S.h });
        }

        /*
         * The installed tools' versions (0.10.0, Diagnostics): the store installs a tool as /var/opt/<tool>/current
         * -> versions/<version>; read again every TOOL_READ_MS.
         */
        const TOOLS = [['cluster-render', 'Cluster renderer'], ['waze-on-cluster', 'Waze on cluster']];
        const TOOL_READ_MS = 5000;
        let toolSeen = null, toolAt = -1e15;
        function toolVersion(id) {
            const dir = path.join('/var/opt', id), cur = path.join(dir, 'current');
            try {
                const m = /versions\/([^/]+)\/?$/.exec(fs.readlinkSync(cur));
                if (m) return m[1];
            } catch (e) { /* not a link */ }
            for (const f of ['component.json', 'app.json']) {
                try { const v = JSON.parse(fs.readFileSync(path.join(cur, f), 'utf8')).version; if (v) return String(v); } catch (e) { /* none */ }
            }
            return fs.existsSync(dir) ? 'installed' : 'not installed';
        }
        const tools = () => {
            const now = Date.now();
            if (now - toolAt >= TOOL_READ_MS) { toolAt = now; toolSeen = TOOLS.map((x) => [x[1], toolVersion(x[0])]); }
            return toolSeen;
        };
        /**
         * 0.13.2: Remote logs (Diagnostics card): encrypted crash logs (kit remotelog.js), sent only after a crash
         * or with Send logs now, and only with a drop installed on the unit (else 'Not set up'). The status is
         * read at most every 2 s; sending runs in the background.
         */
        const rlog = ctx.remoteLog || null;
        if (rlog && rlog.share) { try { rlog.share(); } catch (e) {} }
        if (rlog && rlog.context) rlog.context('cluster', () => ({ logo: clogo.view().text, skins: skinOn() ? cskin.view().text : 'off', hud: hudOn() ? hud.view().text : 'off',
            refusals: [cskin.refusal(), hud.refusal(), fcl.refusal()].filter(Boolean), fullScreenTest: fcTest, source: srcPick(), look: look().id,
            // 0.14.2: Waze on cluster's own state (its status file and the patch switch) and the renderer crash guards
            waze: (() => { try { const mn = cmap.mapNow(), mv = cmap.view(); return { map: mn.state + (mn.reason ? ' (' + mn.reason + ')' : ''), patch: mv.value + (mv.line ? ' - ' + mv.line : ''), note: mv.note || '' }; } catch (e) { return { error: String(e.message || e) }; } })(),
            crashGuard: { hud: (hud.guard.crashed ? 'off' : hud.guard.strikes + ' strikes'), skins: (cskin.guard.crashed ? 'off' : cskin.guard.strikes + ' strikes') } }));
        // 0.13.8: the ring's health lines every 10 s while the HUD, the dials or the full-screen test is up (else every minute)
        if (rlog && rlog.active) rlog.active(() => !!(hud.cr || cskin.cr || fcl.cr));
        let rlSeen = { at: 0, v: null }, rlAsked = 0;
        const rlStatus = () => {
            if (!rlog) return { setup: 'none', on: false, lastSent: null, pending: 0, others: [] };
            if (Date.now() - rlSeen.at > 2000) { try { rlSeen = { at: Date.now(), v: rlog.status() }; } catch (e) { rlSeen = { at: Date.now(), v: { setup: 'none', on: false, others: [] } }; } }
            return rlSeen.v;
        };
        const rlWhen = (at) => {
            const d = new Date(at), n = new Date(), hm = clock.fmt ? clock.fmt(d) : (d.getHours() % 12 || 12) + ':' + ('0' + d.getMinutes()).slice(-2) + (d.getHours() < 12 ? ' AM' : ' PM');
            return d.toDateString() === n.toDateString() ? hm : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
        };
        let diagView = 'cluster';           // Diagnostics: 'cluster', 'widgets' or 'audio'
        /*
         * Diagnostics > Audio (0.16.2): what the unit offers an app for sound (kit/runtime/audio_probe.js, read-only:
         * files only), for G's TV's sound: the generic media players BMW's app manager names for apps, the
         * MediaPlayer / CommandControl interfaces, the interface catalog's MediaPlayer entry and the Media menu's
         * sources. G's TV's More page has the other half (what its install was granted, whether the player answers).
         * On a tap; the report goes to <data>/audio.txt.
         */
        let au = null;
        const auRun = () => {
            const c = AP.configs();
            au = { c, at: Date.now() };
            try { fs.writeFileSync(path.join(ctx.dataDir, 'audio.txt'), AP.text({ configs: c })); } catch (e) { log.warn('audio: report not saved (' + e.message + ')'); }
            log.info('audio: ' + Object.keys(c.files).map((k) => k + ' ' + c.files[k]).join(', ') + '; media players: ' + (c.mediaPlayer || []).map((e) => e[0] + '=' + JSON.stringify(e[1]).slice(0, 60)).join(', ') + '; ' + (c.sources || []).length + ' sources');
        };
        /*
         * Diagnostics > Widgets (0.16.1): how the HMI builds its home-screen widget layouts, read from the unit
         * (kit/runtime/hmi_widgets.js, read-only). Only on a tap: it reads HmiMain3D (in pages) and the HMI's *.pbw
         * files, and says for every widget layout whether it shows a picture an app can write, and whether the HMI
         * draws that picture through a mask (the dark edge over G's Dash's widget) or a plain image. The full report
         * goes to <data>/hmi_widgets.txt and a summary line to the log.
         */
        const hw = { running: false, progress: '', r: null };
        const hwRun = () => {
            if (hw.running) return;
            hw.running = true; hw.progress = 'Starting...'; hw.r = null;
            let p;
            try { p = HMIW.scan({ onProgress: (s2) => { hw.progress = s2; } }); } catch (e) { p = Promise.reject(e); }
            Promise.resolve(p).then((r) => {
                hw.running = false;
                hw.r = r && r.layouts ? r : { ok: false, error: (r && r.error) || 'No report.', layouts: [], denied: (r && r.denied) || [], files: 0, ms: (r && r.ms) || 0 };
                try { fs.writeFileSync(path.join(ctx.dataDir, 'hmi_widgets.txt'), HMIW.text(hw.r)); } catch (e) { log.warn('hmi widgets: report not saved (' + e.message + ')'); }
                if (!hw.r.ok) { log.warn('hmi widgets: ' + hw.r.error + (hw.r.denied && hw.r.denied.length ? ' [' + hw.r.denied.join('; ') + ']' : '')); return; }
                const plain = hw.r.layouts.filter((l) => l.verdict === 'plain');
                log.info('hmi widgets: ' + hw.r.ids + ' identifiers, ' + hw.r.files + ' files, ' + hw.r.layouts.length + ' widget layouts in ' + hw.r.ms + ' ms; a picture without a mask: ' +
                    (plain.map((l) => l.name + ' (' + Object.keys(l.cells || {}).join(', ') + ')').join('; ') || 'none'));
            }, (e) => {
                hw.running = false;
                hw.r = { ok: false, error: "Couldn't read the widget layouts (" + (e && e.message || e) + ').', layouts: [], denied: [], files: 0, ms: 0 };
                log.warn('hmi widgets: ' + hw.r.error);
            });
        };
        /**
         * Diagnostics (Options > Diagnostics). Cluster, Widgets or Audio, picked at the top. Cluster: the tools
         * and their versions, what the logo / skins / HUD are doing and the renderer's whole refusals, Waze on
         * cluster's state, Refresh cluster, the clock's source; parked, the alignment card and the Stock redraw.
         */
        function diagPage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), acc = t.sel || t.accent;
            header(cv, S, lk, lbl, cardOf(lk), 'Diagnostics', 1);
            // the view switch, in the header row after the title
            const sx0 = S.x + 210 + 32 + cv.textWidth(u.upper ? 'DIAGNOSTICS' : 'Diagnostics', 30, { font: u.lbl || u.txt, spacing: u.upper ? u.spacing : 0, literal: true }) + 40;
            if (diagView !== 'cluster' && diagView !== 'widgets' && diagView !== 'audio') diagView = 'cluster';
            [['cluster', 'Cluster'], ['widgets', 'Widgets'], ['audio', 'Audio']].forEach((v, i) => {
                const bw = 160, bx = sx0 + i * (bw + 8), on = diagView === v[0];
                if (on) { cv.roundRect(bx, HEAD_Y + 6, bw, HEAD_H - 12, u.radius, L.withAlpha(acc, 0.22)); cv.strokeRoundRect(bx, HEAD_Y + 6, bw, HEAD_H - 12, u.radius, 2, acc); }
                else cv.roundRect(bx, HEAD_Y + 6, bw, HEAD_H - 12, u.radius, L.withAlpha('#ffffff', 0.06));
                lbl(v[1], bx + bw / 2, HEAD_Y + HEAD_H / 2 + 8, u.size, on ? t.text : t.dim, { align: 'center' });
                if (!on) cv.target(bx, HEAD_Y, bw, HEAD_H, () => { diagView = v[0]; }, 'dv:' + v[0], u.radius);
            });
            if (diagView === 'widgets') widgetsDiag(cv, S, lk); else if (diagView === 'audio') audioDiag(cv, S, lk); else clusterDiag(cv, S, lk);
        }
        /**
         * Diagnostics > Widgets: left, what this reads and the Read button; right, the widget layouts that show a
         * picture: plain first (green: the picture without the dark edge), then masked (amber), the cell to write.
         */
        /**
         * Diagnostics > Audio: left, BMW's app manager's media players for apps and the interfaces (the Read button
         * below); right, the Media menu's sources as mediaapp defines them.
         */
        function audioDiag(cv, S, lk) {
            const t = S.t, u = lk.ui, top = S.y, LH = 25, lw = Math.round(S.w * 0.5), rx = S.x + lw + 16, rw = S.x + S.w - rx, c = au && au.c;
            const put = (x, y, w, s2, col, size) => cv.text(fitText(cv, s2, size || 18, w), x, y, size || 18, col || t.text, { literal: true });
            diagBox(cv, S.x, top, lw, S.h);
            let y = top + 32;
            cv.text('Sound for apps', S.x + 16, y, 21, t.accent2 || t.accent, { font: 'bold', literal: true }); y += 30;
            const bh = 60, by = top + S.h - bh - 14, room = (yy) => yy < by - 10;
            if (!c) ['What BMW\'s app manager offers apps for sound, its', 'media-player interface, and the Media menu\'s sources.',
                'Read-only. G\'s TV > More shows what it was granted.'].forEach((l2) => { put(S.x + 16, y, lw - 32, l2, t.dim, 17); y += LH; });
            else {
                const bad = Object.keys(c.files).filter((k) => c.files[k] !== 'ok');
                if (bad.length) { put(S.x + 16, y, lw - 32, 'Not readable: ' + bad.map((k) => k + ' (' + c.files[k] + ')').join(', '), '#ffb020', 16); y += LH; }
                put(S.x + 16, y, lw - 32, 'App manager media players:', t.dim, 17); y += LH;
                (c.mediaPlayer || []).forEach((e) => { if (room(y)) { put(S.x + 28, y, lw - 44, e[0] + ' = ' + (typeof e[1] === 'string' ? e[1] : JSON.stringify(e[1])), /OapGeneric/.test(JSON.stringify(e[1])) ? HUB.GREEN : t.text, 17); y += LH; } });
                if (!(c.mediaPlayer || []).length && room(y)) { put(S.x + 28, y, lw - 44, 'none found', t.dim, 17); y += LH; }
                const d = c.mediaPlayerDef;
                if (d && room(y)) { put(S.x + 16, y, lw - 32, 'MediaPlayer: ' + d.methods.length + ' methods, instances ' + JSON.stringify(d.instances), t.text, 16); y += LH; }
                if (c.commandControlDef && room(y)) { put(S.x + 16, y, lw - 32, 'CommandControl: ' + c.commandControlDef.methods.join(', '), t.text, 16); y += LH; }
                if (c.catalogMediaPlayer !== undefined && room(y)) { put(S.x + 16, y, lw - 32, 'Catalog: "OapGeneric" ' + (c.catalogHasOapGeneric ? 'present' : 'absent') + '; MediaPlayer ' + String(c.catalogMediaPlayer).slice(0, 120), t.dim, 16); y += LH; }
            }
            cardOf(lk)(cv, t, S.x + 16, by, lw - 32, bh, isDown('au:run'));
            lblOf(cv, u)(c ? 'Read again' : 'Read the audio setup', S.x + lw / 2, by + bh / 2 + 8, 22, t.text, { align: 'center' });
            cv.target(S.x + 16, by, lw - 32, bh, () => { gDown = Date.now(); downKey = 'au:run'; auRun(); }, 'au:run', u.radius);
            diagBox(cv, rx, top, rw, S.h);
            y = top + 32;
            cv.text('Media menu sources', rx + 16, y, 21, t.accent2 || t.accent, { font: 'bold', literal: true }); y += 30;
            if (!c) { put(rx + 16, y, rw - 32, 'Tap Read the audio setup.', t.dim); return; }
            const src = c.sources || [], rows = Math.floor((top + S.h - 14 - y) / LH);
            if (!src.length) { put(rx + 16, y, rw - 32, 'None read (mediaapp config not readable?)', t.dim); return; }
            src.slice(0, src.length > rows ? rows - 1 : rows).forEach((x) => { put(rx + 16, y, rw - 32, x.name + ': ' + (x.am || x.media || '-'), /StreamingFront|OapGeneric/.test(x.name + x.am) ? HUB.GREEN : t.text, 16); y += LH; });
            if (src.length > rows) put(rx + 16, y, rw - 32, '+ ' + (src.length - rows + 1) + ' more in audio.txt', t.dim, 16);
        }
        function widgetsDiag(cv, S, lk) {
            const t = S.t, u = lk.ui, top = S.y, LH = 27, lw = Math.round(S.w * 0.36), rx = S.x + lw + 16, rw = S.x + S.w - rx, r = hw.r;
            const put = (x, y, w, s2, c, size) => cv.text(fitText(cv, s2, size || 19, w), x, y, size || 19, c || t.text, { literal: true });
            diagBox(cv, S.x, top, lw, S.h);
            let y = top + 32;
            cv.text('Home-screen widget layouts', S.x + 16, y, 21, t.accent2 || t.accent, { font: 'bold', literal: true }); y += 34;
            ['Reads the HMI\'s own widget files (read-only)', 'and finds the layouts that show a picture an', 'app can write, and whether the HMI draws it',
                'with the dark edge (a mask) or plain.'].forEach((l2) => { put(S.x + 16, y, lw - 32, l2, t.dim, 17); y += 25; });
            y += 8;
            if (hw.running) put(S.x + 16, y, lw - 32, hw.progress, t.accent2 || t.accent);
            else if (r && !r.ok) wrapLines(cv, r.error || 'Could not read the widget layouts.', 17, lw - 32, 6).forEach((l2) => { put(S.x + 16, y, lw - 32, l2, '#ffb020', 17); y += 24; });
            else if (r) {
                put(S.x + 16, y, lw - 32, r.layouts.length + ' layouts, ' + r.files + ' files, ' + (r.ms / 1000).toFixed(1) + ' s', t.text, 18); y += 26;
                if (r.denied && r.denied.length) { put(S.x + 16, y, lw - 32, 'Some folders could not be read', '#ffb020', 16); y += 24; }
                put(S.x + 16, y, lw - 32, 'Full list: hmi_widgets.txt in the data folder', t.dim, 16);
            } else put(S.x + 16, y, lw - 32, 'Takes a few seconds. Parked is best.', t.dim, 17);
            const bh = 64, by = top + S.h - bh - 16;
            if (!hw.running) {
                cardOf(lk)(cv, t, S.x + 16, by, lw - 32, bh, isDown('hw:run'));
                lblOf(cv, u)(r ? 'Read again' : 'Read the widget layouts', S.x + lw / 2, by + bh / 2 + 8, 22, t.text, { align: 'center' });
                cv.target(S.x + 16, by, lw - 32, bh, () => { gDown = Date.now(); downKey = 'hw:run'; hwRun(); }, 'hw:run', u.radius);
            }
            diagBox(cv, rx, top, rw, S.h);
            y = top + 32;
            cv.text('Layouts with a picture', rx + 16, y, 21, t.accent2 || t.accent, { font: 'bold', literal: true }); y += 32;
            if (!r || !r.ok) { put(rx + 16, y, rw - 32, r ? 'Nothing to list.' : 'Tap Read the widget layouts.', t.dim); return; }
            const shown = (r.layouts || []).filter((l) => l.verdict !== 'none'), rows = Math.floor((top + S.h - 16 - y) / LH);
            if (!shown.length) { put(rx + 16, y, rw - 32, 'No widget layout shows a picture an app can write.', t.dim); return; }
            shown.slice(0, shown.length > rows ? rows - 1 : rows).forEach((l) => {
                const plain = l.verdict === 'plain';
                cv.circle(rx + 24, y - 7, 7, plain ? HUB.GREEN : '#ffb020');
                const cells = Object.keys(l.cells || {}).filter((c) => !plain || (l.cells[c] || []).some((e) => !e.mask)).join(', ');
                put(rx + 40, y, rw - 56, l.name.replace(/^LT_(Table|Label)_/, '') + '   ' + (plain ? 'plain' : 'mask') + ' \u00b7 cell ' + cells, t.text, 18);
                y += LH;
            });
            if (shown.length > rows) put(rx + 40, y, rw - 56, '+ ' + (shown.length - rows + 1) + ' more in hmi_widgets.txt', t.dim, 17);
        }
        function diagBox(cv, x, y, w, h) { cv.roundRect(x, y, w, h, 8, L.withAlpha('#000000', 0.55)); cv.strokeRoundRect(x, y, w, h, 8, 1, L.withAlpha('#ffffff', 0.16)); }
        /** Long text in lines of width w (at most n), cut at spaces where it can. */
        function wrapLines(cv, s, size, w, n) {
            const out = [];
            let rest = String(s);
            while (rest && out.length < n) {
                let cut = rest.length;
                while (cut > 1 && cv.textWidth(rest.slice(0, cut), size, { literal: true }) > w) { const sp = rest.lastIndexOf(' ', cut - 1); cut = sp > 0 ? sp : cut - 1; }
                out.push(rest.slice(0, cut)); rest = rest.slice(cut).replace(/^ +/, '');
            }
            if (rest && out.length) out[out.length - 1] = fitText(cv, out[out.length - 1] + ' ' + rest, size, w);
            return out;
        }
        function clusterDiag(cv, S, lk) {
            const t = S.t, u = lk.ui, top = S.y, colW = (S.w - 2 * 16) / 3, F = 18, LH = 26;
            const head = (s, x, y) => cv.text(s, x, y, 19, t.accent2 || t.accent, { font: 'bold', literal: true });
            const put = (x, y, w, s, c, size) => cv.text(fitText(cv, s, size || F, w), x, y, size || F, c || t.text, { literal: true });
            // 1. tools and what each part does now
            let x = S.x, w = colW, y = top + 30;
            diagBox(cv, x, top, w, S.h);
            head('Tools', x + 14, y); y += 28;
            tools().forEach((tv) => { put(x + 14, y, w - 28, tv[0] + ': ' + tv[1], tv[1] === 'not installed' ? '#ffb020' : t.text); y += LH; });
            y += 10; head('Now', x + 14, y); y += 28;
            const paused = { kind: 'pending', text: 'Paused (full-screen cluster test)' };
            const parts = [['Logo', clogo.view()], ['Skins', fcTest ? paused : skinOn() ? cskin.view() : { kind: 'off', text: 'Off (' + displaysLine() + ')' }],
                ['HUD', fcTest ? paused : hudOn() ? hud.view() : { kind: 'off', text: 'Off (' + displaysLine() + ')' }]];
            if (fcTest) parts.push(['Full-screen', fcl.view()]);
            parts.forEach((p) => {
                const tone = logoTone(t, p[1].kind);
                if (tone) cv.circle(x + 20, y - 6, 5, tone);
                wrapLines(cv, p[0] + ': ' + p[1].text, F, w - 48, 2).forEach((l) => { put(x + 32, y, w - 46, l, t.text); y += LH - 2; });
                y += 2;
            });
            put(x + 14, y, w - 28, (gsdOn() ? 'Source: ' + CSRC.NAMES[srcPick()] : "G's Dash off (Stock shared)") + (srcPub.error ? ' (not shared: ' + srcPub.text + ')' : ' (shared)') + ' \u00b7 now: ' + centreNow().key + ', Waze map ' + cmap.mapNow().state, srcPub.error ? '#ffb020' : t.dim); y += LH;
            put(x + 14, y, w - 28, clogo.routeLine(), t.dim, 16); y += LH + 8;
            head('Clock', x + 14, y); y += 28;
            put(x + 14, y, w - 28, clock.line(), t.text); y += LH;
            put(x + 14, y, w - 28, 'The head unit\'s clock (no car clock signal wired)', t.dim, 16);
            // 2. Waze on cluster, Refresh cluster
            x = S.x + colW + 16; y = top + 30;
            diagBox(cv, x, top, w, S.h);
            head('Waze on cluster', x + 14, y); y += 28;
            const v = cmap.view();
            const vt = v.kind === 'on' ? HUB.GREEN : v.kind === 'pending' || v.kind === 'busy' ? '#ffb020' : v.kind === 'conflict' || v.kind === 'error' ? (t.crit || '#ff3b30') : null;
            if (vt) cv.circle(x + 20, y - 6, 5, vt);
            put(x + (vt ? 32 : 14), y, w - 46, v.value, t.text, 20); y += LH + 2;
            // Waze's notes stop above the Remote logs card
            const rlTop = top + S.h - 14 - 92 - 10 - 112;
            [v.line, v.render, v.note].filter(Boolean).forEach((s2) => wrapLines(cv, s2, 16, w - 28, 3).forEach((l) => { if (y + 6 < rlTop) put(x + 14, y, w - 28, l, t.dim, 16); y += 22; }));
            const fh = 92, fy = top + S.h - 14 - fh, done = Date.now() - refreshedAt < REFRESHED_MS;
            // Remote logs, above Refresh cluster
            {
                const rs = rlStatus(), ready = rs.setup === 'ok', on = ready && rs.on, acc3 = t.sel || t.accent;
                const rh = 112, ry = rlTop, x3 = x + 14, w3 = w - 28;
                cv.roundRect(x3, ry, w3, rh, u.radius, L.withAlpha(on ? acc3 : '#ffffff', on ? 0.14 : 0.05));
                cv.strokeRoundRect(x3, ry, w3, rh, u.radius, on ? 2 : 1, on ? acc3 : L.withAlpha('#ffffff', 0.16));
                cv.text('Remote logs', x3 + 16, ry + 30, 20, t.text, { font: 'bold', literal: true });
                const sw = 66, sh = 34, sx = x3 + w3 - 14 - sw, sy = ry + 9;
                if (ready) {
                    cv.roundRect(sx, sy, sw, sh, sh / 2, on ? acc3 : L.withAlpha('#ffffff', 0.18));
                    cv.circle(on ? sx + sw - sh / 2 : sx + sh / 2, sy + sh / 2, sh / 2 - 4, '#ffffff');
                    cv.target(sx - 10, ry, sw + 24, 52, () => { rlog.setEnabled(!on); rlSeen.at = 0; }, 'dg:rlog', sh / 2);
                } else cv.text('Not set up', x3 + w3 - 16, ry + 30, 16, '#ffb020', { align: 'right', literal: true });
                const ls = rs.lastSent, pend = rs.pending ? ' (' + rs.pending + ' waiting)' : '';
                const l1 = !ready ? (rs.setup === 'bad' ? 'Drop file not usable: ' + (rs.why || '?') : 'No drop installed on this unit.')
                    : on ? 'On: encrypted, sent after a crash or on request.' : 'Off: kept on the unit only.';
                const l2 = ls ? 'Last sent: ' + (ls.ok ? rlWhen(ls.at) : rlWhen(ls.at) + ' - ' + ls.msg) + pend : 'Last sent: never' + pend;
                put(x3 + 16, ry + 56, w3 - 32, l1, ready ? t.text : t.dim, 15);
                const asked = Date.now() - rlAsked < REFRESHED_MS, bw = 150, bh = 36, bx = x3 + w3 - 14 - bw, by = ry + rh - 10 - bh;
                put(x3 + 16, by + 24, bx - x3 - 26, l2, ls && !ls.ok ? '#ffb020' : t.dim, 15);
                cv.roundRect(bx, by, bw, bh, u.radius, L.withAlpha(on ? acc3 : '#ffffff', asked ? 0.40 : on ? 0.24 : 0.05));
                cv.text(asked ? 'Sending...' : 'Send logs now', bx + bw / 2, by + 24, 16, on ? t.text : t.dim, { align: 'center', literal: true });
                if (on) cv.target(bx, by, bw, bh, () => { rlAsked = Date.now(); rlSeen.at = 0; rlog.sendNow().then(() => { rlSeen.at = 0; }, () => {}); }, 'dg:rlsend', u.radius);
            }
            cv.roundRect(x + 14, fy, w - 28, fh, u.radius, L.withAlpha(t.sel || t.accent, done ? 0.30 : 0.16));
            cv.strokeRoundRect(x + 14, fy, w - 28, fh, u.radius, 2, t.sel || t.accent);
            const ax = x + 14 + 44, ay = fy + fh / 2;
            cv.arc(ax, ay, 15, 18, 40, 330, t.text);
            cv.quad([[ax + 14, ay - 18], [ax + 22, ay - 4], [ax + 6, ay - 6], [ax + 10, ay - 10]], t.text);
            lblOf(cv, u)(done ? 'Cluster refreshed' : 'Refresh cluster', x + 14 + 82, ay - 2, u.size + 2, t.text);
            put(x + 14 + 82, ay + 24, w - 28 - 96, done ? 'Every G\'s Dash layer remade' : 'Remakes the logo, skins and HUD layers', t.dim, 16);
            cv.target(x + 14, fy, w - 28, fh, () => { gDown = Date.now(); downKey = 'dg:refresh'; refreshCluster(); }, 'dg:refresh', u.radius);
            // 3. the renderer's refusals; parked: the alignment card and the Stock redraw
            x = S.x + 2 * (colW + 16); y = top + 30;
            diagBox(cv, x, top, w, S.h);
            head('Renderer refusals', x + 14, y); y += 28;
            const ref = [['Skins', cskin.refusal()], ['HUD', hud.refusal()], ['Full-screen test', fcl.refusal()]].filter((r) => r[1]);
            if (!ref.length) { put(x + 14, y, w - 28, 'None', t.dim); y += LH; }
            ref.forEach((r) => { wrapLines(cv, r[0] + ' refused: ' + r[1], 15, w - 28, 4).forEach((l) => { put(x + 14, y, w - 28, l, t.warn || t.crit, 15); y += 20; }); y += 6; });
            // 0.12.0: the full-screen cluster test (TEST): off by default, never saved, any gear or speed
            {
                const fh3 = 150, fy3 = top + S.h - 70 - 40 - 26 - fh3, x3 = x + 14, w3 = w - 28, acc3 = t.sel || t.accent;
                cv.roundRect(x3, fy3, w3, fh3, u.radius, L.withAlpha(fcTest ? acc3 : '#ffffff', fcTest ? 0.18 : 0.05));
                cv.strokeRoundRect(x3, fy3, w3, fh3, u.radius, fcTest ? 2 : 1, fcTest ? acc3 : L.withAlpha('#ffffff', 0.16));
                cv.text('Full-screen cluster test', x3 + 16, fy3 + 34, 20, t.text, { font: 'bold', literal: true });
                cv.text('TEST', x3 + 16 + cv.textWidth('Full-screen cluster test', 20, { font: 'bold', literal: true }) + 12, fy3 + 33, 13, '#ffb020', { font: 'bold', literal: true });
                const sw = 66, sh = 34, sx = x3 + w3 - 16 - sw, sy = fy3 + 14;
                cv.roundRect(sx, sy, sw, sh, sh / 2, fcTest ? acc3 : L.withAlpha('#ffffff', 0.18));
                cv.circle(fcTest ? sx + sw - sh / 2 : sx + sh / 2, sy + sh / 2, sh / 2 - 4, '#ffffff');
                const ls = [fcTest ? 'On: classic round dials over the whole cluster panel.' : 'Off. Classic round dials over the whole cluster panel.',
                    'Covers the car\'s warning lights while on.',
                    'Pauses the skins and HUD. Off again after a restart.'];
                ls.forEach((l, i) => put(x3 + 16, fy3 + 70 + i * 24, w3 - 32, l, i === 1 ? '#ffb020' : i ? t.dim : t.text, 16));
                cv.target(x3, fy3, w3, fh3, () => {
                    if (!gsdOn()) { log.info('full-screen cluster test: not started (G\'s Dash is off on the cluster & HUD)'); return; }
                    fcTest = !fcTest;
                    // 0.13.8: the side letting go had the shared scene up: the other waits out the hand-over
                    fcSwitchAt = (fcTest ? hud.cr : fcl.cr) ? Date.now() : null;
                    log.info('full-screen cluster test: ' + (fcTest ? 'on (the skins and HUD paused)' : 'off'));
                    logoUpdate(visible());
                }, 'dg:fctest', u.radius);
            }
            const d2 = car.data(), parked = L.isNum(d2.speed) && d2.speed < 1 && d2.stage !== 'D' && d2.stage !== 'R';
            const bw2 = (w - 28 - 12) / 2, by2 = top + S.h - 70, bh2 = 56;
            head('Cluster skins (parked)', x + 14, by2 - 40);
            [['align', 'Alignment card'], ['stock', 'Stock redraw']].forEach((b, i) => {
                const bx = x + 14 + i * (bw2 + 12), on = skinMode === b[0];
                if (on) { cv.roundRect(bx, by2, bw2, bh2, u.radius, L.withAlpha(t.sel || t.accent, 0.25)); cv.strokeRoundRect(bx, by2, bw2, bh2, u.radius, 2, t.sel || t.accent); }
                else cv.roundRect(bx, by2, bw2, bh2, u.radius, L.withAlpha('#ffffff', parked ? 0.08 : 0.03));
                cv.text(b[1], bx + bw2 / 2, by2 + 26, 18, parked || on ? t.text : t.dim, { align: 'center', literal: true });
                cv.text(on ? 'on - tap for the look' : parked ? 'parked: tap to show' : 'parked only', bx + bw2 / 2, by2 + 47, 14, t.dim, { align: 'center', literal: true });
                if (on || parked) cv.target(bx, by2, bw2, bh2, () => { skinMode = on ? 'skin' : b[0]; log.info('cluster skin mode: ' + skinMode); }, 'sk:' + b[0], u.radius);
            });
            if (skinMode !== 'skin') put(x + 14, by2 - 66, w - 28, 'Cluster: ' + cskin.view().text, t.dim, 15);
        }
        // the Cluster & HUD page's five picks of the cluster's centre (0.8.3, cluster_source.js); 0.13.9: each
        // line says what the pick puts there, in plain words (srcState() swaps in why, when it cannot now)
        // 0.17.0: every pick but Auto always shows what it says (cluster_source.js)
        const SRC_TILES = [
            ['auto', 'Smart: route, TV, music, logo'],
            ['logo', "G's Dash logo, always"],
            ['music', 'Lyrics, else the logo'],
            ['map', "Waze's map, always"],
            ['stock', "The car's own, always"],
        ];
        // G's Music's own Cluster setting (its state.json), read at most every MUSIC_READ_MS for the Now card
        let musicSeen = { error: 'missing' }, musicReadAt = -1e15;
        const MUSIC_READ_MS = 2000;
        const musicState = () => {
            const now = Date.now();
            if (now - musicReadAt >= MUSIC_READ_MS) { musicReadAt = now; musicSeen = CSRC.readMusic(); }
            return musicSeen;
        };
        /**
         * 0.13.9: what the cluster's centre shows now, as confirmed - by the cluster renderer's replies (our logo's
         * layer state, the other apps' layers it lists) and Waze on cluster's own status file (its map layer shown,
         * the renderer said so) - not what was asked for. { key, text }. key: logo | tv | music | directions |
         * waze | waiting | stock. With G's Dash off or closed (Auto) G's Music's and G's TV's layers are not
         * seen (no renderer connection then): only Waze's and ours.
         */
        function centreNow() {
            const lv = clogo.view(), mn = cmap.mapNow();
            const seen = clogo.want ? clogo.others.concat(clogo.under) : [];
            const has = (re) => seen.some((l) => re.test(l.app || ''));
            const raw = clogo.guide.nav === true || clogo.guide.carplay === true || clogo.guide.aa === true;
            const guiding = clogo.want ? (clogo.guiding || clogo.rawGuide) : raw;
            const waze = mn.state === 'showing' || has(/waze/i);
            if (clogo.want && clogo.others.some((l) => l.app === 'ng_tv')) return { key: 'tv', text: "G's TV" };
            if (clogo.want && clogo.under.some((l) => l.app === 'ng_spotify')) return { key: 'music', text: "G's Music" };
            if (clogo.want && lv.kind === 'on') return { key: 'logo', text: "G's Dash logo" };
            if (guiding) return { key: 'directions', text: waze ? "Waze's map with directions" : 'Directions (route guidance)' };
            if (waze) return { key: 'waze', text: "Waze's map (from CarPlay)" };
            if (clogo.want && lv.kind === 'wait') return { key: 'waiting', text: 'Logo on its way (' + lv.text + ')' };
            return { key: 'stock', text: "The car's own display" };
        }
        /** Why Waze's map is not on the cluster now, in plain words ('' when it is). */
        function wazeWhy(mv, mn) {
            if (mn.state === 'none' || mv.kind === 'none') return 'Waze on cluster is not installed';
            if (mv.on === false) return 'Waze on cluster is Off (below)';
            if (mv.kind === 'pending') return 'Waze on cluster: restart the head unit to finish';
            if (mn.state === 'showing') return '';
            if (mn.state === 'off') return "Waze's map is switched off on the cluster" + (wctl.view().text ? ' (' + wctl.view().text + ')' : '');
            if (mn.state === 'idle') return 'CarPlay is not sending a map now (it does while Waze guides a route)';
            if (mn.state === 'frozen') return "Waze's map froze (the phone sends an empty picture): reconnect the phone, then start the route";   // 0.14.2
            if (mn.state === 'starting') return 'Waze map waiting' + (mn.reason ? ': ' + mn.reason : '');
            if (mn.state === 'down') return 'Waze on cluster is not running';
            return 'Waze on cluster: ' + (mn.reason || mn.state);
        }
        /** A pick's tile: { ok, text } - ok false: dimmed, text the short reason it cannot show now. */
        function srcState(kind) {
            const line = SRC_TILES.filter((r2) => r2[0] === kind)[0][1];
            if (!gsdOn()) return { ok: false, text: "G's Dash is off" };
            if (kind === 'logo' || kind === 'auto') {
                const lv = clogo.view();
                return lv.kind === 'none' ? { ok: false, text: lv.text } : { ok: true, text: line };
            }
            if (kind === 'music') {
                // 0.17.0: G's Music draws when Music is picked, whatever its own Cluster setting
                if (musicState().error) return { ok: false, text: "Open G's Music once" };
                return { ok: true, text: line };
            }
            const mv = cmap.view(), mn = cmap.mapNow();
            if (kind === 'map') {
                if (mn.state === 'none' || mv.kind === 'none') return { ok: false, text: 'Needs Waze on cluster' };
                if (mv.on === false) return { ok: false, text: 'Waze on cluster is Off' };
                if (mn.state === 'showing') return { ok: true, text: line };
                return { ok: false, text: mn.state === 'idle' ? 'No Waze map now' : mn.state === 'frozen' ? 'Waze map froze' : mn.state === 'off' ? (wctl.view().can ? 'Switching it on' : 'Waze map off on the cluster') : 'Waze map not running' };
            }
            // 0.17.0: Stock switches Waze's map off (waze_ctl.js); only a Waze on cluster that cannot be switched covers it
            if (mn.state === 'showing' && !wctl.view().can) return { ok: false, text: "Waze's map covers it" };
            return { ok: true, text: line };
        }
        // 0.13.9: the confirmed centre and Waze's map state in the log (and the ring) whenever they change
        let centreSeen = '', wazeSeen = '';
        function centreTrack() {
            try {
                const c = centreNow(), mn = cmap.mapNow(), w = mn.state + (mn.reason ? ' (' + mn.reason + ')' : '');
                if (w !== wazeSeen) { wazeSeen = w; log.info('cluster source: Waze map ' + w); }
                if (c.key !== centreSeen) { centreSeen = c.key; log.info('cluster source: now ' + c.key + ' (pick ' + srcPick() + (gsdOn() ? '' : ', G\'s Dash off') + ')'); }
            } catch (e) { /* before the page's parts are made */ }
        }
        /**
         * The Now card: { title, sub, tone ('ok' | 'wait' | 'off'), notes: [[text, 'warn' | 'dim']] }. 0.13.9: the
         * title is what the cluster shows now as confirmed (centreNow), the lines what the pick does and, when
         * the two differ, why - in plain words.
         */
        function nowCard() {
            const src = srcPick(), name = CSRC.NAMES[src], lv = clogo.view(), mv = cmap.view(), mn = cmap.mapNow(), notes = [];
            const c = centreNow(), ms = musicState();
            const r = { title: 'On the cluster now: ' + c.text, sub: '', tone: 'ok' };
            const wazeOff = "Waze's map stays while CarPlay sends it, also after a route. End the route on the phone, reconnect CarPlay, or set Waze on cluster Off below.";
            if (!gsdOn()) {
                r.sub = "G's Dash is off on the cluster and HUD: the car shows its own (G's Music stays out too)";
                if (c.key === 'waze') { r.tone = 'wait'; notes.push([wazeOff, 'warn']); }
            } else if (src === 'stock') {
                const wv = wctl.view();
                r.sub = "Stock: none of G's apps draw there, and Waze's map is switched off. The car shows what iDrive > Instrument cluster > Central display area is set to (Off leaves it empty).";
                if (c.key === 'waze') {
                    r.tone = 'wait';
                    notes.push(wv.can ? [wv.text || "Switching Waze's map off", 'dim'] : [wv.text + '. ' + wazeOff, 'warn']);
                }
            } else if (src === 'map') {
                const why = wazeWhy(mv, mn);
                r.sub = "Waze: Waze's map whenever CarPlay sends it (switched on); G's Dash and G's Music stay out.";
                if (why && c.key !== 'directions') { r.tone = 'wait'; notes.push([why + ". Until then the car's own display shows.", 'warn']); }
            } else {
                r.sub = src === 'auto' ? "Auto: directions during a route, G's TV when you play it there, G's Music while a track plays, else the logo while G's Dash is open"
                    : src === 'logo' ? 'Logo: always the logo, also in the background and during route guidance.'
                        : 'Music: lyrics / visualizer while a track plays, else the logo, also during route guidance.';
                if (c.key === 'directions') r.sub += '. Back to ' + name + ' when the route ends.';
                else if (c.key === 'tv') r.sub = "G's TV is on. Back to " + name + ' when it stops.';
                else if (c.key === 'waiting') r.tone = 'wait';
                else if (c.key !== 'logo' && c.key !== 'music') {
                    r.tone = lv.kind === 'error' || lv.kind === 'none' ? 'off' : 'wait';
                    notes.push(['Logo: ' + lv.text + (src === 'auto' && !logoOn() ? ' ("Logo in cluster" is Off in the settings list)' : ''), lv.kind === 'error' || lv.kind === 'none' ? 'warn' : 'dim']);
                }
                if (src === 'music' && ms.error) notes.push(["G's Music not seen yet: open it once", 'dim']);
                if (src === 'logo' || src === 'music') notes.push(['Also in the background while G\'s Dash runs (gone if the head unit ends it)', 'dim']);
            }
            if (srcPub.error) notes.push(["Pick not shared (" + srcPub.text + "): G's Music and G's TV keep their last", 'warn']);
            r.notes = notes;
            return r;
        }
        /**
         * 0.13.9: G's Dash on the cluster & HUD, On / Off (setting "clusterControl"; Off = the car stock), in the
         * header row between the page's title and the version, so it is always in view on Cluster & HUD.
         */
        function controlSwitch(cv, S, lk, card) {
            const t = S.t, u = lk.ui, acc = t.sel || t.accent, on = gsdOn();
            const tf = { font: u.lbl || u.txt, spacing: u.upper ? u.spacing : 0, literal: true };
            const tx = S.x + 210 + 32 + cv.textWidth(u.upper ? 'CLUSTER & HUD' : 'Cluster & HUD', 30, tf) + 36;
            const vr = S.x + S.w - DASH_W - 24 - cv.textWidth("G's Dash" + (VERSION ? ' ' + VERSION : ''), 16, tf) - 28;
            const w = Math.min(470, vr - tx), x = vr - w, y = HEAD_Y, h = HEAD_H;
            if (w < 260) return;
            if (on) card(cv, t, x, y, w, h, isDown('cs:control'));
            else { cv.roundRect(x, y, w, h, u.radius, L.withAlpha('#ffb020', 0.14)); cv.strokeRoundRect(x, y, w, h, u.radius, 2, '#ffb020'); }
            const sw = 62, sh = 32, sx = x + w - 16 - sw, sy = y + (h - sh) / 2;
            cv.text(fitText(cv, "G's Dash on cluster & HUD", 18, sx - x - 30), x + 16, y + 27, 18, t.text, { font: 'bold', literal: true });
            cv.text(fitText(cv, on ? 'On. Off puts the car back to stock.' : 'Off: the car is stock. Tap for On.', 15, sx - x - 30), x + 16, y + 50, 15, on ? t.dim : '#ffb020', { literal: true });
            cv.roundRect(sx, sy, sw, sh, sh / 2, on ? acc : L.withAlpha('#ffffff', 0.18));
            cv.circle(on ? sx + sw - sh / 2 : sx + sh / 2, sy + sh / 2, sh / 2 - 4, '#ffffff');
            cv.target(x, y, w, h, () => { gDown = Date.now(); downKey = 'cs:control'; settings.set('clusterControl', gsdOn() ? 'off' : 'on'); }, 'cs:control', u.radius);
        }
        /**
         * Cluster & HUD (0.10.0; 0.17.1: one tap for each pick, as big tiles). Header: back to Options, the page's name and
         * the G's Dash on cluster & HUD switch. Then the two picks (hub.js pickRows): the cluster's centre (setting
         * "clusterSource") and the dials & HUD (setting "displays"), each tile saying what it does or in amber why it
         * cannot show now (srcState()). The foot: what the cluster and the HUD show now (as confirmed: centreNow() and
         * the skins' / HUD's own lines), CarPlay's map in the cluster Off / On only when Waze on cluster is installed (a
         * change asks first: the confirmation over the page, the page's own targets left out meanwhile), and Diagnostics.
         */
        function clusterPage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), card = cardOf(lk), acc = t.sel || t.accent;
            const mark = cv.targets ? cv.targets.length : 0;
            header(cv, S, lk, lbl, card, 'Cluster & HUD', 1);
            controlSwitch(cv, S, lk, card);
            const v = cmap.view(), bottom = S.y + S.h;
            if (ask && (Date.now() - ask.at > ASK_MS || v.can !== ask.cmd)) ask = null;
            const M = quickModel(), st = HUB.style(lk, t), Q = HUB.pickLayout(S.y, bottom);
            HUB.pickRows(cv, st, S, M, Q);
            centreTrack();
            // the foot: what shows now | CarPlay's map (Waze on cluster, when installed) | Diagnostics
            const vt = v.kind === 'on' ? 'ok' : v.kind === 'pending' || v.kind === 'busy' ? 'wait' : v.kind === 'conflict' || v.kind === 'error' ? 'bad' : '';
            HUB.pickFoot(cv, st, S, Q, {
                now: M.now, hud: M.hud,
                // the first reason something is not as picked (amber), when the foot has room for a third line
                warn: (nowCard().notes.filter((nt) => nt[1] === 'warn')[0] || [clusterTrouble() ? 'Something needs attention: see Diagnostics' : ''])[0],
                waze: v.kind !== 'none' && v.kind !== 'checking' ? { value: v.value, on: v.on, can: v.can, tone: vt } : null,
                down: (k) => isDown(k),
                ask: (cmd) => { ask = { cmd, at: Date.now() }; },
                diag: () => { gDown = Date.now(); downKey = 'cs:diag'; press(3, 'cs:diag'); },
            });
            if (!ask) return;
            // the confirmation, over the page: only its two buttons take taps
            if (cv.targets) cv.targets.length = mark;
            cv.fillRect(0, S.y - 90, 1600, S.h + 120, L.withAlpha('#000000', 0.72));
            const on = ask.cmd === 'apply', cw = 900, ch = 300, cx = 800 - cw / 2, cy = S.y + (S.h - ch) / 2 - 20;
            cv.roundRect(cx, cy, cw, ch, u.radius + 4, t.bg);
            cv.strokeRoundRect(cx, cy, cw, ch, u.radius + 4, 2, '#ffb020');
            lbl(on ? 'Turn the cluster map on?' : 'Turn the cluster map off?', cx + 32, cy + 52, 30, t.text);
            // 0.14.2: turned on mid-drive, CarPlay restarted and the phone's cluster stream stayed empty until reconnected
            [on ? 'The Waze on cluster tool patches CarPlay on the head unit.' : 'The Waze on cluster tool puts CarPlay back as stock.',
                on ? 'CarPlay may restart (calls, music drop): then reconnect the phone.' : 'CarPlay may restart now: a call or music on CarPlay may drop.',
                'Otherwise it takes effect at the next head-unit start.'].forEach((l, i) => {
                cv.text(fitText(cv, l, 21, cw - 64), cx + 32, cy + 100 + i * 32, 21, i === 1 ? '#ffb020' : t.dim, { literal: true });
            });
            const bw2 = 300, bh2 = 76, by2 = cy + ch - bh2 - 22;
            card(cv, t, cx + 32, by2, bw2, bh2, false);
            lbl('Cancel', cx + 32 + bw2 / 2, by2 + 48, 26, t.text, { align: 'center' });
            cv.target(cx + 32, by2, bw2, bh2, () => { ask = null; }, 'cm:cancel', u.radius);
            const ox = cx + cw - 32 - bw2;
            cv.roundRect(ox, by2, bw2, bh2, u.radius, L.withAlpha(acc, 0.28));
            cv.strokeRoundRect(ox, by2, bw2, bh2, u.radius, 2.5, acc);
            lbl(on ? 'Turn on' : 'Turn off', ox + bw2 / 2, by2 + 48, 26, t.text, { align: 'center' });
            cv.target(ox, by2, bw2, bh2, () => {
                const a = ask; ask = null;
                // the state may have changed under the question: only what the switch still offers goes
                if (a && cmap.view().can === a.cmd) cmap.request(a.cmd);
            }, 'cm:confirm', u.radius);
        }
        /**
         * Options > Cluster & HUD's picks and what shows now (hub.js pickRows(); 0.17.0's dash screen became that page):
         * the tiles with srcState()'s words, centreNow() and the skins' / HUD's own lines.
         */
        function quickModel() {
            const on = gsdOn(), dcur = displays(), c = centreNow(), ms = musicState();
            const toneOf = (kind) => (kind === 'on' ? 'ok' : kind === 'wait' || kind === 'pending' ? 'wait' : 'off');
            const hudNow = !on ? { text: "The car's own", tone: 'off' }
                : fcTest && (dcur === 'skin' || dcur === 'hud') ? { text: 'Paused (full-screen cluster test)', tone: 'wait' }
                    : dcur === 'skin' ? (function (v) { return { text: v.text, tone: toneOf(v.kind) }; })(cskin.view())
                        : dcur === 'hud' ? (function (v) { return { text: v.text, tone: toneOf(v.kind) }; })(hud.view())
                            : dcur === 'music' ? { text: ms.error ? "Open G's Music once" : "G's Music's lyrics while a track plays", tone: ms.error ? 'wait' : 'ok' }
                                : { text: "The car's own", tone: 'off' };
            const ok = ['logo', 'music', 'tv', 'waze', 'directions'].indexOf(c.key) >= 0 || (c.key === 'stock' && srcPick() === 'stock');
            return {
                on, src: srcPick(), disp: dcur,
                srcTiles: SRC_TILES.map((r) => { const ss = srcState(r[0]); return { id: r[0], name: CSRC.NAMES[r[0]], line: r[1], ok: ss.ok, why: ss.text }; }),
                dispTiles: PREFS.DISPLAYS.map((o) => ({ id: o[0], name: o[1], line: o[2] })),
                now: { text: c.text, tone: ok ? 'ok' : c.key === 'waiting' ? 'wait' : 'off' },
                hud: hudNow,
                down: (k) => isDown(k),
                tap: (k, fn) => { gDown = Date.now(); downKey = k; fn(); },
                pickSrc: (v) => { settings.set('clusterSource', v); log.info('cluster source: ' + v); },
                pickDisp: (v) => { settings.set('displays', v); log.info('displays: ' + v); },
            };
        }
        /** The logo's state as a colour (null: none): shown green, waiting amber, an error red. */
        function logoTone(t, kind) {
            return kind === 'on' ? HUB.GREEN : kind === 'wait' ? '#ffb020' : kind === 'error' ? (t.crit || '#ff3b30') : null;
        }
        function fitText(cv, s, size, w, o) {
            s = String(s);
            const opt = Object.assign({ literal: true }, o || {});
            if (cv.textWidth(s, size, opt) <= w) return s;
            let lo = 0, hi = s.length;
            while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cv.textWidth(s.slice(0, mid) + '...', size, opt) <= w) lo = mid; else hi = mid - 1; }
            return s.slice(0, lo) + '...';
        }

        let gRectNow = null;
        /**
         * Drive's favourite looks (0.10.0): the gear (the look's S.zones.gear) takes a tap (favTap), after the
         * look's own targets (its session clock wins where they meet); the toast (the look now, or the hint)
         * under the speed's unit. 0.11.0: the gear only - a tap on the speed does nothing - and no stars on
         * Drive (favourites are starred on Theme).
         */
        function favDrive(cv, S, lk) {
            const z = S.zones;
            if (!z) return;
            const u = lk.ui;
            // 0.11.0: the gear only (the speed no longer switches), and no stars on the dash
            if (z.gear) cv.target(z.gear.x, z.gear.y, z.gear.w, z.gear.h, () => favTap(S), 'favlook:gear', 0);
            if (!lookToast) return;
            const age = Date.now() - lookToast.at;
            if (age > LOOK_TOAST_MS || age < 0 || !z.toast) { if (age > LOOK_TOAST_MS) lookToast = null; return; }
            const f = { font: u.txt, spacing: u.upper ? u.spacing * 0.6 : 0, literal: true };
            const a = valueText(u, lookToast.lines[0]), b = lookToast.lines[1] || '';
            const aw = cv.textWidth(a, 24, f), bw = b ? cv.textWidth(b, 17, { literal: true }) : 0;
            const w = Math.min(S.w - 20, 34 + aw + (b ? 24 + bw : 0) + 34), h = 52;
            const x = Math.max(S.x + 10, Math.min(S.x + S.w - 10 - w, z.toast.x - w / 2)), y = z.toast.y;
            cv.roundRect(x, y, w, h, h / 2, L.withAlpha('#000000', 0.82));
            cv.strokeRoundRect(x, y, w, h, h / 2, 2, STAR);
            cv.text(a, x + 34, y + h / 2 + 9, 24, '#ffffff', f);
            if (b) cv.text(b, x + 34 + aw + 24, y + h / 2 + 7, 17, '#c8ced8', { literal: true });
        }
        log.info(clock.line() + ' (12-hour H:MM)');

        /* ---------- Logo: the home-screen widget and the cluster graphic (app.json startWidget, setting "logo") ----------
         * The G mark (widget_logo.js), or My GIF, on both. The widget layout is LT_Table_BasicWidget: the picture
         * goes to BackgroundImage_Big and, on the small size, BackgroundImage_Small (no mask). Text cells stay empty.
         * The GIF is played by kit/runtime/widget_anim.js. In the cluster it is the same kind of image-layer
         * update as the Pixel emblem (pixels(), at most 12 a second), fitted to that emblem's on-screen size,
         * and it keeps playing while the car moves. */
        const logo = new Canvas(LOGO.w, LOGO.h);
        logo.d.set(zlib.inflateSync(Buffer.from(LOGO.rgba, 'base64')));
        function renderWidget() { return logo; }
        const WSIZE = (ctx.spec.startWidget && ctx.spec.startWidget.size) || [384, 256];
        const gifOn = () => settings.get(PREFS.LOGO_KEY) === 'gif';
        const perOn = () => settings.get(LM.PER_KEY) === 'on';
        const aw = new AnimatedWidget(ctx, { file: path.join(ctx.dataDir, 'widget_anim.bin'), draw: renderWidget, enabled: false });
        const player = new LogoPlayer(aw, { dir: ctx.dataDir, log: log, Store: ANIM.Store, Clip: ANIM.Clip });
        let logoBusy = false, logoSig = '';
        /**
         * The driving mode (car.data().driveMode, the FES badge) picks the GIF. Off: the main Logo, exactly
         * as before. On: that mode's slot, or the main Logo when the slot is empty. The home widget and the
         * cluster read the same clip. Cheap when nothing changed; the 200 ms timer covers the background,
         * where the screen's loop does not run. Returns true when the picture changed.
         */
        logoSync = function () {
            if (logoBusy) return false;
            logoBusy = true;
            let changed = false;
            try {
                const per = perOn(), label = car.data().driveMode || null;
                if (per && label) {
                    const seen = LM.noteSeen(LM.parseSeen(settings.get(LM.SEEN_KEY)), label);
                    const ser = LM.serializeSeen(seen);
                    if (ser !== (settings.get(LM.SEEN_KEY) || '')) settings.set(LM.SEEN_KEY, ser);
                }
                const r = LM.resolve(per, label, player.filled());
                const sig = (per ? '1' : '0') + '|' + r.use + '|' + (r.slot || '') + '|' + (gifOn() ? 'g' : 'l') + '|' + player.rev;
                if (sig === logoSig) return false;
                logoSig = sig;
                changed = true;
                const mainOn = gifOn() && player.mainReady();
                if (!per || r.use !== 'slot' || !player.play(r.slot)) { player.showMain(); aw.enable(mainOn); }
                else aw.enable(true);
                log.info('logo: ' + (label || 'no mode') + ' -> ' + (!per ? 'one logo' : r.use === 'slot' ? r.slot : 'main (' + r.reason + ')'));
            } finally { logoBusy = false; }
            return changed;
        };
        logoSync();
        if (ctx.widget) aw.start();
        logoIv = setInterval(() => { try { if (logoSync()) clogoUpdate(visible()); } catch (e) { log.warn('logo: ' + e); } }, 200);
        if (logoIv.unref) logoIv.unref();
        let gifPic = null;
        logoPicture = function () {
            if (!aw.on || !aw.has()) { gifPic = null; return null; }
            if (!gifPic) {
                let last = null;
                gifPic = {
                    id: 'gif', source: '', animate: true,
                    frame: function (still) {
                        const f = aw.frame(still ? 0 : Date.now());
                        if (!f || !f.rgba) return null;
                        const stamp = player.source() + ':' + (still ? '0' : f.index);
                        if (last && last.stamp === stamp) return last;
                        const src = f.rgba;
                        last = { w: f.w, h: f.h, d: Buffer.from(src.buffer, src.byteOffset, src.byteLength), stamp: stamp };
                        return last;
                    },
                };
            }
            gifPic.source = player.source();
            gifPic.animate = !!(aw.clip && aw.clip.count > 1);
            return gifPic;
        };

        /*
         * Options > Logo > Send a GIF (0.15.0): a QR code and a 6-digit code (kit gif_drop.js) for the phone
         * page (app.json config widgetRelay); the phone sends the GIF end-to-end encrypted through the mailbox, it is
         * made into the widget's frames here (kit anim.js, a few seconds, the screen keeps drawing) and shown on
         * this page; only Use this GIF keeps it (in the data folder) and puts it on the widget. The phone hears
         * how it ended. Leaving the page cancels whatever is under way.
         * wg.mode: idle | qr (waiting for the phone; drop.phase says more) | preparing | confirm | error | stages
         * wg.for: 'main' or a slot id, captured when Send starts, so the GIF lands on the slot that was chosen.
         * wg.target: the slot the Send / Remove buttons act on while per driving mode is on ('main' is the fallback Logo).
         */
        const WCFG = ctx.spec.config || {};
        const drop = new GifDrop(new Net(ctx.dataDir, log), log, { relay: WCFG.widgetRelay, mailbox: WCFG.widgetMailbox, title: "G's Dash", w: WSIZE[0], h: WSIZE[1] });
        const wg = { mode: 'idle', got: null, prepared: null, clip: null, clipGen: 0, done: 0, total: 0, why: '', removeAt: 0, stageAt: 0, prevKey: '', target: 'main', for: 'main' };
        const wgReset = () => { drop.cancel(); wg.mode = 'idle'; wg.got = null; wg.prepared = null; wg.clip = null; wg.why = ''; };
        const wgCancel = (why) => {
            if (wg.got && (wg.mode === 'preparing' || wg.mode === 'confirm')) drop.ack({ t: 'done', ok: false, error: why || 'Not used: cancelled on the car.' });
            wgReset();
        };
        const sendTarget = () => (perOn() && wg.target && wg.target !== 'main' ? wg.target : 'main');
        const wgSend = () => { if (drop.configured()) { wg.for = sendTarget(); drop.start(); wg.mode = 'qr'; wg.why = ''; } };
        /** Left the page (or the screen): anything under way is cancelled, the preview's picture let go. */
        const wgLeave = () => {
            if (wg.mode !== 'idle') { log.info('home widget: left the page while ' + wg.mode + ' - cancelled'); wgCancel('Not used: the page was closed on the car.'); }
            if (wg.prevKey) { record.dropImage(IMG.wprev); wg.prevKey = ''; }
        };
        if (ui.onVisible) ui.onVisible((st, on) => { if (st === 'MAIN' && !on) wgLeave(); });
        /** While the code shows: the mailbox polled (gif_drop.js paces it), a new code when it runs out. */
        const wgTick = () => {
            if (wg.mode !== 'qr' || drop.phase !== 'waiting') return;
            if (drop.expired()) { drop.start(); return; }
            drop.tick().then((got) => {
                if (!got || wg.mode !== 'qr') return;
                wg.mode = 'preparing'; wg.got = got; wg.done = 0; wg.total = 0;
                const t0 = Date.now();
                ANIM.prepare(got.gif, { w: WSIZE[0], h: WSIZE[1], fit: got.fit, onProgress: (d, n) => { wg.done = d; wg.total = n; } }).then((a) => {
                    if (wg.got !== got) return;
                    got.gif = null;                 // the frames are made: the file itself is let go
                    wg.prepared = a; wg.clip = new ANIM.Clip(a.frames, a.w, a.h); wg.clipGen++; wg.mode = 'confirm';
                    log.info('home widget: ' + (got.name || 'a GIF') + ' prepared, ' + a.source.frames + ' -> ' + a.frames.length + ' frames in ' + (Date.now() - t0) + ' ms');
                }, (e) => {
                    if (wg.got !== got) return;
                    const why = e && e.code === 'GIF' ? 'This GIF cannot be played: ' + e.message + '.' : 'This GIF could not be made into frames (' + (e && e.message || e) + ').';
                    log.warn('home widget: ' + why);
                    drop.ack({ t: 'done', ok: false, error: why });
                    drop.cancel(); wg.mode = 'error'; wg.why = why; wg.got = null;
                });
            }, (e) => log.warn('home widget: ' + e));
        };
        /** Use this GIF: kept for the main Logo, or for the driving-mode slot Send was started for. The phone is told. */
        const wgUse = () => {
            if (wg.mode !== 'confirm' || !wg.prepared) return;
            const dest = wg.for || 'main';
            try {
                if (dest === 'main') aw.replace(wg.prepared, { name: wg.got.name });
                else player.save(dest, wg.prepared, { name: wg.got.name });
            } catch (e) {
                const why = 'The car could not keep this GIF (' + (e.code || e.message) + ').';
                log.warn('home widget: ' + why);
                drop.ack({ t: 'done', ok: false, error: why });
                drop.cancel(); wg.mode = 'error'; wg.why = why; wg.got = null; wg.prepared = null; wg.clip = null;
                return;
            }
            drop.ack({ t: 'done', ok: true });
            if (dest === 'main' && !gifOn()) settings.set(PREFS.LOGO_KEY, 'gif');
            logoSig = '';
            logoSync();
            wgReset();
        };
        /**
         * Stage 1 / 2 / 3, original pictures generated here, onto Comfort, Sport and Sport+. Turns per driving
         * mode on. The same prepare path as a GIF from the phone. Leaving the page stops it (wg.mode).
         */
        const wgStages = () => {
            const list = STAGES.stages();
            wg.mode = 'stages'; wg.done = 0; wg.total = list.length; wg.why = '';
            const step = (i) => {
                if (wg.mode !== 'stages') return;
                if (i >= list.length) {
                    if (!perOn()) settings.set(LM.PER_KEY, 'on');
                    logoSig = '';
                    logoSync();
                    wgReset();
                    return;
                }
                wg.done = i;
                ANIM.prepare(list[i].gif, { w: WSIZE[0], h: WSIZE[1], fit: 'contain', onProgress: (d, n) => { wg.done = i + d / Math.max(1, n); wg.total = list.length; } }).then((a) => {
                    if (wg.mode !== 'stages') return;
                    try { player.save(list[i].slot, a, { name: list[i].name }); }
                    catch (e) { wg.mode = 'error'; wg.why = 'The car could not keep the example (' + (e.code || e.message) + ').'; return; }
                    step(i + 1);
                }, (e) => { if (wg.mode !== 'stages') return; wg.mode = 'error'; wg.why = 'The example could not be made (' + (e && e.message || e) + ').'; });
            };
            step(0);
        };
        /** The Options entry's line. */
        const widgetLine = () => {
            if (wg.mode === 'stages') return 'Making the stage example...';
            if (wg.mode !== 'idle') return 'Sending a GIF...';
            if (aw.status().templateGone) return "Install G's Dash again";
            if (perOn()) {
                const label = car.data().driveMode || null;
                const r = LM.resolve(true, label, player.filled());
                const slot = r.slot ? LM.slotById(r.slot) : null;
                const name = slot ? slot.name : (label || 'No mode yet');
                if (r.use === 'slot') { const meta = player.info(r.slot); return name + ' · ' + (meta && meta.name ? meta.name : 'its GIF'); }
                return name + ' · main Logo';
            }
            if (!player.mainReady()) return 'G logo · send a GIF from your phone';
            if (!gifOn()) return 'G logo (your GIF is kept)';
            const st = aw.status();
            return 'My GIF' + (st.path === 'stream' ? ' · smooth' : st.path === 'hmi' ? ' · ' + Math.round(st.fps) + ' fps' : '');
        };
        /** The QR code in box b (whole device pixels a module, so it scans crisply at any scale), as G's Music's. */
        let wqr = null;
        function drawQr(cv, url, b) {
            if (!wqr || wqr.url !== url) wqr = { url, qr: qrcodegen.QrCode.encodeText(url, qrcodegen.QrCode.Ecc.MEDIUM) };
            const qr = wqr.qr, n = qr.size + 8, pl = cv.place, k = pl ? pl.scale : 1;
            const dev = { x: b.x * k + (pl ? pl.ox : 0), y: b.y * k + (pl ? pl.oy : 0), s: b.s * k };
            const m = Math.max(2, Math.floor(dev.s / n)), sd = n * m;
            cv.roundRect(b.x, b.y, b.s, b.s, 12, '#ffffff');
            if (pl) cv.xf(1, 0, 0);
            const ux = pl ? Math.round(dev.x + (dev.s - sd) / 2) : Math.round(b.x + (b.s - sd) / 2), uy = pl ? Math.round(dev.y + (dev.s - sd) / 2) : Math.round(b.y + (b.s - sd) / 2);
            for (let yy = 0; yy < qr.size; yy++) {
                let run = -1;
                for (let xx = 0; xx <= qr.size; xx++) {
                    const dark = xx < qr.size && qr.getModule(xx, yy);
                    if (dark && run < 0) run = xx;
                    if (!dark && run >= 0) { cv.fillRect(ux + (4 + run) * m, uy + (4 + yy) * m, (xx - run) * m, m, '#000000'); run = -1; }
                }
            }
            if (pl) cv.xf();
        }
        /**
         * The widget as the home screen shows it, in box b (the widget's shape, on the HMI's dark tile): the new GIF
         * while it waits for Use (clip), else what the widget plays now (My GIF's frame due, or the logo). One
         * picture id, set again only when the frame changes.
         */
        function widgetPreview(cv, b, clip) {
            const now = Date.now();
            cv.roundRect(b.x, b.y, b.w, b.h, 18, '#1b1f26');
            cv.strokeRoundRect(b.x, b.y, b.w, b.h, 18, 1, L.withAlpha('#ffffff', 0.10));
            let src;
            if (clip) { const i = clip.at(now); src = { key: 'new' + wg.clipGen + ':' + i, rgba: clip.rgba(i), w: clip.w, h: clip.h }; }
            else if (aw.on && aw.has()) { const f = aw.frame(now); src = { key: player.source() + ':' + f.index, rgba: f.rgba, w: f.w, h: f.h }; }
            else src = { key: 'logo', rgba: logo.d, w: logo.w, h: logo.h };
            if (src.key !== wg.prevKey) { record.setImage(IMG.wprev, src.w, src.h, src.rgba); wg.prevKey = src.key; }
            cv.image(IMG.wprev, b.x, b.y, b.w, b.h);
        }
        /** A button: the look's card (primary: lit in the accent), its label centred; a tap runs fn. */
        function wButton(cv, S, lk, key, x, y, w, h, text, primary, fn) {
            const t = S.t, u = lk.ui, acc = t.sel || t.accent, down = isDown(key);
            if (primary) { cv.roundRect(x, y, w, h, u.radius, L.withAlpha(acc, down ? 0.45 : 0.28)); cv.strokeRoundRect(x, y, w, h, u.radius, 2.5, acc); }
            else cardOf(lk)(cv, t, x, y, w, h, down);
            lblOf(cv, u)(fitText(cv, u.upper ? text.toUpperCase() : text, 22, w - 24, { font: u.lbl || u.txt }), x + w / 2, y + h / 2 + 8, 22, t.text, { align: 'center' });
            cv.target(x, y, w, h, () => { gDown = Date.now(); downKey = key; fn(); }, key, u.radius);
        }
        /**
         * Logo (Options). Left: the widget as the home screen shows it (the QR code while the phone is
         * awaited). Right: the G logo or My GIF, how the GIF plays, and Send a GIF / Remove; or the
         * steps of sending one, its preparation, and Use this GIF / Cancel. The same choice is the cluster graphic.
         */
        function widgetPage(cv, S, lk) {
            const t = S.t, u = lk.ui, lbl = lblOf(cv, u), card = cardOf(lk), acc = t.sel || t.accent, now = Date.now();
            header(cv, S, lk, lbl, card, 'Logo', 1);
            wgTick();
            const top = S.y + 34, bottom = S.y + S.h, pw = 576, ph = Math.round(pw * WSIZE[1] / WSIZE[0]);
            const waiting = wg.mode === 'qr' && drop.active() && !!drop.s;
            // left: the widget, or the QR code
            const modeNow = car.data().driveMode || null;
            lbl(waiting ? 'Scan with your phone' : wg.mode === 'confirm' ? 'Your GIF' : perOn() ? ('Now · ' + (modeNow || 'no mode yet')) : 'On the home screen', S.x, S.y + 20, 18, t.dim);
            if (waiting) {
                drawQr(cv, drop.s.url, { x: S.x + (pw - ph) / 2, y: top, s: ph });
                if (wg.prevKey) { record.dropImage(IMG.wprev); wg.prevKey = ''; }
            } else if (wg.mode === 'preparing' || wg.mode === 'stages') {
                cv.roundRect(S.x, top, pw, ph, 18, '#1b1f26');
                const f = wg.total ? wg.done / wg.total : 0, bw = pw - 120, by = top + ph / 2 + 10;
                cv.text('Making the frames', S.x + pw / 2, top + ph / 2 - 24, 26, t.text, { align: 'center', literal: true });
                cv.roundRect(S.x + 60, by, bw, 10, 5, L.withAlpha('#ffffff', 0.15));
                if (f > 0) cv.roundRect(S.x + 60, by, Math.max(10, bw * f), 10, 5, acc);
            } else widgetPreview(cv, { x: S.x, y: top, w: pw, h: ph }, wg.mode === 'confirm' ? wg.clip : null);
            // right
            const rx = S.x + pw + 40, rw = S.x + S.w - rx, bh = 76, by = bottom - bh, gap = 16, half = (rw - gap) / 2;
            let y = top + 34;
            const line = (s, size, c, o) => { if (y > by - 8) return; cv.text(fitText(cv, s, size, rw, o), rx, y, size, c, Object.assign({ literal: true }, o || {})); y += size + 14; };
            const kb = (n) => (n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
            const secs = (ms) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s';
            if (wg.mode === 'idle') {
                const st = aw.status(), mainHas = player.mainReady(), showH = perOn() ? 64 : 84;
                lbl('Shows', rx, S.y + 20, 18, t.dim);
                [['logo', 'The G logo', "G's Dash's mark"], ['gif', 'My GIF', mainHas ? (gifOn() ? st.name || 'Sent from your phone' : 'Kept') : 'Send one first']].forEach((o, i) => {
                    const ox = rx + i * (half + gap), on = (gifOn() && mainHas ? 'gif' : 'logo') === o[0], can = o[0] === 'logo' || mainHas;
                    if (on) { cv.roundRect(ox, top, half, showH, u.radius, L.withAlpha(acc, 0.22)); cv.strokeRoundRect(ox, top, half, showH, u.radius, 3, acc); } else card(cv, t, ox, top, half, showH, isDown('wg:' + o[0]));
                    cv.text(o[1], ox + 20, top + (perOn() ? 28 : 38), perOn() ? 22 : 24, on ? t.text : can ? t.dim : L.withAlpha(t.dim, 0.5), { literal: true });
                    cv.text(fitText(cv, o[2], 16, half - 40), ox + 20, top + (perOn() ? 50 : 64), 16, t.dim, { literal: true });
                    if (can && !on) cv.target(ox, top, half, showH, () => { gDown = Date.now(); downKey = 'wg:' + o[0]; settings.set(PREFS.LOGO_KEY, o[0]); }, 'wg:' + o[0], u.radius);
                });
                y = top + showH + 18;
                const chipW = 110, chipX = rx + rw - chipW * 2 - 10;
                cv.text('Per driving mode', rx, y + 22, 20, t.text, { literal: true });
                [['off', 'Off'], ['on', 'On']].forEach((o, i) => {
                    const ox = chipX + i * (chipW + 10), on = (perOn() ? 'on' : 'off') === o[0];
                    if (on) { cv.roundRect(ox, y, chipW, 44, u.radius, L.withAlpha(acc, 0.28)); cv.strokeRoundRect(ox, y, chipW, 44, u.radius, 2.5, acc); }
                    else card(cv, t, ox, y, chipW, 44, isDown('wg:per:' + o[0]));
                    cv.text(o[1], ox + chipW / 2, y + 30, 20, on ? t.text : t.dim, { align: 'center', literal: true });
                    if (!on) cv.target(ox, y, chipW, 44, () => { gDown = Date.now(); downKey = 'wg:per:' + o[0]; settings.set(LM.PER_KEY, o[0]); }, 'wg:per:' + o[0], u.radius);
                });
                y += 58;
                if (perOn()) {
                    const slots = LM.visibleSlots(LM.parseSeen(settings.get(LM.SEEN_KEY)));
                    const cells = [{ id: 'main', name: 'Main', sub: gifOn() && mainHas ? 'My GIF' : 'G logo' }].concat(slots.map((s) => {
                        const meta = player.filled()[s.id] ? player.info(s.id) : null;
                        return { id: s.id, name: s.name, sub: meta && meta.name ? meta.name : 'Main logo' };
                    }));
                    const cols = cells.length > 3 ? 3 : cells.length, cg = 10, cw = (rw - cg * (cols - 1)) / cols, ch = 58;
                    const nowId = LM.slotForMode(modeNow);
                    cells.forEach((c, i) => {
                        const col = i % cols, row = Math.floor(i / cols);
                        const ox = rx + col * (cw + cg), oy = y + row * (ch + cg);
                        if (oy + ch > by - 8) return;
                        const on = (wg.target || 'main') === c.id, live = c.id === nowId || (c.id === 'main' && !nowId);
                        if (on) { cv.roundRect(ox, oy, cw, ch, u.radius, L.withAlpha(acc, 0.22)); cv.strokeRoundRect(ox, oy, cw, ch, u.radius, 3, acc); }
                        else card(cv, t, ox, oy, cw, ch, isDown('wg:slot:' + c.id));
                        if (live) cv.circle(ox + 16, oy + 20, 5, acc);
                        cv.text(c.name, ox + (live ? 28 : 14), oy + 26, 18, t.text, { literal: true });
                        cv.text(fitText(cv, c.sub, 14, cw - 24), ox + 14, oy + 46, 14, t.dim, { literal: true });
                        if (!on) cv.target(ox, oy, cw, ch, () => { gDown = Date.now(); downKey = 'wg:slot:' + c.id; wg.target = c.id; }, 'wg:slot:' + c.id, u.radius);
                    });
                    y += Math.ceil(cells.length / cols) * (ch + cg) + 6;
                    line('Empty slots use the main Logo. The home widget, the cluster and Drive\'s right panel follow the mode.', 16, t.dim);
                } else {
                    if (mainHas && gifOn()) {
                        line(st.frames + ' frames · ' + secs(st.duration) + ' loop · ' + (st.fit === 'contain' ? 'Fit' : 'Fill'), 19, t.text);
                        const tone = st.path === 'stream' ? HUB.GREEN : st.path === 'hmi' ? '#ffb020' : t.dim;
                        if (y <= by - 28) { cv.circle(rx + 7, y - 7, 6, tone); cv.text(fitText(cv, st.path === 'off' ? "Plays once the widget is on the home screen" : 'Playing: ' + st.note, 19, rw - 22), rx + 22, y, 19, t.text, { literal: true }); y += 33; }
                    }
                    line('One Logo for every driving mode: the home widget, the cluster, and Drive\'s right panel when that panel is Logo.', 16, t.dim);
                }
                if (st.templateGone) line('Install G\'s Dash again in the Store: the widget was made for the renderer\'s stream template, now gone.', 17, '#ffb020');
                if (!drop.configured()) line('Send a GIF is not set up (app.json config widgetRelay).', 17, '#ffb020');
                if (wg.why) line(wg.why, 17, '#ffb020');
                const dest = sendTarget(), destSlot = dest === 'main' ? null : LM.slotById(dest);
                const sendLabel = destSlot ? 'Send for ' + destSlot.name : (mainHas ? 'Send another GIF' : 'Send a GIF');
                const removeId = destSlot && player.filled()[dest] ? dest : (mainHas ? 'main' : '');
                const nBtn = (drop.configured() ? 1 : 0) + (removeId ? 1 : 0) + (perOn() ? 1 : 0);
                const bw = nBtn > 1 ? (rw - gap * (nBtn - 1)) / nBtn : rw;
                let bx = rx;
                if (drop.configured()) { wButton(cv, S, lk, 'wg:send', bx, by, bw, bh, sendLabel, true, wgSend); bx += bw + gap; }
                if (removeId) {
                    const armed = now - wg.removeAt < 5000;
                    wButton(cv, S, lk, 'wg:remove', bx, by, bw, bh, armed ? 'Tap again to remove' : 'Remove', false, () => {
                        if (Date.now() - wg.removeAt >= 5000) { wg.removeAt = Date.now(); return; }
                        wg.removeAt = 0;
                        if (removeId === 'main') { aw.remove(); settings.set(PREFS.LOGO_KEY, 'logo'); }
                        else player.remove(removeId);
                        logoSig = '';
                        logoSync();
                    });
                    bx += bw + gap;
                }
                if (perOn()) {
                    const armed = now - wg.stageAt < 5000;
                    wButton(cv, S, lk, 'wg:stages', bx, by, bw, bh, armed ? 'Tap again' : 'Stage example', false, () => {
                        if (Date.now() - wg.stageAt < 5000) { wg.stageAt = 0; wgStages(); } else wg.stageAt = Date.now();
                    });
                }
            } else if (wg.mode === 'qr') {
                lbl('Send a GIF', rx, S.y + 20, 18, t.dim);
                y = top + 30;
                const step = (num, s) => {
                    cv.circle(rx + 16, y - 8, 16, L.withAlpha(acc, 0.2));
                    cv.text(num, rx + 16, y, 20, acc, { align: 'center', font: 'bold', literal: true });
                    cv.text(fitText(cv, s, 22, rw - 48), rx + 46, y, 22, t.text, { literal: true });
                    y += 44;
                };
                step('1', 'Scan the code with your phone\'s camera.');
                step('2', 'Pick an animated GIF, Fill or Fit, and Send.');
                step('3', 'It shows here: tap Use this GIF.');
                y += 6;
                if (drop.phase === 'error') line(drop.message.charAt(0).toUpperCase() + drop.message.slice(1) + '.', 20, '#ffb020');
                else if (drop.phase === 'downloading') line('Downloading your GIF (' + kb(drop.size) + ')...', 20, acc);
                else {
                    const left = drop.left(), mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
                    line('No camera? Open ' + String(WCFG.widgetRelay || '').replace(/^https:\/\//, '').replace(/\/$/, '') + ' and type', 18, t.dim);
                    cv.text(drop.codeText(), rx, y + 18, 44, t.text, { font: u.num || 'bold', literal: true });
                    y += 72;
                    line('Waiting for the phone' + (drop.message ? ' (' + drop.message + ')' : '') + ' · new code in ' + mm + ':' + (ss < 10 ? '0' : '') + ss, 18, t.dim);
                }
                wButton(cv, S, lk, 'wg:new', rx, by, half, bh, 'New code', drop.phase === 'error', wgSend);
                wButton(cv, S, lk, 'wg:cancel', rx + half + gap, by, half, bh, 'Cancel', false, () => wgCancel());
            } else if (wg.mode === 'preparing' || wg.mode === 'stages') {
                lbl(wg.mode === 'stages' ? 'Stage example' : 'Send a GIF', rx, S.y + 20, 18, t.dim);
                y = top + 30;
                if (wg.mode === 'stages') {
                    line('Stage 1, 2 and 3', 30, t.text, { font: 'bold' });
                    line('Comfort, Sport and Sport+, an original figure. Your GIFs in those slots are replaced.', 18, t.dim);
                    line('Making them: ' + Math.min(wg.total, Math.floor(wg.done) + 1) + ' of ' + wg.total, 20, acc);
                } else {
                    line('Got it from your phone', 30, t.text, { font: 'bold' });
                    if (wg.got && wg.got.name) line(wg.got.name, 20, t.dim);
                    line(wg.total ? 'Making the frames: ' + wg.done + ' of ' + wg.total : 'Reading the GIF...', 20, acc);
                }
                wButton(cv, S, lk, 'wg:cancel', rx + half + gap, by, half, bh, 'Cancel', false, () => wgCancel());
            } else if (wg.mode === 'confirm') {
                const a = wg.prepared, src = a.source, dest = wg.for && wg.for !== 'main' ? LM.slotById(wg.for) : null;
                lbl('Send a GIF', rx, S.y + 20, 18, t.dim);
                y = top + 30;
                line(dest ? 'Use this GIF for ' + dest.name + '?' : 'Put this GIF on the widget?', 30, t.text, { font: 'bold' });
                if (wg.got.name) line(wg.got.name, 20, t.dim);
                line((a.fit === 'contain' ? 'Fit' : 'Fill') + ' · ' + a.frames.length + ' frames · ' + secs(a.duration) + ' loop · ' + kb(a.frames.reduce((n, f) => n + f.png.length, 0)), 20, t.text);
                line('From ' + src.w + ' x ' + src.h + ', ' + src.frames + ' frames, ' + kb(src.bytes) + (src.frames > a.frames.length ? ' (frames merged, the same pace)' : ''), 17, t.dim);
                if (dest) line('Other modes keep their own GIF, or the main Logo when that slot is empty.', 17, t.dim);
                else if (player.mainReady()) line('It takes the place of the main Logo GIF.', 17, t.dim);
                wButton(cv, S, lk, 'wg:use', rx, by, half, bh, 'Use this GIF', true, wgUse);
                wButton(cv, S, lk, 'wg:cancel', rx + half + gap, by, half, bh, 'Cancel', false, () => wgCancel());
            } else {
                lbl('Send a GIF', rx, S.y + 20, 18, t.dim);
                y = top + 30;
                line('Not used', 30, t.text, { font: 'bold' });
                line(wg.why, 20, '#ffb020');
                line('A GIF up to 8 MB and 2048 px a side works.', 18, t.dim);
                wButton(cv, S, lk, 'wg:new', rx, by, half, bh, 'Try again', true, wgSend);
                wButton(cv, S, lk, 'wg:back', rx + half + gap, by, half, bh, 'Back', false, () => { wgReset(); });
            }
        }

        /**
         * Drive's right panel when it is Logo: the same picture as the home widget and the cluster
         * (the G, My GIF, or the driving mode's GIF), contained in the look's panel place. The frame
         * is uploaded only when it changes, so a GIF keeps its pace while the car moves.
         */
        let panelStamp = '';
        function driveLogo(cv, lk, S) {
            const r = lk.panelRect ? lk.panelRect(S) : null;
            if (!r || !(r.w > 16 && r.h > 16)) return;
            if (typeof lk.panelPlate === 'function') lk.panelPlate(cv, S.t, r.x, r.y, r.w, r.h);
            else cv.roundRect(r.x, r.y, r.w, r.h, (lk.ui && lk.ui.radius) || 12, '#101216');
            const pad = 18, bw = Math.max(1, r.w - pad * 2), bh = Math.max(1, r.h - pad * 2);
            let sw, sh, rgba, stamp;
            if (aw.on && aw.has()) {
                const f = aw.frame(S.now || Date.now());
                if (!f || !f.rgba) return;
                sw = f.w; sh = f.h; rgba = f.rgba; stamp = player.source() + ':' + f.index;
            } else { sw = logo.w; sh = logo.h; rgba = logo.d; stamp = 'g'; }
            if (stamp !== panelStamp) {
                record.setImage(IMG.panel, sw, sh, Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength));
                panelStamp = stamp;
            }
            const box = containBox(sw, sh, bw, bh);
            cv.image(IMG.panel, r.x + pad + box.x, r.y + pad + box.y, box.w, box.h);
        }

        ctx.loop('MAIN', 10, () => {
            const lk = look(), t = palette();
            const cv = ctx.canvas(1600, 520);
            const reach = cv.own ? G.pageBottom(cv) : 520;        // reading cv.extra: the page reaches lower on screen
            cv.clear(t.bg);
            // the look's background, marked: the full-screen layout carries it on under the back arrow column (0.13.6)
            if (lk.background) G.background(cv, (c) => lk.background(c, t, reach));
            const S = state(cv, t, reach);
            G.frame(cv, t, cv.own ? [] : ["G's Dash"], 0, []);
            ownNow = !!cv.own;
            logoUpdate(visible());
            if (!cv.own) page = 0;
            if (page !== 8) wgLeave();
            autoStep(S);
            const P = Object.assign({}, S, { y: SET_Y, h: reach - SET_Y - 6 });
            // the patch service's socket: open only while Cluster & HUD or Diagnostics is on screen
            if ((page === 4 || page === 3) && visible()) cmap.open(); else { cmap.close(); ask = null; }
            if (page === 1) optionsPage(cv, P, lk);
            else if (page === 2) spotifyPage(cv, P, lk);
            else if (page === 4) clusterPage(cv, P, lk);
            else if (page === 5) themePage(cv, P, lk);
            else if (page === 3) diagPage(cv, P, lk);
            else if (page === 6) drivingPage(cv, P, lk);
            else if (page === 7) unitsPage(cv, P, lk);
            else if (page === 8) widgetPage(cv, P, lk);
            else {
                const id = HUB.SCREENS[scr][0];
                // the G: the settings button, in the look's corner on Drive, bottom right elsewhere
                const corner = { x: S.x + S.w - GB_W, y: S.y + S.h - GB_H, w: GB_W, h: GB_H };
                const gr = id === 'drive' && lk.gRect ? lk.gRect(S) : corner;
                gRectNow = gr;
                const st = HUB.style(lk, t);
                music.band = null;
                if (id === 'drive') {
                    // a look without a panel place keeps its g-meter
                    if (!lk.panelRect) S.panel = 'g';
                    S.zones = null;
                    lk.draw(cv, S);
                    if (S.panel === 'spotify') music.panel(cv, S, lk, lk.panelRect(S), HUB.dotsBox(gr, HUB.SCREENS.length));
                    else if (S.panel === 'logo') driveLogo(cv, lk, S);
                    if (cv.own) favDrive(cv, S, lk);
                } else if (id === 'warmup') HUB.warmup(cv, st, Object.assign({}, S, { redline: WARM_REDLINE, maxRpm: Math.max(7000, S.maxRpm) }), warmModel(S));
                else if (id === 'gforce') HUB.gforce(cv, st, S, gModel(S));
                else if (id === 'tires') HUB.tires(cv, st, S, tireModel(S));
                HUB.dots(cv, st, gr, scr, HUB.SCREENS.length, id === 'drive' && !!lk.dotsAbove && S.panel === 'g');
                if (toastMsg) {
                    const age = Date.now() - toastMsg.at;
                    if (age > 2600) toastMsg = null;
                    else HUB.toast(cv, st, S, toastMsg.text, age, toastMsg.sub, { cx: S.x + S.w / 2, y: gr.y + gr.h - 30 });
                }
                gButton(cv, t, lk, gr, false, isDown('g'));
                if (cv.own) cv.target(gr.x, gr.y, gr.w, gr.h, () => press(1, 'g'), 'g', lk.ui.radius);
            }
            return ui.image('MAIN_GFX', cv);
        });
    },
});
