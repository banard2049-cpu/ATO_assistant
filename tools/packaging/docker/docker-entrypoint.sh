#!/bin/sh
set -eu

# /app/data is normally a bind mount, so the ownership set while building the
# image is hidden at runtime. Repair it before dropping privileges. Some NAS
# mounts do not allow chown; in that case leave the error visible and let PHP
# return its structured write error instead of emitting HTML warnings.
if [ -d /app/data ]; then
  chown -R www-data:www-data /app/data 2>/dev/null || true
fi

# /app/aibp/ps is bind mounted from the host: the directory is the drop-in location
# for the user's own card images, but it also holds program data shipped in the
# image (bp_status_map.js/json, token_manifest.js, bp_resource_map*.js, loaded by
# aibp/index.html with <script src="ps/...">). The mount hides those files, so a
# fresh install would have no scripts at all and an old host copy would keep
# shadowing the updated ones forever. The image keeps a pristine copy in
# /opt/ato/aibp-ps-program (see Dockerfile); restore a file from it when it is
# missing or differs. Only paths present in the pristine copy are written, so user
# images are never deleted, and a read-only mount only produces a warning. Restored
# files are root:root 0644, like the rest of /app, and readable by the PHP process.
# Safe when /app/aibp/ps is not a mount at all: the files are then already in place.
# A failed restore is reported but must not stop the container (same spirit as the
# chown above): the app still starts and the warning names the file it could not fix.
if [ -d /opt/ato/aibp-ps-program ]; then
  mkdir -p /app/aibp/ps
  find /opt/ato/aibp-ps-program -type f | while read -r source; do
    relative="${source#/opt/ato/aibp-ps-program/}"
    target="/app/aibp/ps/$relative"
    if [ -e "$target" ] && cmp -s "$source" "$target"; then
      continue
    fi
    mkdir -p "$(dirname "$target")"
    if cp -f "$source" "$target" 2>/dev/null; then
      chmod 0644 "$target" 2>/dev/null || true
    else
      echo "warning: cannot restore /app/aibp/ps/$relative from the image copy" >&2
    fi
  done || true
fi

exec su-exec www-data "$@"
