<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$tagFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'exploration-card-tags.js';

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if (!is_string($_SESSION['ato_user_id'] ?? null) || $_SESSION['ato_user_id'] === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录。']);
}

function read_tags(string $tagFile): array {
  if (!is_file($tagFile)) {
    return ['version' => 1, 'updatedAt' => null, 'cards' => []];
  }
  $raw = file_get_contents($tagFile);
  if ($raw === false || !preg_match('/window\.ATO_EXPLORATION_CARD_TAGS\s*=\s*(\{.*\})\s*;?\s*$/s', $raw, $matches)) {
    respond(500, ['ok' => false, 'error' => '无法解析探索卡标签文件。']);
  }
  $data = json_decode($matches[1], true);
  if (!is_array($data)) respond(500, ['ok' => false, 'error' => '探索卡标签文件不是有效 JSON。']);
  return $data;
}

function normalize_tags(array $data): array {
  $cards = [];
  foreach (($data['cards'] ?? []) as $key => $entry) {
    if (!is_array($entry)) continue;
    $parts = explode(':', (string) $key, 2);
    $cycleId = strtolower(trim((string) ($entry['cycleId'] ?? ($parts[0] ?? ''))));
    $cardId = trim((string) ($entry['cardId'] ?? ($parts[1] ?? '')));
    if (!in_array($cycleId, ['c1', 'c2', 'c3'], true) || !preg_match('/^\d+$/', $cardId)) continue;

    $removalValue = (string) ($entry['removal'] ?? '');
    $removal = $removalValue === 'permanent'
      ? 'permanent'
      : ($removalValue === 'remove' ? 'remove' : 'keep');
    $draw = $removal !== 'keep' || ($entry['draw'] ?? '') === 'chain' ? 'chain' : 'single';
    $normalizedKey = $cycleId . ':' . $cardId;
    $cards[$normalizedKey] = [
      'cycleId' => $cycleId,
      'cardId' => $cardId,
      'removal' => $removal,
      'draw' => $draw,
      'reviewed' => (bool) ($entry['reviewed'] ?? true),
      'notes' => trim((string) ($entry['notes'] ?? '')),
      'updatedAt' => (string) ($entry['updatedAt'] ?? gmdate('c')),
    ];
  }
  ksort($cards, SORT_NATURAL);
  return [
    'version' => 1,
    'updatedAt' => (string) ($data['updatedAt'] ?? gmdate('c')),
    'cards' => $cards,
  ];
}

function write_tags(string $tagFile, array $data): void {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if ($json === false) respond(500, ['ok' => false, 'error' => '无法编码探索卡标签。']);
  $content = "window.ATO_EXPLORATION_CARD_TAGS = " . $json . ";\n";
  $tempFile = $tagFile . '.tmp';
  if (file_put_contents($tempFile, $content, LOCK_EX) === false || !rename($tempFile, $tagFile)) {
    @unlink($tempFile);
    respond(500, ['ok' => false, 'error' => '无法写入探索卡标签文件。']);
  }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
  respond(200, ['ok' => true, 'data' => normalize_tags(read_tags($tagFile))]);
}
if ($method === 'POST') {
  $payload = json_decode((string) file_get_contents('php://input'), true);
  if (!is_array($payload) || !is_array($payload['data'] ?? null)) {
    respond(400, ['ok' => false, 'error' => '请求内容必须包含 data JSON。']);
  }
  $data = normalize_tags($payload['data']);
  $data['updatedAt'] = gmdate('c');
  write_tags($tagFile, $data);
  respond(200, ['ok' => true, 'data' => $data]);
}

respond(405, ['ok' => false, 'error' => '不支持的请求方法。']);
