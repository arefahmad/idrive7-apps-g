# Changelog

## G's Dash 0.20.0

- New look: Desktop '98, the dash as a late-90s desktop in original art (no maker's name, logo or
  artwork). Grey bevelled windows with navy gradient title bars on a teal desktop: the speed in a
  sunken field in big pixel numerals, the rpm as a block progress bar ("Revving..."), and past the
  shift point a "Shift now!" warning dialog; the gear in its own window with the drive mode as radio
  buttons; oil and coolant as progress bars; a black performance-monitor g-meter with a green grid and
  a list of peaks; a taskbar with a G button, the windows and the time in its tray.
- Its cluster logo is the badge in a bevelled window with an arrow pointer (a shader, with
  logo_desktop.png as the fallback). The HUD uses progress-bar blocks on the Pixel look's glyphs; the
  cluster dials use Stock's.

## G's Dash 0.19.0

- New look: Aura, anime battle energy in original art. The tach ring sits in an aura of flames that
  powers up with the revs: calm blue-white at idle, blazing gold as the rpm climbs, lightning
  crackling round it from the shift lights on. The flames lean with the lateral g and shed rising
  embers; speed lines streak past, more of them the faster the car goes.
- Aura's readouts: the rpm as a power level, the gear in a glowing energy orb, an amber scanner
  g-meter with a sweeping beam, battle time. Its cluster logo is a gold G in rising flames with
  lightning (a shader, with logo_aura.png as the fallback). The HUD uses Aura colours on M Style's
  glyphs; the cluster dials use GT's.
- Theme shows nine looks as five a row; long names fit the narrower cards.

## G's Dash 0.18.2

- Logo can follow the driving mode. Off by default, so one Logo behaves as before. On, Comfort, Sport,
  Sport+ and any other mode the car reports (Eco Pro, Adaptive and the rest of the same badge) each have
  a GIF slot. An empty slot uses the main Logo.
- The mode is the Drive badge: `FES.statusFESVehicleDynamicSwitchHMI.actualValueModeDrivingExperience`.
- Drive's right panel can be that Logo, beside the G-meter and Spotify. The G-meter stays the default.
- Stage 1 / 2 / 3 is original art for Comfort, Sport and Sport+. Use your own GIFs for any other picture.
