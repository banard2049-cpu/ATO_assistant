<?php
declare(strict_types=1);

// PHP's built-in server changes the working directory to the requested script's
// directory, so a relative session.save_path resolved under api/ and every
// login session was silently dropped.  Pin the portable session directory when
// it exists: session storage must not depend on how the site was launched.
$sessionDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'sessions';
if (!is_dir($sessionDir)) @mkdir($sessionDir, 0770, true);
if (is_dir($sessionDir) && is_writable($sessionDir)) {
  session_save_path($sessionDir);
}

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$mapFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'map' . DIRECTORY_SEPARATOR . 'map-tile-tags.js';
// 专用锁文件：写临时文件时对 .tmp 加锁只能保护「写」，两个页面各自读-改-写整份文件时
// 仍然会互相覆盖。要挡住这种丢失更新，读取、版本比较、替换必须落在同一把锁里，
// 而这把锁不能是数据文件本身（它会被 rename 整体替换掉）。见 handle_map_post()。
$mapLockFile = $mapFile . '.lock';

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

function map_tags_revision(array $data): int {
  // 没有 revision 字段的历史文件按 0 处理（第一次保存后变成 1）。
  return isset($data['revision']) && is_numeric($data['revision']) ? max(0, (int) $data['revision']) : 0;
}

function map_tags_version(array $data): int {
  return isset($data['version']) && is_numeric($data['version']) ? (int) $data['version'] : 1;
}

// 已知字段之外的键一律原样保留：这份文件同时存着 factions / factionUpdatedAt
// （地图阵营显示用）以及标签定义的 cycles 等字段，编辑器并不认识它们。
// 以前这两个函数从零拼一个新数组，于是「在编辑器里保存一次」就会把 400 多处
// 阵营数据从整份文件里删掉，而且没有任何地方能再生成它们。
function normalize_entry($entry, string $fallbackKey): ?array {
  if (!is_array($entry)) return null;
  $parts = explode(':', $fallbackKey, 3);
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

  $normalized = $entry;
  $normalized['cycleId'] = $cycleId;
  $normalized['tileId'] = $tileId;
  $face = trim((string) ($entry['face'] ?? ($parts[2] ?? '')));
  if ($face === 'A' || $face === 'B') $normalized['face'] = $face;
  $normalized['reviewed'] = (bool) ($entry['reviewed'] ?? false);
  $normalized['tags'] = $tags;
  $normalized['notes'] = (string) ($entry['notes'] ?? '');
  $normalized['updatedAt'] = (string) ($entry['updatedAt'] ?? gmdate('c'));
  return $normalized;
}

function normalize_payload(array $data): array {
  $normalized = $data;
  $normalized['version'] = map_tags_version($data);
  $normalized['source'] = (string) ($data['source'] ?? 'map/map-data.js');
  $normalized['updatedAt'] = (string) ($data['updatedAt'] ?? gmdate('c'));
  $normalized['tagDefinitions'] = [];
  $normalized['tiles'] = [];

  if (is_array($data['tagDefinitions'] ?? null)) {
    foreach ($data['tagDefinitions'] as $definition) {
      if (!is_array($definition) || !isset($definition['id'])) continue;
      $normalizedDefinition = $definition;
      $normalizedDefinition['id'] = (string) $definition['id'];
      $normalizedDefinition['label'] = (string) ($definition['label'] ?? $definition['id']);
      $normalizedDefinition['shortcut'] = isset($definition['shortcut']) ? (string) $definition['shortcut'] : '';
      $normalized['tagDefinitions'][] = $normalizedDefinition;
    }
  }

  if (is_array($data['tiles'] ?? null)) {
    foreach ($data['tiles'] as $key => $entry) {
      $normalizedEntry = normalize_entry($entry, (string) $key);
      if (!$normalizedEntry) continue;
      $entryKey = $normalizedEntry['cycleId'] . ':' . $normalizedEntry['tileId'];
      $face = $normalizedEntry['face'] ?? '';
      if ($face === 'A' || $face === 'B') $entryKey .= ':' . $face;
      $normalized['tiles'][$entryKey] = $normalizedEntry;
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

  // rename() 在同目录内是原子替换（Windows 上也一样）；失败时不能退回 copy()，
  // 那会原地截断正在使用中的文件。写不进去就明确报错。
  if ($written === false || $written < strlen($content) || !@rename($tempFile, $mapFile)) {
    @unlink($tempFile);
    respond(500, ['ok' => false, 'error' => 'Could not write map-tile-tags.js.']);
  }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $current = read_map_file($mapFile);
  $data = normalize_payload($current);
  respond(200, [
    'ok' => true,
    'data' => $data,
    'revision' => map_tags_revision($current),
    'updatedAt' => $data['updatedAt'] ?? null,
  ]);
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  $payload = json_decode((string) $raw, true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);
  if (!is_array($payload['data'] ?? null)) respond(400, ['ok' => false, 'error' => 'Missing data payload.']);

  // 旧客户端不带 expectedRevision：仍按原行为直接写入（只是版本号照样递增）。
  $expectedRevision = null;
  if (array_key_exists('expectedRevision', $payload) && $payload['expectedRevision'] !== null) {
    if (!is_int($payload['expectedRevision']) && !(is_string($payload['expectedRevision']) && ctype_digit($payload['expectedRevision']))) {
      respond(400, ['ok' => false, 'error' => 'expectedRevision must be an integer.']);
    }
    $expectedRevision = (int) $payload['expectedRevision'];
  }

  // 读取、比较、替换必须在同一把锁内完成，否则两个页面同时保存时后写的仍会覆盖先写的，
  // 而两边都显示「保存成功」。这里的锁文件与数据文件分开，所以数据文件的 rename 不影响加锁。
  // read_map_file()/write_map_file() 失败时会自己 respond()（exit），进程退出会释放句柄，
  // 所以错误路径不需要显式解锁。
  $lockHandle = fopen($mapLockFile, 'c');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX)) {
    if ($lockHandle) fclose($lockHandle);
    respond(500, ['ok' => false, 'error' => 'Could not lock map-tile-tags.js.']);
  }

  $current = read_map_file($mapFile);
  $currentRevision = map_tags_revision($current);
  if ($expectedRevision !== null && $expectedRevision !== $currentRevision) {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
    respond(409, [
      'ok' => false,
      'code' => 'SAVE_CONFLICT',
      'revision' => $currentRevision,
      'updatedAt' => $current['updatedAt'] ?? null,
      'error' => 'map-tile-tags.js 已被其他页面或用户修改（服务器版本 ' . $currentRevision . '），本次保存未写入。',
    ]);
  }

  $data = normalize_payload($payload['data']);
  // version 只增不减：老客户端回传的 1 不能把文件从 2 降级（降级会让按版本判断的读取方变旧）。
  $data['version'] = max(map_tags_version($current), map_tags_version($data));
  $data['updatedAt'] = gmdate('c');
  $data['revision'] = $currentRevision + 1;
  write_map_file($mapFile, $data);

  flock($lockHandle, LOCK_UN);
  fclose($lockHandle);
  respond(200, [
    'ok' => true,
    'data' => $data,
    'revision' => $data['revision'],
    'updatedAt' => $data['updatedAt'],
  ]);
}

respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
