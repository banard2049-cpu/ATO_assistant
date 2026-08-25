#!/bin/sh
set -eu

# /app/data is normally a bind mount, so the ownership set while building the
# image is hidden at runtime. Repair it before dropping privileges. Some NAS
# mounts do not allow chown; in that case leave the error visible and let PHP
# return its structured write error instead of emitting HTML warnings.
if [ -d /app/data ]; then
  chown -R www-data:www-data /app/data 2>/dev/null || true
fi

exec su-exec www-data "$@"
