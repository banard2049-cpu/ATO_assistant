<?php
declare(strict_types=1);

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$mapFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'aibp' . DIRECTORY_SEPARATOR
  . 'ps' . DIRECTORY_SEPARATOR . 'other' . DIRECTORY_SEPARATOR . 'resouce'
  . DIRECTORY_SEPARATOR . 'bp_resource_map_c4_c5.js';
$backupFile = $mapFile . '.backup.js';
$cycleResourceKeys = [
  'C4' => [
    'cursedDerelict', 'blackenedHalo', 'burnedOutGrace', 'cursedBloatsack',
    'livingGold', 'imperialScroll', 'wishEmbryo', 'oldIremFragment',
    'blackTaintedStepfinger', 'promisedFuturesCarcass',
    'babylonianContraption', 'onyxDust', 'ireEssence', 'mutableAmbrosia',
  ],
  'C5' => [
    'atlanteanTekne', 'orichalcumChunk', 'liquidAether',
    'promisedFuturesCarcass', 'blackTaintedStepfinger',
    'hydradynamicScales', 'amygdalanExtract', 'photophobicFlesh',
    'microwaveCell', 'blackWoolStrand', 'fadingLightConstruct',
    'orichalcumAlloy', 'slaveMetal', 'oxidizedAmbrosia',
  ],
];
$apostleCardCounts = [
  'MIDASCORE' => ['cycle' => 'C4', 'type' => 'BP', 'counts' => [6, 6, 6]],
  'DEMIDJINN' => ['cycle' => 'C4', 'type' => 'BP', 'counts' => [6, 6, 6]],
  'THE_BABELIAN_LUNACY' => ['cycle' => 'C4', 'type' => 'BP', 'counts' => [6, 6, 6]],
  'DAHAKA' => ['cycle' => 'C4', 'type' => 'AI', 'counts' => [6, 6, 6]],
  'DRAGON_OF_PHOBOS' => ['cycle' => 'C5', 'type' => 'BP', 'counts' => [6, 6, 6]],
  'MEDUKETOS' => ['cycle' => 'C5', 'type' => 'BP', 'counts' => [6, 6, 6]],
  'UR_FLEECE' => ['cycle' => 'C5', 'type' => 'BP', 'counts' => [6, 6, 6]],
  'TITAN_X' => [
    'cycle' => 'C5',
    'type' => 'BP',
    'counts' => [6, 6, 6],
    'indices' => [
      'I' => [2, 3, 4, 5, 6, 7],
      'II' => [1, 2, 3, 5, 6, 7],
      'III' => [1, 2, 3, 4, 5, 6],
    ],
  ],
];

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function allowed_cards(array $definitions): array {
  $levels = ['I', 'II', 'III'];
  $allowed = [];
  foreach ($definitions as $apostle => $definition) {
    $allowed[$apostle] = [];
    foreach ($levels as $levelIndex => $level) {
      $count = (int) ($definition['counts'][$levelIndex] ?? 0);
      $indices = is_array($definition['indices'][$level] ?? null)
        ? $definition['indices'][$level]
        : range(1, $count);
      foreach ($indices as $index) {
        $fileName = sprintf(
          '%s_%s_%s_%03d.jpg',
          $apostle,
          $definition['type'],
          $level,
          $index
        );
        $allowed[$apostle][$fileName] = true;
      }
    }
  }
  return $allowed;
}

function normalize_data(
  $value,
  array $definitions,
  array $allowedCards,
  array $cycleResourceKeys
): array {
  $normalized = [];
  foreach ($definitions as $apostle => $_definition) {
    $normalized[$apostle] = [];
    $cards = is_array($value[$apostle] ?? null) ? $value[$apostle] : [];
    foreach ($cards as $fileName => $resources) {
      $fileName = (string) $fileName;
      if (!isset($allowedCards[$apostle][$fileName]) || !is_array($resources)) continue;
      $entry = [];
      $resourceKeys = $cycleResourceKeys[$_definition['cycle']] ?? [];
      foreach ($resourceKeys as $resourceKey) {
        $count = max(0, min(99, (int) ($resources[$resourceKey] ?? 0)));
        if ($count > 0) $entry[$resourceKey] = $count;
      }
      $normalized[$apostle][$fileName] = $entry;
    }
    ksort($normalized[$apostle], SORT_NATURAL);
  }
  return $normalized;
}

function map_content(array $data): string {
  $json = json_encode(
    $data,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
  );
  if ($json === false) respond(500, ['ok' => false, 'error' => '无法编码资源映射。']);
  return "/* C4-C5 BP resource labels. Maintained by tools/bp-resource-labeler/. */\n"
    . "(function () {\n"
    . "  \"use strict\";\n\n"
    . "  const target = window.AIBP_BP_RESOURCE_MAP ||= {};\n"
    . "  const data = " . $json . ";\n\n"
    . "  Object.entries(data).forEach(([apostle, cards]) => {\n"
    . "    Object.assign(target[apostle] ||= {}, cards);\n"
    . "  });\n"
    . "})();\n";
}

function write_map(string $mapFile, string $backupFile, string $content): void {
  if (is_file($mapFile)) {
    $current = file_get_contents($mapFile);
    if ($current !== false) file_put_contents($backupFile, $current, LOCK_EX);
  }
  $temporaryFile = $mapFile . '.tmp';
  if (file_put_contents($temporaryFile, $content, LOCK_EX) === false
      || !rename($temporaryFile, $mapFile)) {
    @unlink($temporaryFile);
    respond(500, ['ok' => false, 'error' => '无法保存 C4-C5 资源映射。']);
  }
}

if (!is_string($_SESSION['ato_user_id'] ?? null) || $_SESSION['ato_user_id'] === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录。']);
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
  respond(405, ['ok' => false, 'error' => '不支持的请求方法。']);
}

$payload = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($payload) || !is_array($payload['data'] ?? null)) {
  respond(400, ['ok' => false, 'error' => '请求中缺少资源映射数据。']);
}

$allowedCards = allowed_cards($apostleCardCounts);
$data = normalize_data($payload['data'], $apostleCardCounts, $allowedCards, $cycleResourceKeys);
$cardCount = array_sum(array_map('count', $data));
write_map($mapFile, $backupFile, map_content($data));

respond(200, [
  'ok' => true,
  'data' => $data,
  'cardCount' => $cardCount,
  'updatedAt' => gmdate('c'),
]);
