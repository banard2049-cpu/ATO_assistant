<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$file = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'technology' . DIRECTORY_SEPARATOR . 'tech_card_dictionary.min.json';
$backupFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'technology' . DIRECTORY_SEPARATOR . 'tech_card_dictionary.backup.json';

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function read_dictionary(string $file): array {
  if (!is_file($file)) respond(404, ['ok' => false, 'error' => '科技字典不存在。']);
  $data = json_decode((string) file_get_contents($file), true);
  if (!is_array($data) || !is_array($data['cards'] ?? null)) {
    respond(500, ['ok' => false, 'error' => '科技字典文件损坏。']);
  }
  return $data;
}

function write_dictionary(string $file, array $data): void {
  $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if ($json === false) respond(500, ['ok' => false, 'error' => '无法编码科技字典。']);
  $temp = $file . '.tmp';
  if (file_put_contents($temp, $json, LOCK_EX) === false || !rename($temp, $file)) {
    @unlink($temp);
    respond(500, ['ok' => false, 'error' => '无法保存科技字典。']);
  }
}

function backup_dictionary(string $file, string $backupFile): void {
  if (!is_file($file)) return;
  $raw = file_get_contents($file);
  if ($raw !== false) file_put_contents($backupFile, $raw, LOCK_EX);
}

function normalize_key(string $value): string {
  return strtolower(trim(preg_replace('/\s+/', ' ', $value)));
}

function normalize_category($value): string {
  $category = strtolower(trim((string) $value));
  return $category === 'battle' ? 'battle' : 'structure';
}

function is_core_card(array $card): bool {
  if (!empty($card['core'])) return true;
  foreach (($card['nodes'] ?? []) as $node) {
    if (is_array($node) && !empty($node['core'])) return true;
  }
  $type = is_array($card['type'] ?? null) ? $card['type'] : [];
  foreach (['tags', 'raw_tags'] as $field) {
    $values = is_array($type[$field] ?? null) ? $type[$field] : [];
    if (in_array('CoreTechnology', $values, true)) return true;
  }
  return false;
}

function is_negotiation_candidate(array $card): bool {
  if (is_core_card($card)) return true;
  $type = is_array($card['type'] ?? null) ? $card['type'] : [];
  if (($type['battle_card_type'] ?? null) === 'production') return false;
  $nodes = is_array($card['nodes'] ?? null) ? $card['nodes'] : [];
  foreach ($nodes as $node) {
    if (!is_array($node)) continue;
    $category = (string) ($node['category'] ?? ($card['category'] ?? ($card['type']['category'] ?? '')));
    if ($category !== 'battle') return true;
  }
  if ($nodes) return false;
  $category = (string) ($card['category'] ?? ($card['type']['category'] ?? ''));
  return $category !== 'battle';
}

if (!is_string($_SESSION['ato_user_id'] ?? null) || $_SESSION['ato_user_id'] === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录。']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') respond(200, ['ok' => true, 'data' => read_dictionary($file)]);

if ($method === 'POST') {
  $payload = json_decode((string) file_get_contents('php://input'), true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => '请求内容必须是 JSON。']);

  $negotiationKeys = [];
  foreach (($payload['negotiationKeys'] ?? []) as $key) {
    $normalized = normalize_key((string) $key);
    if ($normalized !== '') $negotiationKeys[$normalized] = true;
  }

  $cardUpdates = [];
  foreach (($payload['cardUpdates'] ?? []) as $row) {
    if (!is_array($row)) continue;
    $key = normalize_key((string) ($row['key'] ?? ''));
    if ($key === '') continue;
    $cardUpdates[$key] = [
      'category' => normalize_category($row['category'] ?? 'structure'),
      'core' => !empty($row['core']),
    ];
  }

  $data = read_dictionary($file);
  foreach ($data['cards'] as &$card) {
    if (!is_array($card)) continue;
    $key = normalize_key((string) ($card['key'] ?? ''));
    if ($key !== '' && isset($cardUpdates[$key])) {
      $update = $cardUpdates[$key];
      $card['category'] = $update['category'];
      if ($update['core']) $card['core'] = true;
      else unset($card['core']);
      if (isset($card['nodes']) && is_array($card['nodes'])) {
        foreach ($card['nodes'] as &$node) {
          if (!is_array($node)) continue;
          $node['category'] = $update['category'];
          if ($update['core']) $node['core'] = true;
          else unset($node['core']);
        }
        unset($node);
      }
    }

    if (isset($payload['cardUpdates']) && !isset($payload['negotiationKeys'])) {
      continue;
    }

    if (!is_negotiation_candidate($card)) {
      if (isset($card['type']) && is_array($card['type'])) {
        unset($card['type']['negotiation']);
        if (!$card['type']) unset($card['type']);
      }
      continue;
    }
    if ($key === '') continue;
    if (!isset($card['type']) || !is_array($card['type'])) $card['type'] = [];
    if (isset($negotiationKeys[$key])) {
      $card['type']['negotiation'] = true;
    } else {
      unset($card['type']['negotiation']);
      if (!$card['type']) unset($card['type']);
    }
  }
  unset($card);

  $data['updatedAt'] = gmdate('c');
  backup_dictionary($file, $backupFile);
  write_dictionary($file, $data);
  respond(200, ['ok' => true, 'data' => ['updatedAt' => $data['updatedAt'], 'negotiationKeys' => array_keys($negotiationKeys)]]);
}

respond(405, ['ok' => false, 'error' => '不支持的请求方法。']);
