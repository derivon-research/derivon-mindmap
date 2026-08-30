#!/usr/bin/env bash
set -euo pipefail

kind="${1:?usage: verify-linux-package.sh <deb|rpm> <package> <version>}"
package="${2:?usage: verify-linux-package.sh <deb|rpm> <package> <version>}"
expected_version="${3:?usage: verify-linux-package.sh <deb|rpm> <package> <version>}"

test -s "$package"
case "$kind" in
  deb)
    test "$(dpkg-deb -f "$package" Version)" = "$expected_version"
    test "$(dpkg-deb -f "$package" Architecture)" = "amd64"
    dpkg-deb -c "$package" | grep -q 'usr/bin/derivon-app$'
    dpkg-deb -c "$package" | grep -q 'net.derivon.mindmap.desktop$'
    dpkg-deb -f "$package" Depends | grep -q 'webkit2gtk-4.1'
    ;;
  rpm)
    test "$(rpm -qp --queryformat '%{VERSION}' "$package")" = "$expected_version"
    test "$(rpm -qp --queryformat '%{ARCH}' "$package")" = "x86_64"
    rpm -qlp "$package" | grep -q '/usr/bin/derivon-app$'
    rpm -qlp "$package" | grep -q 'net.derivon.mindmap.desktop$'
    rpm -qpR "$package" | grep -q 'libwebkit2gtk-4.1.so.0'
    ;;
  *)
    echo "Unsupported package kind: $kind" >&2
    exit 1
    ;;
esac

echo "$kind package metadata and contents are valid for $expected_version."
