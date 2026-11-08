#!/usr/bin/env bash
# Installs only isolated browser files. No package installation, service restarts,
# firewall, VPN, routes or sysctl changes. Called inside the deployment audit.
set -euo pipefail
umask 077
stage_dir="$1"
[[ "$stage_dir" == /var/tmp/zai-messenger-* ]]
test "$(uname -m)" = x86_64
runtime=/opt/zai-whatsapp/runtime
chrome=/opt/google/chrome/chrome
library_path="$runtime/usr/lib/x86_64-linux-gnu:$runtime/lib/x86_64-linux-gnu"
if test -f /opt/zai-whatsapp/browser-ready && env LD_LIBRARY_PATH="$library_path" "$chrome" --version > /dev/null 2>&1; then exit 0; fi
# Ubuntu's vendor profile allows Chrome user namespaces without changing sysctl.
test -f /etc/apparmor.d/chrome
grep -Fq '/opt/google/chrome/chrome' /etc/apparmor.d/chrome
install -d -m 0755 /opt/zai-whatsapp "$runtime"
install -d -m 0700 "$stage_dir/browser" "$stage_dir/browser/archives" "$stage_dir/browser/archives/partial"
archive="$stage_dir/browser/google-chrome-stable_amd64.deb"
curl --fail --silent --show-error --location --proto '=https' --max-time 180 https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o "$archive"
test "$(dpkg-deb -f "$archive" Package)" = google-chrome-stable
test "$(dpkg-deb -f "$archive" Architecture)" = amd64
# Resolve and download dependencies, but never run dpkg/apt install or maintainer scripts.
apt-get --yes --download-only --no-install-recommends -o "Dir::Cache::archives=$stage_dir/browser/archives" install "$archive" > "$stage_dir/browser/download.log" 2>&1
for package in "$stage_dir"/browser/archives/*.deb; do
 test -f "$package" || continue
 name=$(dpkg-deb -f "$package" Package)
 case "$name" in libc6|libc-bin|libgcc-s1|libstdc++6|google-chrome-stable) continue;; esac
 dpkg-deb -x "$package" "$runtime"
done
if ! test -e "$chrome"; then
 dpkg-deb -x "$archive" "$stage_dir/browser/unpacked"
 install -d -m 0755 /opt/google
 cp -a "$stage_dir/browser/unpacked/opt/google/chrome" /opt/google/chrome
 # Use user-namespace sandbox; do not introduce a setuid executable.
 chmod 0755 /opt/google/chrome/chrome-sandbox
fi
/usr/sbin/apparmor_parser -r /etc/apparmor.d/chrome
env LD_LIBRARY_PATH="$library_path" "$chrome" --version > "$stage_dir/browser/version.txt"
env LD_LIBRARY_PATH="$library_path" ldd "$chrome" > "$stage_dir/browser/libraries.txt"
if grep -q 'not found' "$stage_dir/browser/libraries.txt"; then echo 'Missing Chrome dependencies; stop' >&2; exit 1; fi
cp "$stage_dir/browser/version.txt" /opt/zai-whatsapp/browser-ready
chmod 0644 /opt/zai-whatsapp/browser-ready
