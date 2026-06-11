<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$file = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'technology' . DIRECTORY_SEPARATOR . 'gear_part_labels.json';
$backupFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'technology' . DIRECTORY_SEPARATOR . 'gear_part_labels.backup.json';
$allowed = ['attachment', 'armor', 'arm', 'aid', 'titan'];
$legacyMap = [
  'head' => 'armor',
  'feet' => 'armor',
  'body' => 'armor',
  'shield' => 'armor',
  'weapon' => 'arm',
  'support' => 'attachment',
  'other' => 'aid',
];

function is_titan_gear_id(string $gearId): bool {
  return str_starts_with(strtoupper(trim($gearId)), 'T:TT_');
}

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function normalize_labels($value, array $allowed, array $legacyMap): array {
  $labels = [];
  if (!is_array($value)) return $labels;
  foreach ($value as $gearId => $part) {
    $id = strtoupper(trim((string) $gearId));
    $part = trim((string) $part);
    $part = $legacyMap[$part] ?? $part;
    if ($part === 'titan' && !is_titan_gear_id($id)) $part = 'aid';
    if ($id !== '' && in_array($part, $allowed, true)) $labels[$id] = $part;
  }
  ksort($labels);
  return $labels;
}

function read_data(string $file, array $allowed, array $legacyMap): array {
  if (!is_file($file)) return ['version' => 1, 'updatedAt' => null, 'labels' => []];
  $data = json_decode((string) file_get_contents($file), true);
  if (!is_array($data)) respond(500, ['ok' => false, 'error' => '部位标注文件损坏。']);
  return [
    'version' => 1,
    'updatedAt' => $data['updatedAt'] ?? null,
    'labels' => normalize_labels($data['labels'] ?? [], $allowed, $legacyMap),
  ];
}

function write_data(string $file, array $data): void {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if ($json === false) respond(500, ['ok' => false, 'error' => '无法编码标注数据。']);
  $temp = $file . '.tmp';
  if (file_put_contents($temp, $json, LOCK_EX) === false || !rename($temp, $file)) {
    @unlink($temp);
    respond(500, ['ok' => false, 'error' => '无法保存标注数据。']);
  }
}

function backup_data(string $file, string $backupFile): void {
  if (!is_file($file)) return;
  $raw = file_get_contents($file);
  if ($raw === false) return;
  file_put_contents($backupFile, $raw, LOCK_EX);
}

if (!is_string($_SESSION['ato_user_id'] ?? null) || $_SESSION['ato_user_id'] === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录。']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') respond(200, ['ok' => true, 'data' => read_data($file, $allowed, $legacyMap)]);

if ($method === 'POST') {
  $payload = json_decode((string) file_get_contents('php://input'), true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => '请求内容必须是 JSON。']);
  backup_data($file, $backupFile);
  $data = [
    'version' => 1,
    'updatedAt' => gmdate('c'),
    'labels' => normalize_labels($payload['labels'] ?? [], $allowed, $legacyMap),
  ];
  write_data($file, $data);
  respond(200, ['ok' => true, 'data' => $data]);
}

respond(405, ['ok' => false, 'error' => '不支持的请求方法。']);
