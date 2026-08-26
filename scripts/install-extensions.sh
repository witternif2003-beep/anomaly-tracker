#!/usr/bin/env bash
# Install Cline, Roo Code, and Continue. Prefer `cursor` / `code` marketplace
# install; otherwise download VSIX from Open VSX (closest public catalog).
set -euo pipefail

EXTS=(
  "saoudrizwan.claude-dev|4.1.15|"
  "RooVeterinaryInc.roo-cline|3.54.0|"
  "Continue.continue|2.1.0|linux-x64"
)

cli_install() {
  local id="$1"
  if command -v cursor >/dev/null 2>&1; then
    cursor --install-extension "$id"
    return 0
  fi
  if command -v code >/dev/null 2>&1; then
    code --install-extension "$id"
    return 0
  fi
  return 1
}

openvsx_install() {
  local id="$1" ver="$2" platform="$3"
  local pub="${id%%.*}" name="${id#*.}"
  local url dest tmp
  if [[ -n "$platform" ]]; then
    url="https://open-vsx.org/api/${pub}/${name}/${platform}/${ver}/file/${id}-${ver}@${platform}.vsix"
    dest="${id}-${ver}"
  else
    url="https://open-vsx.org/api/${pub}/${name}/${ver}/file/${id}-${ver}.vsix"
    dest="${id}-${ver}"
  fi
  tmp="$(mktemp -d)"
  echo "Downloading ${id}@${ver} from Open VSX"
  curl -fL --retry 3 --retry-delay 2 --max-time 180 -o "${tmp}/ext.vsix" "$url"
  unzip -q -o "${tmp}/ext.vsix" -d "${tmp}/unpacked"
  for root in "${HOME}/.cursor/extensions" "${HOME}/.vscode/extensions"; do
    mkdir -p "$root"
    rm -rf "${root}/${dest}"
    mkdir -p "${root}/${dest}"
    cp -a "${tmp}/unpacked/extension/." "${root}/${dest}/"
  done
  rm -rf "$tmp"
  echo "Installed ${dest} via Open VSX unpack"
}

for row in "${EXTS[@]}"; do
  IFS='|' read -r id ver platform <<<"$row"
  if cli_install "$id"; then
    echo "OK marketplace ${id}"
  else
    echo "No code/cursor CLI; using Open VSX for ${id}"
    openvsx_install "$id" "$ver" "$platform"
  fi
done

echo "EXTENSIONS OK"
