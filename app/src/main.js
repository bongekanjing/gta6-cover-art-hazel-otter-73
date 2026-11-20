// main.js — the editor shell.
//
// Builds the rail from the same tables the renderer uses (LAYOUTS, GRADES,
// SIZES), points every control at the document in state.js, and repaints the
// preview through cover.js. The preview is a reduced-resolution render of the
// exact same function the export uses, so what you see is the file you get.

import { SIZES, createState, sizeOf } from './state.js';
import { LAYOUTS, LAYOUT_ORDER } from './panels.js';
import { GRADES, GRADE_ORDER } from './ink.js';
import { renderCover, renderToCanvas, invalidateArt } from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const alias = (name) => name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();

const state = createState();
/** The panel the crop card edits. */
let active = 0;
let previewScale = 1;
let pending = 0;

// --------------------------------------------------------------- the rail

/** A labelled row of choice chips. */
function chipRow(host, items, current, onPick, name) {
  host.textContent = '';
  const row = document.createElement('div');
  row.className = 'chips';
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', name);
  for (const item of items) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.value = item.id;
    chip.setAttribute('role', 'radio');
    chip.setAttribute('aria-checked', String(item.id === current));
    chip.innerHTML = `<b>${item.label}</b><i>${item.note ?? ''}</i>`;
    chip.addEventListener('click', () => onPick(item.id));
    row.appendChild(chip);
  }
  host.appendChild(row);
  return row;
}

function buildThumbs() {
  const host = $('tray');
  host.textContent = '';
  if (state.photos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'tray-empty';
    empty.textContent = 'No photos yet — drop some above.';
    host.appendChild(empty);
    return;
  }
  state.photos.forEach((photo, i) => {
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'thumb';
    thumb.title = `${photo.label} — click to put it in panel ${active + 1}`;
    const img = document.createElement('img');
    img.src = photo.image.currentSrc || photo.image.src;
    img.alt = photo.label;
    thumb.appendChild(img);
    thumb.addEventListener('click', () => {
      state.setCrop(active, { photo: i, zoom: 1.03, fx: 0, fy: 0 });
      buildThumbs();
      markThumbs();
      redraw();
    });
    host.appendChild(thumb);
  });
  markThumbs();
}

function markThumbs() {
  const used = state.cropAt(active).photo;
  [...$('tray').children].forEach((el, i) => el.classList?.toggle('is-on', i === used));
}

function buildAll() {
  chipRow($('layouts'), LAYOUT_ORDER.map((id) => LAYOUTS[id]), state.layout, (id) => {
    state.set({ layout: id }, 'layout');
  }, 'Layout');

  chipRow($('grades'), GRADE_ORDER.map((id) => GRADES[id]), state.grade, (id) => {
    state.set({ grade: id }, 'grade');
  }, 'Grade');

  chipRow($('sizes'), SIZES.map((s) => ({ id: s.id, label: s.label, note: s.note })), state.size, (id) => {
    state.set({ size: id }, 'size');
  }, 'Size');

  buildThumbs();
  syncInputs();
}

/** Reflects the document into the rail (chips, panel card, size note). */
function syncInputs() {
  for (const [id, value] of [
    ['layouts', state.layout],
    ['grades', state.grade],
    ['sizes', state.size],
  ]) {
    for (const chip of $(id).querySelectorAll('.chip')) {
      const on = chip.dataset.value === value;
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-checked', String(on));
    }
  }

  const size = sizeOf(state);
  $('export-note').textContent = `${size.note} PNG`;
  $('export').firstChild.textContent = `Export ${size.label} `;

  const crop = state.cropAt(active);
  $('crop-label').textContent = `Panel ${active + 1}`;
  $('zoom').value = String(crop.zoom);
  $('zoom-out').textContent = `${crop.zoom.toFixed(2)}×`;
  $('pan-x').value = String(crop.fx);
  $('pan-y').value = String(crop.fy);
  const photo = state.photoAt(active);
  $('crop-photo').textContent = photo ? photo.label : '—';
  const count = state.crops.length;
  for (const el of document.querySelectorAll('[data-panel]')) {
    const i = Number(el.dataset.panel);
    el.classList.toggle('is-on', i === active);
    el.disabled = i >= Math.min(count, 6);
  }
  $('stat').textContent = `${state.photos.length} photo${state.photos.length === 1 ? '' : 's'} · ${state.layout} · ${state.grade} · ${size.note}`;
  markThumbs();
}

