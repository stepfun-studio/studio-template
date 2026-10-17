import './style.css';
import { BEACONS, HABITATS, freshState, restoreState, persist, moveRover, discoveriesAt, collect, addNote, sectorFor, clamp } from './logic.js';
import { native, takePhoto, getPosition, startTilt, stopTilt, pulse, attachLifecycle } from './device.js';
/** @template {HTMLElement} T @param {string} id @returns {T} */
function el(id) { const node = document.getElementById(id); if (!node) throw new Error(`Missing ${id}`); return /** @type {T} */ (node); }
let state = freshState();
try { state = restoreState(localStorage.getItem('pocket-planet-v1')); } catch { /* Storage warning is displayed on the first attempted save. */ }
let rover = { x: 50, y: 44 }, tiltEnabled = false, tiltBusy = false, lastTilt = 0;
/** @type {{image:string,kind:'sample'|'photo'}|undefined} */
let pendingNote;
let toastTimer = 0;
/** @param {string} text */
function toast(text) { el('toast').textContent = text; el('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => el('toast').classList.remove('visible'), 5000); }
/** @param {unknown} error */
function errorText(error) { return error instanceof Error ? error.message : 'Device request cancelled or unavailable. Nothing was saved.'; }
/** @param {import('./logic.js').State} next */
function save(next) {
  let saved = false;
  try { saved = persist(next, localStorage); } catch { /* Access itself may be denied by a WebView or browser policy. */ }
  if (!saved) { toast('Storage full or unavailable. Change not saved. Delete a note or free device storage.'); return false; }
  state = next; render(); return true;
}
function render() {
  el('stars').textContent = String(state.stars); el('discovered').textContent = `${state.collected.length} / 6`;
  el('world-title').textContent = state.habitat;
  el('world-mode').textContent = state.simulated ? 'SIMULATED PLANET' : 'GPS-INSPIRED PLANET';
  el('planet').dataset.habitat = String(HABITATS.indexOf(state.habitat));
  el('note-count').textContent = `${state.notes.length} FIELD NOTES`;
  /** @type {HTMLInputElement} */ (el('haptics')).checked = state.haptics;
  el('haptic-status').textContent = !state.haptics ? 'Off. Device support varies; silent on unsupported hardware.' : native ? 'Native haptics requested on discoveries. Hardware may respond silently; feedback is not guaranteed.' : 'Browser demo: haptics unavailable. Visual feedback only.';
  const beacons = el('beacons'); beacons.replaceChildren();
  BEACONS.forEach(b => { const dot = document.createElement('span'); dot.className = state.collected.includes(b.id) ? 'beacon found' : 'beacon'; dot.style.left = `${b.x}%`; dot.style.top = `${b.y}%`; dot.textContent = state.collected.includes(b.id) ? '·' : '✦'; beacons.append(dot); });
  const notes = el('notes'); notes.replaceChildren();
  if (!state.notes.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '✧ Your first wonder is out there. Add a photo or try an illustrated sample.'; notes.append(empty); }
  state.notes.forEach(note => {
    const card = document.createElement('article'); card.className = 'note';
    const img = document.createElement('img'); img.src = note.image; img.alt = note.name; img.loading = 'lazy';
    const label = document.createElement('p'); label.className = 'eyebrow'; label.textContent = note.kind === 'sample' ? 'ILLUSTRATED SAMPLE · NOT A PHOTO' : 'DEVICE PHOTO';
    const title = document.createElement('h3'); title.textContent = note.name;
    const date = document.createElement('p'); date.className = 'note-date'; date.textContent = new Date(note.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const remove = document.createElement('button'); remove.className = 'text-button'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${note.name}`); remove.onclick = () => save({ ...state, notes: state.notes.filter(n => n.id !== note.id) });
    card.append(img, label, title, date, remove); notes.append(card);
  });
  renderRover();
}
function renderRover() { el('rover').style.left = `${rover.x}%`; el('rover').style.top = `${rover.y}%`; }
/** @param {number} dx @param {number} dy */
function move(dx, dy) {
  rover = moveRover(rover, dx, dy); renderRover();
  const found = discoveriesAt(rover, state.collected);
  if (found.length && save(collect(state, found.map(b => b.id)))) {
    const message = `${found[0].name} discovered! +${found.length * 10} stardust${state.collected.length === 6 ? ' · Expedition complete! Start a new one below.' : ''}`;
    el('rover-status').textContent = message; toast(message);
    if (state.haptics) void pulse();
  }
}
/** @type {Record<string,[number,number]>} */
const directions = { up: [0, -4], down: [0, 4], left: [-4, 0], right: [4, 0] };
document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => move(...directions[/** @type {HTMLElement} */ (button).dataset.move || 'up'])));
/** @param {KeyboardEvent} event */
function onKey(event) {
  if (el('note-dialog').hasAttribute('open') || /INPUT|TEXTAREA|SELECT/.test(/** @type {HTMLElement} */ (event.target).tagName)) return;
  const key = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[event.key];
  if (key) { event.preventDefault(); move(...directions[key]); }
}
window.addEventListener('keydown', onKey);
function pauseTilt() {
  tiltEnabled = false;
  el('tilt').textContent = '↗ Enable tilt';
  void stopTilt();
}
el('tilt').onclick = async () => {
  if (tiltBusy) return;
  if (tiltEnabled) { pauseTilt(); el('rover-status').textContent = 'Tilt stopped. Arrow controls are ready.'; return; }
  tiltBusy = true; el('tilt').textContent = 'Waiting for sensor…';
  let baseline = 0, calibrated = false;
  try {
    await startTilt((gamma, beta) => {
      if (!calibrated) { baseline = beta; calibrated = true; }
      const now = performance.now(); if (now - lastTilt < 65) return; lastTilt = now;
      const dx = Math.abs(gamma) < 4 ? 0 : clamp(gamma / 14, -2, 2);
      const dy = Math.abs(beta - baseline) < 4 ? 0 : clamp((beta - baseline) / 14, -2, 2);
      move(dx, dy);
    });
    tiltEnabled = true; el('tilt').textContent = '↗ Stop tilt'; el('rover-status').textContent = 'Live tilt data received. Gently tilt to guide your rover.';
  } catch (error) { pauseTilt(); el('rover-status').textContent = errorText(error); toast(errorText(error)); }
  finally { tiltBusy = false; }
};
el('reset-world').onclick = () => { pauseTilt(); if (save({ ...state, collected: [] })) { rover = { x: 50, y: 44 }; renderRover(); el('rover-status').textContent = 'Fresh expedition. Lifetime stardust and journal kept.'; } };
/** @param {string} image @param {'photo'|'sample'} kind */
function openNote(image, kind) {
  pauseTilt(); pendingNote = { image, kind };
  /** @type {HTMLImageElement} */ (el('note-preview')).src = image;
  /** @type {HTMLInputElement} */ (el('note-name')).value = kind === 'sample' ? 'Mosslight specimen' : '';
  el('note-kind').textContent = kind === 'sample' ? 'Illustrated sample. No camera used, no real-world discovery claimed.' : 'Real device photo. Saved locally; never uploaded.';
  const dialog = /** @type {HTMLDialogElement} */ (el('note-dialog')); if (!dialog.open) dialog.showModal();
}
el('camera').onclick = async () => {
  const button = /** @type {HTMLButtonElement} */ (el('camera')); button.disabled = true; pauseTilt();
  try { openNote(await takePhoto(), 'photo'); el('camera-status').textContent = 'Photo received. Save it to your journal below.'; }
  catch (error) { el('camera-status').textContent = errorText(error); toast('No photo added. You can use an illustrated sample.'); }
  finally { button.disabled = false; }
};
el('sample').onclick = () => {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 360;
  const context = canvas.getContext('2d'); if (!context) return;
  context.fillStyle = '#dbe8bb'; context.fillRect(0, 0, 480, 360);
  context.fillStyle = '#91aa72'; context.beginPath(); context.ellipse(240, 210, 150, 70, -0.35, 0, Math.PI * 2); context.fill();
  context.strokeStyle = '#294e3b'; context.lineWidth = 4; context.beginPath(); context.moveTo(115, 260); context.lineTo(360, 158); context.stroke();
  for (let i = 0; i < 7; i++) { context.beginPath(); context.moveTo(145 + i * 28, 247 - i * 12); context.lineTo(150 + i * 28, 198 - i * 8); context.moveTo(145 + i * 28, 247 - i * 12); context.lineTo(193 + i * 28, 260 - i * 10); context.stroke(); }
  context.fillStyle = '#294e3b'; context.font = '16px monospace'; context.fillText('ILLUSTRATED SAMPLE / 001', 28, 40);
  openNote(canvas.toDataURL('image/png'), 'sample');
};
el('note-dialog').addEventListener('close', () => {
  const dialog = /** @type {HTMLDialogElement} */ (el('note-dialog'));
  if (dialog.returnValue === 'save' && pendingNote) {
    const name = /** @type {HTMLInputElement} */ (el('note-name')).value.trim();
    if (!name) toast('A name is required. Note was not saved.');
    else { try { if (save(addNote(state, { ...pendingNote, name, id: crypto.randomUUID(), date: new Date().toISOString() }))) { toast('Discovery saved to your local journal.'); if (state.haptics) void pulse(); } } catch (error) { toast(errorText(error)); } }
  }
  pendingNote = undefined;
});
el('locate').onclick = async () => {
  const button = /** @type {HTMLButtonElement} */ (el('locate')); button.disabled = true;
  el('location-status').textContent = 'Requesting a single approximate location…';
  try {
    const coords = await getPosition(), sector = sectorFor(coords.latitude, coords.longitude);
    if (save({ ...state, habitat: sector.habitat, sector: sector.id, simulated: false })) el('location-status').textContent = `Real ${native ? 'device' : 'browser'} location used. Approximate sector ${sector.id}; habitat is fictional. Exact coordinates discarded.`;
    else el('location-status').textContent = 'Location received but sector could not be saved.';
  } catch (error) { el('location-status').textContent = errorText(error); toast('No GPS sector added. Simulated exploration is available.'); }
  finally { button.disabled = false; }
};
el('demo-location').onclick = () => {
  const index = (HABITATS.indexOf(state.habitat) + 1) % HABITATS.length;
  if (save({ ...state, habitat: HABITATS[index], sector: `demo-${index}`, simulated: true })) { el('location-status').textContent = 'Simulated sector. No GPS used; not your real location.'; toast('A new imaginary habitat awaits.'); }
};
el('haptics').onchange = () => { const enabled = /** @type {HTMLInputElement} */ (el('haptics')).checked; if (save({ ...state, haptics: enabled }) && enabled) void pulse(); else render(); };
el('clear-data').onclick = () => { if (confirm('Erase all local field notes and progress? This cannot be undone.')) { pauseTilt(); if (save(freshState())) { rover = { x: 50, y: 44 }; renderRover(); toast('Local journal and progress erased.'); } } };
function onVisibility() { if (document.hidden) pauseTilt(); }
document.addEventListener('visibilitychange', onVisibility);
let disposed = false;
let detachNative = () => {};
void attachLifecycle(pauseTilt, image => openNote(image, 'photo')).then(cleanup => { if (disposed) cleanup(); else detachNative = cleanup; }).catch(() => toast('Native lifecycle listener unavailable.'));
window.addEventListener('pagehide', () => { disposed = true; pauseTilt(); detachNative(); window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility); }, { once: true });
render();
