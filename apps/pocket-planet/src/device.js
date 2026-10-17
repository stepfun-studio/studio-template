import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Geolocation } from '@capacitor/geolocation';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Motion } from '@capacitor/motion';
import { App } from '@capacitor/app';
export const native = Capacitor.isNativePlatform();
/** @type {import('@capacitor/core').PluginListenerHandle | undefined} */
let motionListener;
let generation = 0;
/** @param {string} source @returns {Promise<string>} */
export async function resizePhoto(source) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 720 / Math.max(image.width, image.height));
  canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo processing unavailable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = canvas.toDataURL('image/jpeg', 0.72);
  if (data.length >= 700000) throw new Error('Photo too large. Try a simpler scene.');
  return data;
}
export async function takePhoto() {
  if (!native) throw new Error('Native camera unavailable in browser. Use the clearly labeled illustrated sample instead.');
  // Android delegates to the camera activity; no permission prompt on app launch.
  const photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Uri, quality: 75, width: 720, height: 720, correctOrientation: true, saveToGallery: false });
  if (!photo.webPath) throw new Error('No photo returned. Nothing was saved.');
  return resizePhoto(photo.webPath);
}
export async function getPosition() {
  if (native) {
    const permission = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] });
    if (permission.coarseLocation !== 'granted') throw new Error('Location permission denied. You can explore a simulated sector instead.');
    return (await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 })).coords;
  }
  if (!navigator.geolocation || !isSecureContext) throw new Error('Browser location unavailable. Choose the simulated sector instead.');
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(p => resolve(p.coords), () => reject(new Error('Browser location denied or unavailable. No real location was used.')), { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }));
}
/** @param {(gamma:number,beta:number)=>void} callback */
export async function startTilt(callback) {
  await stopTilt();
  const token = generation;
  // Motion wraps DeviceOrientation even inside Capacitor. iOS needs a gesture prompt.
  const orientation = /** @type {typeof DeviceOrientationEvent & {requestPermission?:()=>Promise<string>}} */ (globalThis.DeviceOrientationEvent);
  if (!orientation) throw new Error('Tilt sensor API unavailable. Use arrow controls.');
  if (orientation.requestPermission && await orientation.requestPermission() !== 'granted') throw new Error('Tilt permission denied. Use arrow controls.');
  if (token !== generation) throw new Error('Tilt request cancelled.');
  let delivered = false;
  const listener = await Motion.addListener('orientation', event => {
    if (token !== generation || !Number.isFinite(event.gamma) || !Number.isFinite(event.beta)) return;
    delivered = true;
    callback(event.gamma, event.beta);
  });
  if (token !== generation) { await listener.remove(); throw new Error('Tilt request cancelled.'); }
  motionListener = listener;
  await new Promise(resolve => setTimeout(resolve, 1800));
  if (token !== generation) throw new Error('Tilt stopped.');
  if (!delivered) { await stopTilt(); throw new Error('No tilt data received. Use arrow controls (some WebViews have no sensor access).'); }
}
export async function stopTilt() {
  generation++;
  const listener = motionListener; motionListener = undefined;
  await listener?.remove();
}
export async function pulse() {
  if (!native) return false;
  try { await Haptics.impact({ style: ImpactStyle.Light }); return true; } catch { return false; }
}
/** @param {()=>void} onPause @param {(photo:string)=>void} onPhoto */
export async function attachLifecycle(onPause, onPhoto) {
  if (!native) return () => {};
  const handles = await Promise.all([
    App.addListener('appStateChange', ({ isActive }) => { if (!isActive) onPause(); }),
    App.addListener('appRestoredResult', async result => {
      // Camera activity can kill the WebView. Recover only a real returned photo.
      if (result.pluginId === 'Camera' && result.success && result.data?.webPath) {
        try { onPhoto(await resizePhoto(result.data.webPath)); } catch { /* Invalid restored image is not a discovery. */ }
      }
    }),
  ]);
  return () => { handles.forEach(handle => { void handle.remove(); }); };
}
