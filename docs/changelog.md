# Changelog

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
