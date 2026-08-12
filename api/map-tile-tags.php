<?php
declare(strict_types=1);

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$mapFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'map' . DIRECTORY_SEPARATOR . 'map-tile-tags.js';

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

// Shared map tags are global state; only signed-in users may read or modify them
// through this endpoint. The public map page loads map-tile-tags.js directly and
// does not go through here, so display is unaffected.
$sessionUserId = $_SESSION['ato_user_id'] ?? null;
if (!is_string($sessionUserId) || $sessionUserId === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => 'Please log in first.']);
}

function read_map_file(string $mapFile): array {
  if (!is_file($mapFile)) {
    respond(404, ['ok' => false, 'error' => 'map-tile-tags.js not found.']);
  }

  $raw = file_get_contents($mapFile);
  if ($raw === false) respond(500, ['ok' => false, 'error' => 'Could not read map-tile-tags.js.']);

  if (!preg_match('/window\.ATO_MAP_TILE_TAGS\s*=\s*(\{.*\})\s*;?\s*$/s', $raw, $matches)) {
    respond(500, ['ok' => false, 'error' => 'Could not parse map-tile-tags.js.']);
  }

  $data = json_decode($matches[1], true);
  if (!is_array($data)) respond(500, ['ok' => false, 'error' => 'map-tile-tags.js contains invalid JSON.']);
  return $data;
}

function normalize_entry($entry, string $fallbackKey): ?array {
  if (!is_array($entry)) return null;
  $parts = explode(':', $fallbackKey, 2);
  $cycleId = trim((string) ($entry['cycleId'] ?? ($parts[0] ?? '')));
  $tileId = trim((string) ($entry['tileId'] ?? ($parts[1] ?? '')));
  if ($cycleId === '' || $tileId === '') return null;

  $tags = $entry['tags'] ?? [];
  if (!is_array($tags)) $tags = [];
  $tags = array_values(array_unique(array_values(array_filter(array_map(static function ($tag): string {
    return trim((string) $tag);
  }, $tags), static function (string $tag): bool {
    return $tag !== '';
  }))));

  return [
    'cycleId' => $cycleId,
    'tileId' => $tileId,
    'reviewed' => (bool) ($entry['reviewed'] ?? false),
    'tags' => $tags,
    'notes' => (string) ($entry['notes'] ?? ''),
    'updatedAt' => (string) ($entry['updatedAt'] ?? gmdate('c')),
  ];
}

function normalize_payload(array $data): array {
  $normalized = [
    'version' => 1,
    'source' => (string) ($data['source'] ?? 'map/map-data.js'),
    'updatedAt' => (string) ($data['updatedAt'] ?? gmdate('c')),
    'tagDefinitions' => [],
    'tiles' => [],
  ];

  if (is_array($data['tagDefinitions'] ?? null)) {
    foreach ($data['tagDefinitions'] as $definition) {
      if (!is_array($definition) || !isset($definition['id'])) continue;
      $normalized['tagDefinitions'][] = [
        'id' => (string) $definition['id'],
        'label' => (string) ($definition['label'] ?? $definition['id']),
        'shortcut' => isset($definition['shortcut']) ? (string) $definition['shortcut'] : '',
      ];
    }
  }

  if (is_array($data['tiles'] ?? null)) {
    foreach ($data['tiles'] as $key => $entry) {
      $normalizedEntry = normalize_entry($entry, (string) $key);
      if (!$normalizedEntry) continue;
      $normalized['tiles'][$normalizedEntry['cycleId'] . ':' . $normalizedEntry['tileId']] = $normalizedEntry;
    }
  }

  return $normalized;
}

function write_map_file(string $mapFile, array $data): void {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if ($json === false) respond(500, ['ok' => false, 'error' => 'Could not encode tag data.']);

  $content = "window.ATO_MAP_TILE_TAGS = " . $json . ";\n";
  $tempFile = $mapFile . '.tmp';
  $handle = fopen($tempFile, 'c');
  if (!$handle) respond(500, ['ok' => false, 'error' => 'Could not open temp file.']);
  if (!flock($handle, LOCK_EX)) {
    fclose($handle);
    respond(500, ['ok' => false, 'error' => 'Could not lock temp file.']);
  }
  ftruncate($handle, 0);
  rewind($handle);
  $written = fwrite($handle, $content);
  fflush($handle);
  flock($handle, LOCK_UN);
  fclose($handle);

  if ($written === false || $written < strlen($content) || !rename($tempFile, $mapFile)) {
    @unlink($tempFile);
    respond(500, ['ok' => false, 'error' => 'Could not write map-tile-tags.js.']);
  }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $data = normalize_payload(read_map_file($mapFile));
  respond(200, [
    'ok' => true,
    'data' => $data,
    'updatedAt' => $data['updatedAt'] ?? null,
  ]);
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  $payload = json_decode((string) $raw, true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);
  if (!is_array($payload['data'] ?? null)) respond(400, ['ok' => false, 'error' => 'Missing data payload.']);

  $data = normalize_payload($payload['data']);
  $data['updatedAt'] = gmdate('c');
  write_map_file($mapFile, $data);
  respond(200, ['ok' => true, 'data' => $data, 'updatedAt' => $data['updatedAt']]);
}

respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
