FROM php:8.4-cli-alpine

WORKDIR /app
COPY app/ /app/
# /app/aibp/ps is bind mounted as a whole directory (that is where users drop their
# own card images), so the mount also hides the program data shipped in it
# (bp_status_map.js/json, token_manifest.js, bp_resource_map*.js, loaded by
# aibp/index.html through <script src="ps/...">). Keep a pristine copy outside the
# mount so docker-entrypoint.sh can restore files that are missing or stale.
# The published image is built from a git check-out, so aibp/ps here only contains
# those few tracked program files; the user images are gitignored.
COPY app/aibp/ps/ /opt/ato/aibp-ps-program/
# The published image is built from a git check-out, so the copy above only holds
# those few tracked program files. A local build may instead have the user's own
# images inside app/aibp/ps; the restore step must never bring an image back over
# the user's file, so keep only program files in the pristine copy.
RUN find /opt/ato/aibp-ps-program -type f ! -name '*.js' ! -name '*.json' -delete
COPY docker-entrypoint.sh /usr/local/bin/ato-docker-entrypoint
RUN apk add --no-cache su-exec \
  && chmod +x /usr/local/bin/ato-docker-entrypoint \
  && mkdir -p /app/data \
  && chown -R www-data:www-data /app/data

ENTRYPOINT ["/usr/local/bin/ato-docker-entrypoint"]
EXPOSE 8793
CMD ["php", "-S", "0.0.0.0:8793", "-t", "/app", "/app/router.php"]
