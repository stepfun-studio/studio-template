#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/android-env.sh
if [[ -z "${JAVA_HOME:-}" || ! -x "$JAVA_HOME/bin/java" ]]; then echo 'JDK 21 missing. Run corepack pnpm android:bootstrap first.'; exit 2; fi
if ! "$JAVA_HOME/bin/java" -version 2>&1 | grep -q 'version "21\.'; then echo 'JDK 21 is required.'; exit 2; fi
if [[ ! -f "$ANDROID_HOME/licenses/android-sdk-license" || ! -f "$ANDROID_HOME/platforms/android-35/android.jar" || ! -x "$ANDROID_HOME/build-tools/35.0.0/apksigner" ]]; then
  echo 'Android SDK 35/build-tools 35.0.0 or accepted SDK licenses missing. Run android:bootstrap; review licenses yourself.'; exit 2
fi
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm android:init
mkdir -p artifacts .toolchain/home
# An isolated Android debug key: never touch the shared user's ~/.android/keystore.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Duser.home=$PWD/.toolchain/home"
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
(cd android && bash gradlew --no-daemon --console=plain assembleDebug)
apk=android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose "$apk"
"$ANDROID_HOME/build-tools/35.0.0/aapt" dump badging "$apk" | grep "package: name='com.stepfun.pocketplanet'"
cp "$apk" artifacts/pocket-planet.apk
python3 - <<'PY'
import hashlib,pathlib
p=pathlib.Path('artifacts/pocket-planet.apk')
p.with_suffix('.apk.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  pocket-planet.apk\n')
print(f'Verified signed-debug APK: {p.resolve()} ({p.stat().st_size} bytes)')
PY
