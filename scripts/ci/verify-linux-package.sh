#!/usr/bin/env bash
set -euo pipefail

kind="${1:?usage: verify-linux-package.sh <deb|rpm> <package> <version>}"
package="${2:?usage: verify-linux-package.sh <deb|rpm> <package> <version>}"
expected_version="${3:?usage: verify-linux-package.sh <deb|rpm> <package> <version>}"

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  echo "Package verification failed: $*" >&2
  exit 1
}

require_equal() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  [[ "$actual" == "$expected" ]] || fail "$label is '$actual', expected '$expected'"
}

require_match() {
  local label="$1"
  local pattern="$2"
  local file="$3"
  grep -Eq "$pattern" "$file" || fail "$label did not match '$pattern'"
}

[[ -s "$package" ]] || fail "package is missing or empty: $package"

case "$kind" in
  deb)
    require_equal "DEB version" "$(dpkg-deb --field "$package" Version)" "$expected_version"
    require_equal "DEB architecture" "$(dpkg-deb --field "$package" Architecture)" "amd64"
    dpkg-deb --field "$package" Depends > "$tmp_dir/requires"
    dpkg-deb --extract "$package" "$tmp_dir/root"

    [[ -x "$tmp_dir/root/usr/bin/derivon-app" ]] || fail "DEB does not contain executable /usr/bin/derivon-app"
    [[ -f "$tmp_dir/root/usr/share/applications/Derivon.desktop" ]] || fail "DEB does not contain /usr/share/applications/Derivon.desktop"
    [[ -f "$tmp_dir/root/usr/share/metainfo/net.derivon.mindmap.metainfo.xml" ]] || fail "DEB does not contain AppStream metadata"
    require_match "desktop executable" '^Exec=derivon-app$' "$tmp_dir/root/usr/share/applications/Derivon.desktop"
    require_match "WebKitGTK dependency" 'webkit2gtk-4\.1' "$tmp_dir/requires"
    ;;
  rpm)
    require_equal "RPM version" "$(rpm -qp --queryformat '%{VERSION}' "$package")" "$expected_version"
    require_equal "RPM architecture" "$(rpm -qp --queryformat '%{ARCH}' "$package")" "x86_64"
    rpm -qlp "$package" > "$tmp_dir/files"
    rpm -qp --requires "$package" > "$tmp_dir/requires"

    require_match "installed binary" '^/usr/bin/derivon-app$' "$tmp_dir/files"
    require_match "desktop entry" '^/usr/share/applications/Derivon\.desktop$' "$tmp_dir/files"
    require_match "AppStream metadata" '^/usr/share/metainfo/net\.derivon\.mindmap\.metainfo\.xml$' "$tmp_dir/files"
    require_match "WebKitGTK dependency" 'libwebkit2gtk-4\.1\.so\.0' "$tmp_dir/requires"
    ;;
  *)
    fail "unsupported package kind: $kind"
    ;;
esac

echo "$kind package metadata and contents are valid for $expected_version."
