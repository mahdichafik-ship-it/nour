#!/usr/bin/env bash
set -euo pipefail

architecture="${1:-}"
candidate_directory="${2:-}"
candidate_version="${3:-}"

if [[ ! "$architecture" =~ ^(arm64|x64)$ ]] || [[ -z "$candidate_directory" || -z "$candidate_version" ]]; then
  echo "Usage: test-macos-updater.sh <arm64|x64> <candidate-directory> <candidate-version>" >&2
  exit 2
fi

candidate_directory="$(cd "$candidate_directory" && pwd)"
archive="$candidate_directory/Nour-${candidate_version}-${architecture}.app.tar.gz"
metadata="$candidate_directory/latest.json"
test -s "$archive"
test -s "$metadata"

work_directory="$(mktemp -d)"
mount_directory="$work_directory/previous-dmg"
server_pid=""
nour_pid=""
failure_phase="bootstrap"
runner_temp="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
diagnostics_directory="${NOUR_UPDATER_DIAGNOSTICS_DIR:-$runner_temp/nour-updater-diagnostics-$architecture}"
mkdir -p "$diagnostics_directory"

cleanup() {
  exit_status=$?
  set +e
  if [[ "$exit_status" -ne 0 ]]; then
    screencapture -x "$diagnostics_directory/failure-screenshot.png"
  fi
  {
    echo "exit_status=$exit_status"
    echo "failure_phase=$failure_phase"
    echo "architecture=$architecture"
    echo "candidate_version=$candidate_version"
  } >"$diagnostics_directory/summary.txt"
  [[ -f "$work_directory/nour-process.log" ]] && cp "$work_directory/nour-process.log" "$diagnostics_directory/nour-process.log"
  [[ -f "$work_directory/updater-server.log" ]] && cp "$work_directory/updater-server.log" "$diagnostics_directory/updater-server.log"
  if [[ -n "$nour_pid" ]]; then
    kill "$nour_pid" >/dev/null 2>&1
    wait "$nour_pid" >/dev/null 2>&1
  fi
  osascript -e 'tell application "Nour" to quit' >/dev/null 2>&1
  [[ -n "$server_pid" ]] && sudo kill "$server_pid" >/dev/null 2>&1
  mount | grep -q "on $mount_directory " && hdiutil detach "$mount_directory" >/dev/null 2>&1
  sudo sed -i '' '/# nour-updater-test$/d' /etc/hosts
  sudo security delete-certificate -c "Nour Updater Test CA" /Library/Keychains/System.keychain >/dev/null 2>&1
  rm -rf "$work_directory"
}
trap cleanup EXIT

echo "Locating the previous published release."
latest_release="$(gh api "repos/$GITHUB_REPOSITORY/releases/latest")"
previous_tag="$(jq -r '.tag_name' <<<"$latest_release")"
previous_version="${previous_tag#v}"
if [[ "$previous_version" == "$candidate_version" ]]; then
  echo "The public release is already ${candidate_version}; no previous version is available to test." >&2
  exit 1
fi

previous_dmg="$work_directory/Nour-${previous_version}-${architecture}.dmg"
asset_id="$(jq -r --arg name "$(basename "$previous_dmg")" \
  '.assets[] | select(.name == $name) | .id' <<<"$latest_release")"
if [[ -z "$asset_id" ]]; then
  echo "Release $previous_tag has no $(basename "$previous_dmg") asset." >&2
  exit 1
fi
gh api -H "Accept: application/octet-stream" \
  "repos/$GITHUB_REPOSITORY/releases/assets/$asset_id" >"$previous_dmg"

echo "Installing and validating Nour ${previous_version}."
mkdir -p "$mount_directory"
hdiutil attach "$previous_dmg" -readonly -nobrowse -mountpoint "$mount_directory"
source_app="$(find "$mount_directory" -maxdepth 1 -name '*.app' -print -quit)"
test -n "$source_app"
codesign --verify --deep --strict --verbose=2 "$source_app"
spctl --assess --type execute --verbose=2 "$source_app"
sudo rm -rf /Applications/Nour.app
sudo ditto "$source_app" /Applications/Nour.app
sudo chown -R "$(id -u):$(id -g)" /Applications/Nour.app
hdiutil detach "$mount_directory"

installed_version="$(defaults read /Applications/Nour.app/Contents/Info CFBundleShortVersionString)"
test "$installed_version" = "$previous_version"
app_binary="/Applications/Nour.app/Contents/MacOS/nour-desktop"
test -x "$app_binary"

