#!/usr/bin/env bash
set -euo pipefail

# Pinned, auditable FFmpeg source. These are the eugeneware/ffmpeg-static
# b6.1.1 macOS builds; users never need a system FFmpeg installation.
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/src-tauri/binaries"
mkdir -p "$out"
for target in aarch64-apple-darwin x86_64-apple-darwin; do
  case "$target" in
    aarch64-apple-darwin)
      upstream=arm64
      sha=8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa
      probe_sha=d986a8ec7b030899fe66a8a288ed809a3543338705a3ce178cfb85869c5d80be
      ;;
    x86_64-apple-darwin)
      upstream=x64
      sha=929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106
      probe_sha=d4da574d6e2e197bd259b47d69cf262df9e312af24ad960444f6d806d3d4c186
      ;;
  esac
  archive="$out/ffmpeg-${target}.gz"
  url="https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-${upstream}.gz"
  curl --fail --location --retry 3 --output "$archive" "$url"
  echo "$sha  $archive" | shasum -a 256 -c -
  gzip -dc "$archive" > "$out/ffmpeg-$target"
  probe_archive="$out/ffprobe-${target}.gz"
  curl --fail --location --retry 3 --output "$probe_archive" "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffprobe-darwin-${upstream}.gz"
  echo "$probe_sha  $probe_archive" | shasum -a 256 -c -
  gzip -dc "$probe_archive" > "$out/ffprobe-$target"
  chmod 755 "$out/ffprobe-$target"
  rm "$probe_archive"
  chmod 755 "$out/ffmpeg-$target"
  rm "$archive"
  file "$out/ffmpeg-$target"
done