// ------------------------------------------------------------------ preview

/** Fits the preview canvas to its box and repaints at the device's resolution. */
function redraw() {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const canvas = $('preview');
    const box = canvas.parentElement.getBoundingClientRect();
    const size = sizeOf(state);
    const ratio = size.w / size.h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    // The canvas keeps the export's aspect; the box keeps it on screen.
    let cssW = box.width - 4;
    let cssH = cssW / ratio;
    if (cssH > box.height - 4) {
      cssH = box.height - 4;
      cssW = cssH * ratio;
    }
    canvas.style.width = `${Math.max(40, cssW)}px`;
    canvas.style.height = `${Math.max(40, cssH)}px`;
    const pxW = Math.max(160, Math.round(cssW * Math.min(dpr, 1.35)));
    const pxH = Math.max(160, Math.round(cssH * Math.min(dpr, 1.35)));
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    // Art resolution tracks the on-screen size: the plates never need more.
    previewScale = Math.min(1, (pxW / size.w) * 1.9);
    const ctx = canvas.getContext('2d');
    renderCover(ctx, pxW, pxH, state, { detail: Math.max(0.42, previewScale) });
  });
}

// ------------------------------------------------------------------- photos

/** Reads a File into a photo record the document can hold. */
async function fileToPhoto(file, index) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('not an image'));
      img.src = url;
    });
    return {
      id: `file-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      label: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 18) || `Photo ${index + 1}`,
      image,
      w: image.naturalWidth,
      h: image.naturalHeight,
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function acceptFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name));
  if (files.length === 0) return;
  const status = $('status');
  status.textContent = `Reading ${files.length} photo${files.length === 1 ? '' : 's'}…`;
  const loaded = [];
  for (let i = 0; i < files.length; i++) {
    const photo = await fileToPhoto(files[i], i);
    if (photo) loaded.push(photo);
  }
  if (loaded.length === 0) {
    status.textContent = 'Those files would not open as images.';
    return;
  }
  invalidateArt();
  // Dropping photos replaces the tray's idea of "empty" but keeps the panels fed.
  const had = state.photos.length;
  state.addPhotos(loaded);
  if (had === 0) {
    // A brand-new tray: give the empty slots a real photo too, not just slot 0.
    state.crops.forEach((crop) => { crop.photo = crop.photo % state.photos.length; });
  }
  buildThumbs();
  syncInputs();
  redraw();
  status.textContent = `${loaded.length} photo${loaded.length === 1 ? '' : 's'} in. Pick a panel, then click a photo.`;
}

function wirePhotos() {
  const input = $('photo-input');
  input.addEventListener('change', () => {
    acceptFiles(input.files).finally(() => { input.value = ''; });
  });

  const drop = $('drop');
  const over = (on) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    drop.classList.toggle('is-over', on);
    document.body.classList.toggle('is-dragging', on);
  };
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, over(true));
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, over(false));
  drop.addEventListener('drop', (e) => acceptFiles(e.dataTransfer?.files ?? []));
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') input.click();
  });

  // Dropping anywhere is a drop: the poster is the drop target when you're looking at it.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.target.closest?.('#drop')) return;
    acceptFiles(e.dataTransfer?.files ?? []);
  });
}

// ------------------------------------------------------------------ wiring

function wireText() {
  const caption = $('caption');
  caption.value = state.caption;
  caption.addEventListener('input', () => {
    state.caption = caption.value;
    state.series = caption.value;
    state.emit('caption');
  });
  $('caption-count').textContent = `${caption.value.length}/42`;

  for (const el of document.querySelectorAll('[data-panel]')) {
    el.addEventListener('click', () => {
      active = Number(el.dataset.panel);
      syncInputs();
      redraw();
    });
  }

  $('zoom').addEventListener('input', (e) => {
    state.setCrop(active, { zoom: Number(e.target.value) });
    $('zoom-out').textContent = `${Number(e.target.value).toFixed(2)}×`;
    redraw();
  });
  $('pan-x').addEventListener('input', (e) => {
    state.setCrop(active, { fx: Number(e.target.value) });
    redraw();
  });
  $('pan-y').addEventListener('input', (e) => {
    state.setCrop(active, { fy: Number(e.target.value) });
    redraw();
  });
  $('cycle').addEventListener('click', () => {
    state.cyclePhoto(active);
    syncInputs();
    redraw();
  });
  $('reseed').addEventListener('click', () => {
    state.crops.forEach((crop, i) => {
      crop.zoom = 1.03 + (i % 3) * 0.03;
      crop.fx = ((i % 3) - 1) * 0.24;
      crop.fy = i % 2 === 0 ? -0.18 : 0.14;
    });
    state.emit('crop');
    redraw();
  });

  $('export').addEventListener('click', doExport);
}

async function doExport() {
  const size = sizeOf(state);
  const status = $('status');
  const button = $('export');
  button.disabled = true;
  status.textContent = `Rendering ${size.note}…`;
  await new Promise((r) => setTimeout(r, 16));
  try {
    const canvas = renderToCanvas(state, size.w, size.h);
    const name = `vice-ledger-${state.caption.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cover'}-${size.w}x${size.h}.png`;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    status.textContent = `Saved ${name} — ${(blob.size / 1024).toFixed(0)} KiB.`;
  } catch (err) {
    status.textContent = `Export failed: ${err.message}`;
  } finally {
    button.disabled = false;
  }
}

