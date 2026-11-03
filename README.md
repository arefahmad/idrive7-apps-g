# idrive7-apps

Apps for BMW iDrive 7 head units, installed through robertn_store.

- **G's Dash** (`ng_gsdash`): driver display and car hub in seven looks, with a home-screen widget. Cluster skins that match your look, a HUD (a big gear and a tach with shift lights), a Cluster source picker, and favourite looks you switch with a tap on the gear on Drive. 0.11.0 adds a new Showcase, the Carbon Grid M Style and oil / coolant colour zones; 0.11.2 makes the cluster skins fit beside the CarPlay map, G's Music and G's TV; 0.11.3 stops the HUD and cluster dials flickering; 0.12.0 adds a full-screen classic-dials cluster test (Diagnostics, TEST); 0.12.1 fixes head unit crashes with the HUD on when switching looks or swiping pages. 0.13.0 slims the HUD to a compact D3-style gear under a tach arc with built-in shift lights (no speed; far less renderer memory), shows cluster pictures only once they are uploaded whole, and logs failed uploads and high cluster memory. 0.13.1 draws the cluster logo in your look (each look's own G, using none of the renderer's memory). 0.13.2 adds optional encrypted crash logs (Diagnostics > Remote logs; inactive unless the unit has its own private drop installed). 0.13.3: a new install starts with the car's own dials and HUD; the HUD is experimental. 0.13.4 keeps the last few minutes of cluster, HUD and memory lines in a small ring (96 KB at most) for the next crash report, only with remote logs set up and on. 0.13.5 shows the app's name only once in the top bar. 0.13.6 adds Options > Units (where the G-meter tile was): speed in mph or km/h, temperatures in °F or °C and tire pressure in psi, bar or kPa (mph, °F and psi stay the defaults). Full screen, the page's background now reaches the screen's left edge beside the head unit's back arrow (no more black bar). 0.13.7: the cluster skins follow Units too - in km/h every look shows a 0-320 km/h speedo and the digital speed in km/h (mph stays the default), and the G's Dash Settings list shows temperatures in °C when chosen. 0.13.8: the HUD and cluster dials come back by themselves after a Siri or other popup, the cluster dials no longer stick on "Making the skin", and the full-screen cluster test waits for the HUD to let go before it starts. 0.13.9: a G's Dash on cluster & HUD switch puts the cluster and HUD back to stock, and each cluster pick says what it can show now and why not. 0.14.0 adds the Vector look (Ice, Motorsport, Amber or White) and a choice of colours for Digital '84 (Green, Purple or Red), picked on Options > Theme.
  Optional *Cluster map* setting: requires the Waze on cluster tool from the Store; off by default;
  untested on most firmware. To revert, set it Off and restart the head unit, or remove the tool.
- **G's Music** (`ng_spotify`): full-screen Spotify player with lyrics, a visualizer and a home-screen
  widget. Needs Spotify Premium and internet through the Store's uplink. Setup: [docs/spotify.md](docs/spotify.md). 0.6.0 shows synced lyrics or a visualizer in the cluster while music plays; 0.7.0 adds a Cluster on/off button and Shuffle Liked Songs. 0.7.1 remakes a cluster layer only after the old one is let go. 0.7.2 adds encrypted crash logs; 0.7.4 keeps a small crash-surviving ring of cluster lines for them. 0.7.5 draws the whole cluster view smaller, inside the cluster's dark edge, and fits long lyric lines (smaller, then two lines). 0.7.6 shows the app's name only once in the top bar. 0.7.7: the background reaches the left edge beside the back arrow. 0.7.9: with nothing playing it says to open Spotify on your phone.
- **G's TV** (`ng_tv`): experimental. TV channels with a guide, channel up/down and fullscreen, plus your own
  direct MP4 links added from your phone. Picture only while parked, video only. Needs internet
  through the Store's uplink. 0.4.3 adds instant resume after driving, a HUD button, and parked-only video in the cluster's centre map area. 0.4.6 makes a new cluster or HUD video layer only after the previous one is let go. 0.4.7 adds encrypted crash logs; 0.4.9 keeps a small crash-surviving ring of cluster lines for them. 0.4.10 carries the shared top-bar fix (looks the same). 0.4.11: the background reaches the left edge beside the back arrow.

## Install

1. On the car, open **robertn_store → Settings → Add source**.
2. Enter `nickgcode/idrive7-apps` (or paste this repository's link) and save.
3. The apps appear in the Store's list. Choose one and tap **Install**. Updates appear there as well.

The Store builds each app on the head unit from this repository (`mgu-repo.json`, `kit/`); nothing
here contains BMW's SDK. To remove an app, uninstall it in the Store.

## Disclaimer

Unofficial. Not made, endorsed or supported by BMW or by the Store's author. Use at your own risk:
you are responsible for your car and for how you use these apps. Don't let them distract you while driving.

## License

MIT, see [LICENSE](LICENSE). Bundled third-party code keeps its own licence:
[kit/LICENSE.idrive7-apps](kit/LICENSE.idrive7-apps), [apps/ng_spotify/LICENSE](apps/ng_spotify/LICENSE),
[apps/ng_tv/LICENSE](apps/ng_tv/LICENSE).
