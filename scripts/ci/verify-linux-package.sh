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
    dpkg-deb -c "$package" > /tmp/derivon-package-files
    grep -q 'usr/bin/derivon-app$' /tmp/derivon-package-files
    grep -q 'net.derivon.mindmap.desktop$' /tmp/derivon-package-files
    dpkg-deb -f "$package" Depends > /tmp/derivon-package-requires
    grep -q 'webkit2gtk-4.1' /tmp/derivon-package-requires
    ;;
  rpm)
    test "$(rpm -qp --queryformat '%{VERSION}' "$package")" = "$expected_version"
    test "$(rpm -qp --queryformat '%{ARCH}' "$package")" = "x86_64"
    rpm -qlp "$package" > /tmp/derivon-package-files
    grep -q '/usr/bin/derivon-app$' /tmp/derivon-package-files
    grep -q 'net.derivon.mindmap.desktop$' /tmp/derivon-package-files
    rpm -qpR "$package" > /tmp/derivon-package-requires
    grep -q 'libwebkit2gtk-4.1.so.0' /tmp/derivon-package-requires
    ;;
  *)
    echo "Unsupported package kind: $kind" >&2
    exit 1
    ;;
esac

echo "$kind package metadata and contents are valid for $expected_version."
