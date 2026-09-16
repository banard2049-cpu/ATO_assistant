<?php
declare(strict_types=1);

// PHP's built-in server serves the whole application directory as the web root,
// so private files were downloadable without logging in: /data/ato-users.json
// (account password hashes), /data/ato-campaign-<account>.json (complete
// campaign saves), data/sessions, data/backups and the *.lock files beside
// them.  Every launcher therefore passes this script as the final `php -S`
// argument.  It lives in the repository root because that root is what the
// launchers publish as the web root and what the portable/Docker packages ship
// (tools/ is excluded from them).
//
// Returning false hands the request back to the built-in server, which serves
// static files and executes PHP exactly as it did without a router.  The API
// reads data/ from disk rather than over HTTP, so it is unaffected.
//
// Apache/NAS deployments never look at this file; the same list is repeated as
// deny rules in .htaccess, because the built-in server ignores .htaccess.

// First path segment of everything that must not be reachable over HTTP.
// `export/` holds local build artifacts and user-supplied resource packs
// (*.atopack) that the packager treats as private; nothing in the app fetches
// it over HTTP.
$privateDirectories = ['data', 'tmp', 'export', 'log', 'logs', '.git'];

// Individual files that live inside otherwise public directories.  `tools/` has
// to stay reachable (map/app.js opens ../tools/tag-editor.html), so the
// credential file is denied by name instead of by directory.
$privateFiles = ['.htaccess', 'tools/xfyun-long-tts.config.json'];

$documentRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? __DIR__)) ?: __DIR__;

// The built-in server resolves the request itself and reports the path it
// served in SCRIPT_NAME/PATH_INFO; REQUEST_URI keeps whatever bytes the client
// sent.  An HTTP/1.1 absolute-form request target
// ("GET http://host/data/ato-users.json HTTP/1.1", which `curl -x <host>` and
// other proxy-style clients send) puts the whole URL in REQUEST_URI while the
// file served is still the path, so reading the first segment of REQUEST_URI
// saw "http:" and let every private file through.  Prefer the server-resolved
// path and keep the request target only as an extra candidate: a wrong guess
// there can cause over-blocking, never a leak.
$candidates = [];
$scriptName = (string) ($_SERVER['SCRIPT_NAME'] ?? '');
if ($scriptName !== '') {
  $candidates[] = $scriptName;
  $pathInfo = (string) ($_SERVER['PATH_INFO'] ?? '');
  if ($pathInfo !== '') $candidates[] = $scriptName . $pathInfo;
}
$requestTarget = (string) ($_SERVER['REQUEST_URI'] ?? '/');
if (preg_match('#^[A-Za-z][A-Za-z0-9+.\-]*://#', $requestTarget)) {
  $requestTarget = (string) (parse_url($requestTarget, PHP_URL_PATH) ?? '/');
}
$candidates[] = $requestTarget;

$isPrivate = false;
foreach ($candidates as $candidate) {
  // Control characters are never legitimate in a path, and a decoded NUL byte
  // made realpath() below throw a ValueError that leaked the deployment path
  // inside an HTTP 200 page.
  if (preg_match('/[\x00-\x1f\x7f]/', $candidate)) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo "400 Bad Request\n";
    return true;
  }

  // Split the query string off by hand: parse_url() would read a request for
  // "//data/ato-users.json" as a host plus "/ato-users.json" and miss it.
  $requestPath = rawurldecode(substr($candidate, 0, strcspn($candidate, '?#')));

  // Collapse the path so that "//data", "/./data" and "/assets/../data" end up
  // with the same first segment as "/data".
  $segments = [];
  foreach (explode('/', str_replace('\\', '/', $requestPath)) as $segment) {
    if ($segment === '' || $segment === '.') continue;
    if ($segment === '..') {
      array_pop($segments);
      continue;
    }
    $segments[] = $segment;
  }

  // Windows drops trailing dots and spaces from every path component before it
  // opens the file, so "/data./ato-users.json" reads data/ato-users.json while
  // the first segment still looks like "data.".  Normalise the components the
  // same way, and afterwards compare resolved paths as well, so a spelling the
  // first-segment check below does not know still cannot reach a private file.
  $segments = array_map(static fn (string $segment): string => rtrim($segment, ". \t"), $segments);

  if ($segments === []) continue;

  if (in_array(strtolower($segments[0]), $privateDirectories, true)) {
    $isPrivate = true;
    break;
  }

  // Named files, plus any local credential-style *.config.json dropped next to
  // the TTS tooling later on.
  $relative = strtolower(implode('/', $segments));
  if (in_array($relative, $privateFiles, true)
      || (strtolower($segments[0]) === 'tools'
          && str_ends_with($relative, '.config.json'))) {
    $isPrivate = true;
    break;
  }

  $resolved = realpath($documentRoot . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $segments));
  if ($resolved === false) continue;
  foreach ($privateDirectories as $name) {
    $directory = realpath($documentRoot . DIRECTORY_SEPARATOR . $name);
    if ($directory === false) continue;
    if ($resolved === $directory || str_starts_with($resolved, $directory . DIRECTORY_SEPARATOR)) {
      $isPrivate = true;
      break 2;
    }
  }
  foreach ($privateFiles as $name) {
    $file = realpath($documentRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $name));
    if ($file !== false && $resolved === $file) {
      $isPrivate = true;
      break 2;
    }
  }
}

if ($isPrivate) {
  http_response_code(403);
  header('Content-Type: text/plain; charset=utf-8');
  echo "403 Forbidden\n";
  return true;
}

return false;
