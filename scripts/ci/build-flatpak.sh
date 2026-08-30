#!/usr/bin/env bash
set -euo pipefail

binary="${1:?usage: build-flatpak.sh <binary> <output.flatpak>}"
output="${2:?usage: build-flatpak.sh <binary> <output.flatpak>}"
root=$(git rev-parse --show-toplevel)
work="$root/packaging/flatpak"

test -x "$binary"
mkdir -p "$work/files" "$(dirname "$output")"
install -m755 "$binary" "$work/files/derivon-app"
rm -rf "$work/build-dir" "$work/repo" "$work/.flatpak-builder"

flatpak remote-add --user --if-not-exists flathub \
  https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user --noninteractive -y flathub \
  org.gnome.Platform//48 \
  org.gnome.Sdk//48

flatpak-builder \
  --user \
  --force-clean \
  --repo="$work/repo" \
  "$work/build-dir" \
  "$work/net.derivon.mindmap.yml"
flatpak build-bundle \
  --runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo \
  "$work/repo" \
  "$output" \
  net.derivon.mindmap \
  stable

test -s "$output"
echo "Built $output"
