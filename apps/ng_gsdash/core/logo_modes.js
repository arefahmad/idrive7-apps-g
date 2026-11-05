'use strict';
/**
 * logo_modes.js - which Logo plays for the car's driving mode (G's Dash). Plain logic, no drawing.
 *
 * The mode is the same badge the Drive screen shows. kit/runtime/car.js decodeMode reads
 * FES.statusFESVehicleDynamicSwitchHMI.actualValueModeDrivingExperience (enum
 * ActualValueModeDrivingExperience2, by name or by wire number) and stores the badge label on
 * car.data().driveMode: COMFORT, COMFORT+, ECO PRO, ECO PRO+, SPORT, SPORT+, ADAPTIVE, INDIVIDUAL.
 * Anything else (initialising, invalid, offroad, ...) is no badge, and no slot.
 *
 * Setting "logoPerMode" off (the default): the single Logo (setting "logo") is the home-screen widget
 * and the cluster graphic, as before. On: each slot below can hold its own GIF. An empty slot, a mode
 * with no slot, or no mode yet, plays that main Logo (the G mark unless My GIF is chosen).
 *
 * Comfort, Sport and Sport+ are always on the Logo page. Comfort+, Eco Pro, Eco Pro+, Adaptive and
 * Individual appear once the car has reported them (saved as "logoModesSeen", a comma list, the same
 * kind of extra key as favourite looks). Node 8: no ?., no ??, no object spread.
 */

const PER_KEY = 'logoPerMode';
const SEEN_KEY = 'logoModesSeen';

/* id, the badge label car.js stores, the name on the Logo page, whether the slot is always listed */
const SLOTS = [
    { id: 'comfort', label: 'COMFORT', name: 'Comfort', always: true },
    { id: 'comfortplus', label: 'COMFORT+', name: 'Comfort+', always: false },
    { id: 'ecopro', label: 'ECO PRO', name: 'Eco Pro', always: false },
    { id: 'ecoproplus', label: 'ECO PRO+', name: 'Eco Pro+', always: false },
    { id: 'sport', label: 'SPORT', name: 'Sport', always: true },
    { id: 'sportplus', label: 'SPORT+', name: 'Sport+', always: true },
    { id: 'adaptive', label: 'ADAPTIVE', name: 'Adaptive', always: false },
    { id: 'individual', label: 'INDIVIDUAL', name: 'Individual', always: false },
];

const BY_LABEL = {};
const BY_ID = {};
SLOTS.forEach((s) => { BY_LABEL[s.label] = s.id; BY_ID[s.id] = s; });

function slotById(id) { return BY_ID[id] || null; }

/** The badge label (car.data().driveMode) -> slot id, or null when that mode has no slot. */
function slotForMode(label) {
    if (label === undefined || label === null || label === '') return null;
    return BY_LABEL[String(label)] || null;
}

/**
 * Saved "logoModesSeen" (a comma list of slot ids or badge labels, or an array) -> the optional slot
 * ids the car has reported, in slot order. Comfort, Sport and Sport+ are not stored: they are always shown.
 */
function parseSeen(saved) {
    const raw = Array.isArray(saved) ? saved : String(saved === undefined || saved === null ? '' : saved).split(',');
    const want = {};
    raw.forEach((s) => {
        const t = String(s).trim();
        if (!t) return;
        const id = BY_ID[t] ? t : BY_LABEL[t];
        if (id && !BY_ID[id].always) want[id] = true;
    });
    const out = [];
    SLOTS.forEach((s) => { if (want[s.id]) out.push(s.id); });
    return out;
}
const serializeSeen = (list) => (list || []).join(',');

/** seen with this badge's optional slot added (the same array when nothing new, or the mode has no slot). */
function noteSeen(seen, label) {
    const id = slotForMode(label);
    const slot = id && BY_ID[id];
    if (!slot || slot.always || seen.indexOf(id) >= 0) return seen;
    return seen.concat([id]);
}

/** Slots the Logo page lists: Comfort, Sport, Sport+, then any optional slot the car has reported. */
function visibleSlots(seen) {
    const have = {};
    (seen || []).forEach((id) => { have[id] = true; });
    return SLOTS.filter((s) => s.always || have[s.id]);
}

/**
 * Which picture plays. perMode: the option is on. label: the badge, or null. filled: { slotId: true }
 * when that slot has a GIF saved.
 * { slot, use: 'slot' | 'main', reason: 'off' | 'slot' | 'empty' | 'none' | 'unknown' }.
 * 'off': the option is off (slot is null). 'slot': that mode's own GIF. 'empty': the mode's slot has
 * no GIF, so the main Logo. 'none': no mode yet. 'unknown': a label with no slot.
 */
function resolve(perMode, label, filled) {
    if (!perMode) return { slot: null, use: 'main', reason: 'off' };
    const id = slotForMode(label);
    if (!id) return { slot: null, use: 'main', reason: label ? 'unknown' : 'none' };
    if (filled && filled[id]) return { slot: id, use: 'slot', reason: 'slot' };
    return { slot: id, use: 'main', reason: 'empty' };
}

/** The data-folder file for a slot. The main Logo stays widget_anim.bin (the name it has had). null: not a slot. */
function fileName(id) {
    if (!id || id === 'main') return 'widget_anim.bin';
    if (!BY_ID[id]) return null;
    return 'widget_anim_' + id + '.bin';
}

module.exports = {
    PER_KEY, SEEN_KEY, SLOTS, slotById, slotForMode, parseSeen, serializeSeen, noteSeen, visibleSlots, resolve, fileName,
};