/** Keyboard: 1-4 pick a panel, g cycles the grade, l cycles the layout. */
function wireKeys() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea')) return;
    if (/^[1-6]$/.test(e.key)) {
      active = Number(e.key) - 1;
      syncInputs();
      redraw();
    } else if (e.key === 'g') {
      const at = GRADE_ORDER.indexOf(state.grade);
      state.set({ grade: GRADE_ORDER[(at + 1) % GRADE_ORDER.length] }, 'grade');
    } else if (e.key === 'l') {
      const at = LAYOUT_ORDER.indexOf(state.layout);
      state.set({ layout: LAYOUT_ORDER[(at + 1) % LAYOUT_ORDER.length] }, 'layout');
    }
  });
}

// -------------------------------------------------------------------- boot

function boot() {
  buildAll();
  wirePhotos();
  wireText();
  wireKeys();
  state.on((s, reason) => {
    syncInputs();
    if (reason !== 'crop') invalidateArt();
    redraw();
  });
  window.addEventListener('resize', () => redraw());
  redraw();

  const query = new URLSearchParams(location.search);
  if (query.get('shot')) {
    runShot(query, {
      accept: async (shot) => {
        // Move the shot's document into the live one: the shell is the scene.
        invalidateArt();
        state.photos = shot.photos;
        state.caption = shot.caption;
        state.series = 'Vice Ledger';
        state.layout = shot.layout;
        state.grade = shot.grade;
        state.size = shot.size;
        shot.crops.forEach((crop, i) => Object.assign(state.crops[i], crop));
        $('caption').value = state.caption;
        $('caption-count').textContent = `${state.caption.length}/42`;
        buildThumbs();
        syncInputs();
        ensureSamples();
        redraw();
      },
      after: async () => {
        syncInputs();
        redraw();
      },
    }).catch((err) => {
      $('status').textContent = `Shot failed: ${err.message}`;
      window.__shotReady = true;
    });
  }
}

/** A shot may be seeded with samples the tray has never loaded: fill the tray too. */
async function ensureSamples() {
  if (state.photos.length > 0) return;
  const { loadSamples } = await import('./shots.js');
  state.photos = await loadSamples([]);
  buildThumbs();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// Handy for the console and for a screenshot script that wants a rerender.
window.coverApp = { state, redraw, alias, renderCover };
