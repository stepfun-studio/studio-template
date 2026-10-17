export const BEACONS = [
  { id: 'fern', x: 22, y: 30, name: 'Fern constellation' },
  { id: 'dew', x: 70, y: 22, name: 'Dewdrop satellite' },
  { id: 'moss', x: 38, y: 55, name: 'Moss moon' },
  { id: 'pebble', x: 78, y: 65, name: 'Orbit pebble' },
  { id: 'seed', x: 18, y: 75, name: 'Star seed' },
  { id: 'cloud', x: 55, y: 82, name: 'Cloud fragment' },
];
export const HABITATS = ['Mosslight meadow', 'Amber dune', 'Moonwater marsh', 'Clover coast'];
/** @param {number} n @param {number} min @param {number} max */
export function clamp(n, min, max) { return Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0)); }
/** @param {{x:number,y:number}} point @param {number} dx @param {number} dy */
export function moveRover(point, dx, dy) { return { x: clamp(point.x + dx, 10, 90), y: clamp(point.y + dy, 12, 88) }; }
/** @param {{x:number,y:number}} point @param {string[]} collected */
export function discoveriesAt(point, collected) { return BEACONS.filter(b => !collected.includes(b.id) && Math.hypot(point.x - b.x, point.y - b.y) <= 8); }
/** Quantize without retaining exact GPS coordinates. @param {number} lat @param {number} lon */
export function sectorFor(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Invalid coordinates');
  const a = Math.floor(lat * 10), b = Math.floor(lon * 10);
  return { id: `${a}:${b}`, habitat: HABITATS[((a + b) % HABITATS.length + HABITATS.length) % HABITATS.length] };
}
/** @typedef {{id:string,name:string,image:string,kind:'photo'|'sample',date:string}} Note */
/** @typedef {{version:1, collected:string[], stars:number, notes:Note[], habitat:string, sector:string, simulated:boolean, haptics:boolean}} State */
/** @returns {State} */
export function freshState() { return { version: 1, collected: [], stars: 0, notes: [], habitat: HABITATS[0], sector: '', simulated: true, haptics: false }; }
/** Untrusted local data is bounded before rendering. @param {string|null} raw @returns {State} */
export function restoreState(raw) {
  const fallback = freshState();
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || value.version !== 1) return fallback;
    const collected = [...new Set(/** @type {string[]} */ (Array.isArray(value.collected) ? value.collected : []).filter(id => BEACONS.some(b => b.id === id)))];
    const notes = (Array.isArray(value.notes) ? value.notes : []).filter(/** @param {Note} n */ n => n && typeof n.id === 'string' && typeof n.name === 'string' && typeof n.date === 'string' && (n.kind === 'photo' || n.kind === 'sample') && typeof n.image === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(n.image) && n.image.length < 700000).slice(0, 24).map(/** @param {Note} n */ n => ({ id: n.id.slice(0, 64), name: n.name.slice(0, 48), image: n.image, kind: n.kind, date: n.date.slice(0, 32) }));
    return { ...fallback, collected, notes, stars: clamp(Math.floor(value.stars), collected.length * 10, 100000), habitat: HABITATS.includes(value.habitat) ? value.habitat : fallback.habitat, sector: typeof value.sector === 'string' ? value.sector.slice(0, 32) : '', simulated: value.simulated !== false, haptics: value.haptics === true };
  } catch { return fallback; }
}
/** @param {State} state @param {string[]} ids @returns {State} */
export function collect(state, ids) {
  const collected = [...new Set([...state.collected, ...ids.filter(id => BEACONS.some(b => b.id === id))])];
  return { ...state, collected, stars: state.stars + (collected.length - state.collected.length) * 10 };
}
/** @param {State} state @param {Note} note @returns {State} */
export function addNote(state, note) {
  if (state.notes.length >= 24) throw new Error('Journal full: delete a note first (24 maximum).');
  return { ...state, notes: [note, ...state.notes] };
}
/** @param {State} state @param {{setItem:(key:string,value:string)=>void}} storage */
export function persist(state, storage) {
  try { storage.setItem('pocket-planet-v1', JSON.stringify(state)); return true; } catch { return false; }
}