echo "Creating a runner-only trusted HTTPS updater endpoint."
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout "$work_directory/ca.key" \
  -out "$work_directory/ca.crt" \
  -subj "/CN=Nour Updater Test CA"
cat >"$work_directory/server.ext" <<'EOF'
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:github.com
EOF
openssl req -newkey rsa:2048 -nodes \
  -keyout "$work_directory/server.key" \
  -out "$work_directory/server.csr" \
  -subj "/CN=github.com"
openssl x509 -req -days 1 \
  -in "$work_directory/server.csr" \
  -CA "$work_directory/ca.crt" \
  -CAkey "$work_directory/ca.key" \
  -CAcreateserial \
  -out "$work_directory/server.crt" \
  -extfile "$work_directory/server.ext"
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain "$work_directory/ca.crt"

cp "$metadata" "$work_directory/latest.json"
cp "$archive" "$work_directory/$(basename "$archive")"
cat >"$work_directory/updater-server.py" <<'PY'
import http.server
import os
import ssl

root = os.environ["UPDATER_ROOT"]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        name = "latest.json" if self.path.endswith("/latest.json") else os.path.basename(self.path)
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json" if name == "latest.json" else "application/gzip")
        self.send_header("Content-Length", str(os.path.getsize(path)))
        self.end_headers()
        with open(path, "rb") as asset:
            self.wfile.write(asset.read())

    def log_message(self, format, *args):
        print("%s - %s" % (self.log_date_time_string(), format % args), flush=True)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(os.path.join(root, "server.crt"), os.path.join(root, "server.key"))
server = http.server.ThreadingHTTPServer(("0.0.0.0", 443), Handler)
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
PY
echo "127.0.0.1 github.com # nour-updater-test" | sudo tee -a /etc/hosts >/dev/null
sudo env UPDATER_ROOT="$work_directory" python3 "$work_directory/updater-server.py" \
  >"$work_directory/updater-server.log" 2>&1 &
server_pid=$!
sleep 2
sudo kill -0 "$server_pid"

cat >"$work_directory/click-update.applescript" <<'APPLESCRIPT'
on clickNamedButton(processName, buttonName)
  tell application "System Events"
    tell process processName
      set candidates to entire contents of front window
      repeat with candidate in candidates
        try
          if role of candidate is "AXButton" and (name of candidate as text) contains buttonName then
            click candidate
            return true
          end if
        end try
      end repeat
    end tell
  end tell
  return false
end clickNamedButton

on run argv
  return clickNamedButton("Nour", item 1 of argv)
end run
APPLESCRIPT

wait_for_button() {
  local button_name="$1"
  local attempts="$2"
  for _ in $(seq 1 "$attempts"); do
    if [[ "$(osascript "$work_directory/click-update.applescript" "$button_name" 2>/dev/null)" == "true" ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for the '$button_name' update control." >&2
  return 1
}

echo "Launching the previous app and waiting for update detection."
failure_phase="update-detection"
"$app_binary" >"$work_directory/nour-process.log" 2>&1 &
nour_pid=$!
wait_for_button "Install update" 45

echo "Waiting for signature validation and installation to finish."
failure_phase="installation"
wait_for_button "Done" 90
osascript -e 'tell application "Nour" to quit'
for _ in $(seq 1 30); do
  pgrep -x nour-desktop >/dev/null || break
  sleep 1
done
! pgrep -x nour-desktop >/dev/null

updated_version="$(defaults read /Applications/Nour.app/Contents/Info CFBundleShortVersionString)"
test "$updated_version" = "$candidate_version"
codesign --verify --deep --strict --verbose=2 /Applications/Nour.app

echo "Reopening Nour ${candidate_version} after the installed update."
failure_phase="reopen"
printf '\n--- reopen ---\n' >>"$work_directory/nour-process.log"
"$app_binary" >>"$work_directory/nour-process.log" 2>&1 &
nour_pid=$!
for _ in $(seq 1 30); do
  if pgrep -x nour-desktop >/dev/null; then
    sleep 10
    pgrep -x nour-desktop >/dev/null
    echo "Nour ${candidate_version} reopened successfully on ${architecture}."
    exit 0
  fi
  sleep 1
done
echo "Nour did not reopen after installing ${candidate_version}." >&2
exit 1
