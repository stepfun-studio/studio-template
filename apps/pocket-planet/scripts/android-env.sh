#!/usr/bin/env bash
# Source from the app root. All downloaded tools/caches stay inside this template.
ROOT="$(pwd)"
if [[ -z "${JAVA_HOME:-}" ]]; then
  if [[ -d "$ROOT/.toolchain/jdk/Contents/Home" ]]; then
    export JAVA_HOME="$ROOT/.toolchain/jdk/Contents/Home"
  elif [[ -d "$ROOT/.toolchain/jdk" ]]; then
    export JAVA_HOME="$ROOT/.toolchain/jdk"
  fi
fi
export ANDROID_HOME="${ANDROID_HOME:-$ROOT/.toolchain/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export GRADLE_USER_HOME="$ROOT/.toolchain/gradle"
export ANDROID_USER_HOME="$ROOT/.toolchain/android-user"
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ANDROID_HOME/cmdline-tools/19.0/bin:$ANDROID_HOME/platform-tools:$PATH"
