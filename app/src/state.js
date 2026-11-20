// state.js — the document the editor edits.
//
// One mutable object and a listener set. Nothing in the UI reads a control back
// during a render: the canvas is a pure function of this state, so the editor,
// the screenshot harness and the PNG export all drive the same picture.

/** The export sizes in the rail, in the order they are shown. */
export const SIZES = [
  { id: 'wide', label: 'Widescreen', note: '1920 × 1080', w: 1920, h: 1080 },
  { id: 'square', label: 'Square', note: '1080 × 1080', w: 1080, h: 1080 },
  { id: 'tall', label: 'Portrait', note: '1080 × 1350', w: 1080, h: 1350 },
];

/** The most panels any layout asks for: crops are kept for all of them. */
export const MAX_PANELS = 6;

/** A crop: which photo, how far in the zoom goes (1 = exactly covers), where the window sits. */
export function createCrop(photo = 0) {
  return { photo, zoom: 1.04, fx: 0, fy: 0 };
}

/** The size record a state points at. */
export function sizeOf(state) {
  return SIZES.find((size) => size.id === state.size) ?? SIZES[0];
}

/**
 * Builds a document. Everything the cover needs lives here and nowhere else:
 * photos, one crop per panel slot, the caption, the layout, the grade, the size.
 */
export function createState(seed = {}) {
  const listeners = new Set();

  const state = {
    /** Loaded photos: { id, label, image, w, h }. */
    photos: [],
    /** One crop per panel slot, in layout order. */
    crops: Array.from({ length: MAX_PANELS }, (_, i) => createCrop(i)),
    caption: 'Vice Ledger',
    /** The ribbon text down the right of the title band. */
    series: 'Vice Ledger',
    edition: '01',
    layout: 'classic',
    grade: 'dusk',
    size: 'wide',
    /** Index of the panel the crop controls are pointed at. */
    selected: 0,
    ...seed,
  };

  /** Subscribe; returns the unsubscribe. */
  state.on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  /** Tell every listener something changed. */
  state.emit = (reason = 'change') => {
    for (const fn of [...listeners]) fn(state, reason);
  };

  /** Merge a patch and announce it. */
  state.set = (patch, reason = 'change') => {
    Object.assign(state, patch);
    state.emit(reason);
  };

  state.setCrop = (index, patch, reason = 'crop') => {
    const crop = state.crops[index];
    if (!crop) return;
    Object.assign(crop, patch);
    state.emit(reason);
  };

  state.cropAt = (index) => state.crops[index] ?? createCrop(0);

  /** The photo a panel shows, or null while the tray is empty. */
  state.photoAt = (index) => {
    if (state.photos.length === 0) return null;
    const crop = state.cropAt(index);
    return state.photos[crop.photo % state.photos.length] ?? null;
  };

  /** Append photos; a fresh tray assigns one photo per panel so every panel has art at once. */
  state.addPhotos = (list) => {
    const wasEmpty = state.photos.length === 0;
    for (const photo of list) state.photos.push(photo);
    if (wasEmpty) state.crops.forEach((crop, i) => { crop.photo = i; });
    state.emit('photos');
  };

  state.cyclePhoto = (index, step = 1) => {
    const crop = state.crops[index];
    if (!crop || state.photos.length === 0) return;
    crop.photo = (crop.photo + step + state.photos.length) % state.photos.length;
    state.emit('crop');
  };

  return state;
}
