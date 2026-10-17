#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .toolchain/downloads .toolchain/android-user .toolchain/home
source scripts/android-env.sh
command -v curl >/dev/null
command -v python3 >/dev/null
case "$(uname -s)" in Darwin) os=mac; sdk_os=mac; sdk_sha=c3e06a1959762e89167d1cbaa988605f6f7c1d24 ;; Linux) os=linux; sdk_os=linux; sdk_sha=5fdcc763663eefb86a5b8879697aa6088b041e70 ;; *) echo 'Use macOS or Linux (WSL2 on Windows).'; exit 1 ;; esac
case "$(uname -m)" in arm64|aarch64) arch=aarch64 ;; x86_64) arch=x64 ;; *) echo 'Unsupported CPU'; exit 1 ;; esac
if [[ -z "${JAVA_HOME:-}" ]]; then
  # Exact Temurin release; checksum sidecar is published by the same official release.
  jdk_name="OpenJDK21U-jdk_${arch}_${os}_hotspot_21.0.12.1_1.tar.gz"
  jdk_url="https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/$jdk_name"
  curl --fail --location --retry 3 "$jdk_url" -o ".toolchain/downloads/$jdk_name"
  curl --fail --location --retry 3 "$jdk_url.sha256.txt" -o ".toolchain/downloads/$jdk_name.sha256.txt"
  python3 - "$jdk_name" <<'PY'
import hashlib,pathlib,sys
p=pathlib.Path('.toolchain/downloads')/sys.argv[1]
expected=pathlib.Path(str(p)+'.sha256.txt').read_text().split()[0]
if hashlib.sha256(p.read_bytes()).hexdigest()!=expected: raise SystemExit('JDK SHA-256 mismatch')
PY
  mkdir -p .toolchain/jdk
  tar -xzf ".toolchain/downloads/$jdk_name" --strip-components=1 -C .toolchain/jdk
  source scripts/android-env.sh
fi
java -version
if ! java -version 2>&1 | grep -q 'version "21\.'; then echo 'JDK 21 required; set JAVA_HOME to JDK 21.'; exit 1; fi
if [[ ! -x "$ANDROID_HOME/cmdline-tools/19.0/bin/sdkmanager" ]]; then
  archive="commandlinetools-${sdk_os}-13114758_latest.zip"
  curl --fail --location --retry 3 "https://dl.google.com/android/repository/$archive" -o ".toolchain/downloads/$archive"
  # Google's repository2-1.xml pins revision 19.0 with these SHA-1 digests.
  python3 - "$archive" "$sdk_sha" "$ANDROID_HOME" <<'PY'
import hashlib,pathlib,sys,zipfile
p=pathlib.Path('.toolchain/downloads')/sys.argv[1]
if hashlib.sha1(p.read_bytes()).hexdigest()!=sys.argv[2]: raise SystemExit('SDK checksum mismatch')
root=pathlib.Path(sys.argv[3])/'cmdline-tools'/'19.0'
with zipfile.ZipFile(p) as z:
    for info in z.infolist():
        relative=pathlib.Path(info.filename).relative_to('cmdline-tools')
        target=root/relative
        if info.is_dir(): target.mkdir(parents=True,exist_ok=True)
        else:
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(z.read(info))
            target.chmod((info.external_attr>>16)&0o777 or 0o644)
PY
fi
if [[ "${POCKET_PLANET_ACCEPT_ANDROID_LICENSES:-}" == "I_HAVE_READ_AND_ACCEPT" ]]; then
  # Only a human-approved explicit opt-in can authorize unattended acceptance.
  python3 - "$ANDROID_HOME" <<'PY'
import os,subprocess,sys
sdk=sys.argv[1]
result=subprocess.run([sdk+'/cmdline-tools/19.0/bin/sdkmanager','--sdk_root='+sdk,'--licenses'],input='y\n'*100,text=True,env=os.environ)
raise SystemExit(result.returncode)
PY
fi
if [[ ! -f "$ANDROID_HOME/licenses/android-sdk-license" ]]; then
  printf '\nSDK licenses require YOUR review and acceptance. No licenses were accepted.\n'
  printf 'In an interactive terminal, from this directory:\n  source scripts/android-env.sh\n  sdkmanager --sdk_root="$ANDROID_HOME" --licenses\nThen rerun: corepack pnpm android:bootstrap\n'
  exit 2
fi
sdkmanager --sdk_root="$ANDROID_HOME" 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
echo 'Android toolchain ready. Run corepack pnpm android:apk.'
