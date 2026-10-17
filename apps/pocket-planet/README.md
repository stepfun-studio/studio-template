# Pocket Planet Explorer

An original mobile-first field kit: guide a tiny rover through six stardust discoveries, collect photo field notes, and explore coordinate-inspired habitats. Procedural CSS/canvas illustrations, no remote assets, account, backend, telemetry, or paid keys. **Android APK is the deliverable. Do not publish a website.**

## Agent initialization → APK

Work from `apps/pocket-planet` (or the copied template root). Preserve `android/`; it contains native permissions, app identity, and the pinned Gradle wrapper. Node **22.13+ (22.x)**, Corepack, curl, Python 3, tar, and unzip-compatible tools are prerequisites. The checked-in lockfile is authoritative.

```bash
cd apps/pocket-planet
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
corepack pnpm android:bootstrap
```

Bootstrap downloads JDK and SDK command-line tools into ignored `.toolchain/`, verifies archives, and never changes global Java/Android installations. It uses existing `JAVA_HOME` (must be JDK 21) or local Temurin. Existing `ANDROID_HOME` is supported; omit it for an isolated SDK. Allow roughly 3 GB disk and network access to GitHub, Google Maven/SDK repositories, Maven Central, and Gradle. Gradle caches, Android user settings, and the generated debug signing key stay under `.toolchain/`.

### Android licenses: human decision required

The first bootstrap **exits 2** when licenses are missing; this is intentional. Do not infer acceptance from a request to build, write license hashes, or silently pipe `yes`. Review/accept interactively:

```bash
source scripts/android-env.sh
sdkmanager --sdk_root="$ANDROID_HOME" --licenses
corepack pnpm android:bootstrap
corepack pnpm android:apk
```

For unattended CI/sandboxes **only after the responsible user explicitly reviewed and approved the Android SDK licenses**, that user can authorize acceptance with this exact opt-in. An agent must not set it on the user's behalf without approval:

```bash
POCKET_PLANET_ACCEPT_ANDROID_LICENSES=I_HAVE_READ_AND_ACCEPT corepack pnpm android:bootstrap
corepack pnpm android:apk
```

No license approval or no download access → report the blocker and **do not claim an APK was built**. Bootstrap is rerunnable. Missing packages or incompatible JDK fail clearly before Gradle. `android:init` builds web assets and runs Capacitor sync; the APK script calls it automatically, along with frozen install/typecheck/lint/tests. No Android Studio GUI is needed.

### Exact output and verification

```bash
# Primary file, relative to THIS template root:
ls -lh artifacts/pocket-planet.apk artifacts/pocket-planet.apk.sha256
source scripts/android-env.sh
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose artifacts/pocket-planet.apk
"$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging artifacts/pocket-planet.apk
(cd artifacts && shasum -a 256 -c pocket-planet.apk.sha256)
adb install -r artifacts/pocket-planet.apk
```

Output: **`artifacts/pocket-planet.apk`**, app ID `com.stepfun.pocketplanet`, version `1.0` / code `1`, Android 6+ (API 23). Android `assembleDebug` automatically signs it with a **development-only debug key**, and the script verifies signature + package ID before copying the file. This is not Play Store/release signing. Keep `.toolchain/home/.android/debug.keystore` if rebuilding installable updates; a different key requires uninstalling first (which erases app data). No keys or APKs are committed. Agents may copy this verified APK to their download-artifact directory and give its file link; never substitute `dist/` or rename a zip to `.apk`.

## Pinned versions

- pnpm **11.15.1**; vanilla JavaScript with checked JSDoc / TypeScript **5.9.3**; Vite **6.4.1**; ESLint **9.39.1**.
- Capacitor core / Android / CLI **7.6.9**; App **7.1.2**, Camera **7.0.5**, Geolocation **7.1.8**, Haptics **7.0.5**, Motion **7.0.3**.
- JDK **21**; bootstrap Temurin **21.0.12.1+1**. Android command-line tools **19.0** (archive **13114758**), compile/target SDK **35**, build-tools **35.0.0**, Android Gradle plugin **8.7.2**, Gradle **8.11.1** with pinned SHA-256. Google `platform-tools` is a vendor rolling package used only for optional installation, not APK compilation.
- `pnpm-workspace.yaml` explicitly approves esbuild's required native install script. All direct dependencies are exact versions and transitive versions live in `pnpm-lock.yaml`.

## Play / capability honesty

