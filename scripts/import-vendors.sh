#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITES="$ROOT/sites"

clone_git() {
  local id="$1" url="$2"
  local tmp
  tmp="$(mktemp -d)"
  echo "== git $id"
  GIT_TERMINAL_PROMPT=0 git clone --depth 1 "$url" "$tmp"
  rm -rf "$SITES/$id"
  mkdir -p "$SITES/$id"
  shopt -s dotglob
  mv "$tmp"/* "$SITES/$id/"
  shopt -u dotglob
  rm -rf "$tmp/.git" "$SITES/$id/.git" 2>/dev/null || true
}

clone_html5up() {
  local id="$1" slug="$2"
  local tmp
  tmp="$(mktemp -d)"
  echo "== html5up $id ($slug)"
  GIT_TERMINAL_PROMPT=0 git clone --depth 1 "https://gitlab.com/html5up-nsm-templates/${slug}.git" "$tmp"
  rm -rf "$SITES/$id"
  if [[ -d "$tmp/output" ]]; then
    mv "$tmp/output" "$SITES/$id"
  elif [[ -d "$tmp/template" ]]; then
    mv "$tmp/template" "$SITES/$id"
  else
    echo "No output/ in $slug" >&2
    exit 1
  fi
  rm -rf "$tmp"
  if [[ -f "$SITES/$id/LICENSE.txt" ]]; then
    cp "$SITES/$id/LICENSE.txt" "$SITES/$id/UPSTREAM-LICENSE.txt"
  fi
  cat > "$SITES/$id/ATTRIBUTION.txt" <<EOF
Design: HTML5 UP (https://html5up.net/$slug)
License: Creative Commons Attribution 3.0 Unported (CC BY 3.0)
EOF
}

mkdir -p "$SITES"

# Games (MIT)
clone_git forest-run https://github.com/RishiBuilds/desert-nomad-runner.git
clone_git night-arcade https://github.com/MStewGT/cyber-runner.git
clone_git block-room https://github.com/trzaskos/vanilla-js-tetris.git
clone_git orbit https://github.com/Squishy123/asteroids.git

# Marketing
clone_html5up launch-poster spectral
clone_html5up product-page hyperspace
clone_html5up campaign solid-state
clone_git menu-board https://github.com/blackgirlbytes/blackgyalbites.git

# Tools
clone_git notes https://github.com/vscarpenter/scratchpad.git
clone_git timer https://github.com/JonathanAspeling/pomodoro.git
clone_git signup-form https://github.com/TailGrids/play-tailwind.git
if [[ -f "$SITES/signup-form/signup.html" ]]; then
  cp "$SITES/signup-form/signup.html" "$SITES/signup-form/index.html"
fi

# Sites
clone_git styled-page https://github.com/mdn/beginner-html-site-styled.git
clone_html5up gallery phantom
clone_html5up blog massively
clone_html5up portfolio dimension

echo "== dashboard (Tabler CDN static page)"
rm -rf "$SITES/dashboard"
mkdir -p "$SITES/dashboard"
cat > "$SITES/dashboard/index.html" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dashboard</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta20/dist/css/tabler.min.css" />
  </head>
  <body>
    <div class="page">
      <header class="navbar navbar-expand-md d-print-none">
        <div class="container-xl">
          <h1 class="navbar-brand navbar-brand-autodark d-none-navbar-horizontal pe-0 pe-md-3">Overview</h1>
        </div>
      </header>
      <div class="page-wrapper">
        <div class="page-body">
          <div class="container-xl">
            <div class="row row-deck row-cards">
              <div class="col-sm-6 col-lg-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Users</div>
                    <div class="h1 mb-0">2,847</div>
                  </div>
                </div>
              </div>
              <div class="col-sm-6 col-lg-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Sessions</div>
                    <div class="h1 mb-0">12.4k</div>
                  </div>
                </div>
              </div>
              <div class="col-sm-6 col-lg-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Conversion</div>
                    <div class="h1 mb-0">3.2%</div>
                  </div>
                </div>
              </div>
              <div class="col-sm-6 col-lg-3">
                <div class="card">
                  <div class="card-body">
                    <div class="subheader">Revenue</div>
                    <div class="h1 mb-0">$48k</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta20/dist/js/tabler.min.js"></script>
  </body>
</html>
HTML
cat > "$SITES/dashboard/ATTRIBUTION.txt" <<EOF
UI kit: Tabler (https://tabler.io) — MIT License
This page loads Tabler from jsDelivr CDN; see THIRD_PARTY_NOTICES.md in repo root.
EOF

echo "Done. Sites under $SITES"
