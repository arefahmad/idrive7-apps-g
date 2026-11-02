'use strict';
/**
 * units.js - G's Dash 0.13.6: the units G's Dash shows (Options > Units). The car's values stay in one
 * unit inside the app (speed km/h from the car, shown mph by default; temperatures °F, as every zone,
 * threshold and setting is defined; tyre pressures psi, car.js); only what is shown is converted here.
 *   speed        mph (default) | km/h      unitSpeed
 *   temperature  °F (default)  | °C        unitTemp
 *   pressure     psi (default) | bar | kPa unitPress
 * G's Dash shows no distance, boost or fuel economy, so there is nothing else to pick. Node 8: no ?., ??
 * or object spread.
 */
const KMH_PER_MPH = 1.609344, KPA_PER_PSI = 6.894757;
const isNum = (v) => typeof v === 'number' && isFinite(v);

const KEYS = { speed: 'unitSpeed', temp: 'unitTemp', press: 'unitPress' };
// [value, the choice's name]; the first is the default (as before 0.13.6)
const CHOICES = {
    speed: [['mph', 'mph'], ['kmh', 'km/h']],
    temp: [['f', '\u00b0F'], ['c', '\u00b0C']],
    press: [['psi', 'psi'], ['bar', 'bar'], ['kpa', 'kPa']],
};
const DEFAULTS = { speed: 'mph', temp: 'f', press: 'psi' };

/** the picks from the settings ({ get(key) }), each one of its CHOICES, else the default */
function pick(settings) {
    const o = {};
    Object.keys(KEYS).forEach((k) => {
        const v = settings && typeof settings.get === 'function' ? settings.get(KEYS[k]) : undefined;
        o[k] = CHOICES[k].some((c) => c[0] === v) ? v : DEFAULTS[k];
    });
    return o;
}
const nameOf = (kind, v) => { const c = CHOICES[kind].find((x) => x[0] === v); return c ? c[1] : CHOICES[kind][0][1]; };

/* ----- speed: from km/h (the car's) ----- */
function speed(kmh, u) { return isNum(kmh) ? (u === 'kmh' ? kmh : kmh / KMH_PER_MPH) : kmh; }
/** from mph (the cluster's speed as shown) */
function speedFromMph(mph, u) { return isNum(mph) ? (u === 'kmh' ? mph * KMH_PER_MPH : mph) : mph; }
/** the speed's label as the looks print it: MPH | KM/H */
function speedLabel(u) { return u === 'kmh' ? 'KM/H' : 'MPH'; }

/* ----- temperature: from °F ----- */
function temp(f, u) { return isNum(f) ? (u === 'c' ? (f - 32) * 5 / 9 : f) : f; }
/** whole degrees in the unit, null without a value */
function tempNum(f, u) { return isNum(f) ? Math.round(temp(f, u)) : null; }
function tempUnit(u) { return u === 'c' ? '\u00b0C' : '\u00b0F'; }
/** '194°F' / '90°C'; none: '--' */
function tempText(f, u, none) { return isNum(f) ? tempNum(f, u) + tempUnit(u) : (none == null ? '--' : none); }
/** a setting's value (°F) for a row: '194 °F' / '90 °C' */
function tempSetting(f, u) { return isNum(Number(f)) ? tempNum(Number(f), u) + ' ' + tempUnit(u) : String(f); }

/* ----- pressure: from psi ----- */
function press(psi, u) { return isNum(psi) ? (u === 'kpa' ? psi * KPA_PER_PSI : u === 'bar' ? psi * KPA_PER_PSI / 100 : psi) : psi; }
const DEC = { psi: 1, bar: 2, kpa: 0 };
/** the number as shown: psi 35.0, bar 2.41, kPa 241; none: '--' */
function pressText(psi, u, none) {
    if (!isNum(psi)) return none == null ? '--' : none;
    const k = DEC[u] == null ? 1 : DEC[u], v = press(psi, u);
    return k ? v.toFixed(k) : String(Math.round(v));
}
/** a difference (pressure - target): '+' when not below, as before 0.13.6: +1.5 / -0.10 / +10 */
function pressDelta(dpsi, u) { return isNum(dpsi) ? (dpsi >= 0 ? '+' : '') + pressText(dpsi, u) : '--'; }
function pressUnit(u) { return u === 'kpa' ? 'kPa' : u === 'bar' ? 'bar' : 'psi'; }

/** the Options tile's line: 'mph · °F · psi' */
function summary(p) { return [nameOf('speed', p.speed), nameOf('temp', p.temp), nameOf('press', p.press)].join(' \u00b7 '); }

module.exports = {
    KEYS, CHOICES, DEFAULTS, KMH_PER_MPH, KPA_PER_PSI, pick, nameOf, summary,
    speed, speedFromMph, speedLabel, temp, tempNum, tempUnit, tempText, tempSetting, press, pressText, pressDelta, pressUnit,
};