- Arrow keys and labeled touch buttons move the rover. Each distinct star gives 10 stardust; six stars finish an expedition. New expedition resets only its six stars, keeping lifetime stardust and notes.
- **Camera:** only the Take a photo gesture opens Capacitor's external native camera activity; cancellation/denial produces no note. Android activity results are recovered via App's restored-result listener if the WebView was reclaimed. Photos are resized to at most 720 px and saved as JPEG data URLs, locally, not uploaded or added to the gallery. Android uses the camera intent, so no CAMERA permission is declared. No gallery/media permission is needed. In browsers the native camera is explicitly unavailable; the separate illustrated-sample action is labeled **not a photo** everywhere.
- **Location:** one on-demand Capacitor request (coarse location; fine declared for plugin compatibility), or browser Geolocation on secure localhost/HTTPS. No watcher/background location. Exact coordinates are discarded after quantization to a roughly 0.1-degree sector. The habitat is fictional, not nearby real points of interest or navigation. Denial/unavailable retains the prior sector; the separate simulated action never claims GPS success.
- **Tilt:** Capacitor Motion wraps device orientation in both WebView and browser; iOS prompts only from the button gesture when required. The first genuine event calibrates pitch. No sensor event within 1.8 s → honest failure and button controls. Stop, camera/dialog opening, background, and page exit remove listeners; asynchronous requests are generation-guarded. Unsupported WebViews still have the complete arrow-control game.
- **Haptics:** off by default; enabled on demand and dispatched through Capacitor Haptics only on native. Hardware can silently no-op; the UI does not claim successful vibration. Browser demo explicitly uses visual feedback only.
- Offline localStorage persists six-star progress, habitat, haptic preference, and up to 24 journal notes. Quota/storage failure reports unsaved changes, never success. Corrupt/version-incompatible data resets safely. Native backup is disabled; erase/delete controls are provided. Uninstalling/browser clear erases data. All app assets are bundled; Android works offline after install. Browser preview itself requires the local server (no service worker/offline-install claim).
- Keyboard labels, semantic regions/headings, modal focus management, reduced-motion support, mobile safe-area spacing. Keep stationary when playing; never navigate by this fictional map.

## Local browser demo / QA (not publishing)

```bash
corepack pnpm dev --port 4177 --strictPort
# Or production-bundle preview:
corepack pnpm build
corepack pnpm exec vite preview --host 127.0.0.1 --port 4177 --strictPort
```

Open `http://localhost:4177`. Permissions on another device require secure origin; don't expect native camera/haptics in a browser.

Golden path: at 390×844, collect a star using buttons; add/name/save an illustrated sample; reload and confirm journal/progress; explore a simulated sector. Edge cases: cancel a note; camera-unavailable; tilt with no sensor; denied location; haptics unavailable; delete a note; denied storage and corrupt local state. Native device follow-up: take/cancel camera photos, deny/grant coarse location, background while tilt is active, airplane-mode restart, optional haptic-supported hardware. Browser checks are not native device certification.

`pnpm test` covers movement bounds, all six reachable stars, idempotent rewards, deterministic/valid coordinate sectors, corrupted local data, note limits/source preservation, and storage failures. `pnpm typecheck`, `pnpm lint`, `pnpm build` validate source/bundle; `bash -n scripts/*.sh` checks shell syntax.

## Implementation layout

- `src/main.js`: interface/game controller; `src/logic.js`: tested pure rules/state; `src/device.js`: on-demand Capacitor APIs/lifecycle; `src/style.css`: original responsive illustrations.
- `index.html`: accessible field-kit interface. `android/`: checked-in Capacitor shell, manifest, resources, Gradle wrapper. `scripts/`: isolated bootstrap/environment/init/APK build.
- `dist/`, native copied web assets, tool caches, signing keys, and `artifacts/` are generated/ignored.

## iOS limitation

**An APK cannot install on an iPhone or iPad.** The browser fallback works on supported iOS Safari, with capability restrictions. An optional native iOS fork needs Capacitor iOS, Xcode on macOS, usage descriptions, Apple signing/provisioning, and its own verification; none is bundled or promised. TestFlight additionally requires an Apple Developer account and Apple review. This Android template does not promise an IPA, TestFlight link, or one-command iOS distribution.

## Validation in this implementation environment

Typecheck, lint, seven pure-logic tests, Android sync, shell syntax, and production Vite build passed. Browser golden path and camera-unavailable/no-sensor/denied-location/sample-cancel/delete/haptic-fallback cases passed at 390×844 with no horizontal overflow. Local Temurin 21.0.12.1 and SDK command-line tools 19.0 downloaded and verified successfully; the SHA-256-pinned Gradle 8.11.1 wrapper ran on that JDK. A real `assembleDebug` attempt reached Android dependency resolution and failed explicitly on unaccepted licenses for `build-tools;35.0.0` and `platforms;android-35`. Browser denied-storage checks also confirmed unchanged state and an unsaved-change warning. **APK build is blocked: Android SDK licenses have not been approved; platform 35/build-tools are therefore not installed. No APK has been produced or native device capabilities certified.** Run the explicit license-review and APK steps above in an authorized environment.
