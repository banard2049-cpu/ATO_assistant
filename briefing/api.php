<?php
declare(strict_types=1);

// 战役简报数据接口（只读）。
//
// 简报完全由「每日存档备份」重建：api/campaign-state.php 在每次进入下一天之前，会把
// 当天的存档整份复制到 data/backups/<账号>/daily/<profile>/<cycle>/day-<天数>/。这里把
// 每一天的最新一份快照当作「那天的结束状态」，相邻两天相减就得到当天发生的事（新翻开的
// 板块、新点亮的科技、故事/定数推进、英雄增减……），前端再按这条日期轴同步回放地图与
// 科技树。装备库存与资源收支保存在存档的 record 模块里（科技页负责读写），简报目前还没有
// 为它们做差分展示，所以不在这里编造。
//
// 这个接口只做 GET，只读 data/ 与几个数据文件，绝不改动存档。

ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
  if (!(error_reporting() & $severity)) return false;
  error_log(sprintf('%s in %s on line %d', $message, $file, $line));
  return true;
});

$cookieLifetime = 60 * 60 * 24 * 180;
ini_set('session.gc_maxlifetime', (string) $cookieLifetime);
// 落地部署里数据目录固定是 <仓库根>/data；测试与排查可以用 ATO_DATA_DIR 指向一份
// 临时拷贝，避免动到真实存档（api/campaign-state.php 与 router.php 同样认这个变量）。
$envDataDir = getenv('ATO_DATA_DIR');
$dataDir = (is_string($envDataDir) && $envDataDir !== '')
  ? rtrim($envDataDir, "\\/")
  : dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$root = dirname(__DIR__);

// 与 api/campaign-state.php 用同一个 session 目录与 cookie 参数，登录态才能共用。
$sessionDir = $dataDir . DIRECTORY_SEPARATOR . 'sessions';
if (!is_dir($sessionDir)) @mkdir($sessionDir, 0770, true);
if (is_dir($sessionDir) && is_writable($sessionDir)) {
  session_save_path($sessionDir);
}
session_set_cookie_params([
  'lifetime' => $cookieLifetime,
  'path' => '/',
  'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
  'httponly' => true,
  'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const BRIEFING_VERSION = 2;
// 简报要看的是一整轮的历史，不按单日备份的保留策略裁剪；这里只是防御性上限，
// 避免一个损坏的备份目录把整个目录树读进内存。
const MAX_REVISIONS_PER_DAY = 24;

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode(
    $payload,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
  );
  exit;
}

function read_json(string $file): ?array {
  if (!is_file($file)) return null;
  $raw = @file_get_contents($file);
  if ($raw === false || $raw === '') return null;
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : null;
}

// 与 api/campaign-state.php 的 campaign_backup_component() 保持一致：天数里带斜杠之类的
// 字符（例如 "T6/00"）在目录名里会被替换并加哈希后缀，构造/回推目录名时必须同样处理。
function backup_component(string $value): string {
  $component = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '-', $value), '-');
  if ($component === '') $component = 'value';
  $needsHash = $component !== $value || strlen($component) > 70;
  if (strlen($component) > 70) $component = substr($component, 0, 70);
  if ($needsHash) $component .= '-' . substr(hash('sha256', $value), 0, 8);
  return $component;
}

function backup_root(string $dataDir, string $userId): string {
  return $dataDir . DIRECTORY_SEPARATOR . 'backups' . DIRECTORY_SEPARATOR . backup_component($userId);
}

/** 日期排序键：序章 Tn 在前，正片第 n 天在后。 */
function day_sort_key(string $day): array {
  // 字符类里 `[/-]` 会被 PCRE 当成「/ 到 - 的范围」而报 Unknown modifier，
  // 于是 preg_match 返回 false，整条序章分支静默失效；斜杠与连字符都转义才安全。
  if (preg_match('/^T(\d+)(?:[\/-](\d+))?$/', $day, $m) === 1) {
    return [0, (int) $m[1], isset($m[2]) ? (int) $m[2] : 0];
  }
  if (preg_match('/^-?\d+$/', $day) === 1) {
    return [1, (int) $day, 0];
  }
  return [2, 0, 0];
}

function readable_day(string $day): string {
  if (preg_match('/^T(\d+)(?:[\/-](\d+))?$/', $day, $m) === 1) {
    return isset($m[2]) ? sprintf('序章 T%s-%s', $m[1], $m[2]) : sprintf('序章 T%s', $m[1]);
  }
  return '第 ' . $day . ' 天';
}

function cycle_label(string $cycleId): string {
  $map = ['c1' => '循环 I', 'c2' => '循环 II', 'c3' => '循环 III', 'c4' => '循环 IV', 'c5' => '循环 V'];
  return $map[$cycleId] ?? $cycleId;
}

function normalize_key(string $value): string {
  return strtolower(trim((string) preg_replace('/\s+/', ' ', $value)));
}

/**
 * 存档真正生效的 profile id。
 * 每份快照各自记着自己的 activeProfileId，历史备份不一定和当前存档相同，所以天数要从
 * 快照内部解析，不能直接用当前存档的 profile。
 */
function campaign_profile_id(array $campaign): string {
  $dashboard = is_array($campaign['sections']['dashboard'] ?? null) ? $campaign['sections']['dashboard'] : [];
  $profiles = is_array($dashboard['profiles'] ?? null) ? $dashboard['profiles'] : [];
  $profileId = (string) ($dashboard['activeProfileId'] ?? 'default');
  if (!isset($profiles[$profileId]) && $profiles) {
    $profileId = (string) array_key_first($profiles);
  }
  return $profileId !== '' ? $profileId : 'default';
}

/** 把一份存档快照压成简报需要的字段。 */
function extract_snapshot(array $campaign, string $cycleId): array {
  $dashboard = is_array($campaign['sections']['dashboard'] ?? null) ? $campaign['sections']['dashboard'] : [];
  $profileId = campaign_profile_id($campaign);
  $state = $dashboard['profiles'][$profileId]['cycles'][$cycleId]['state'] ?? [];
  if (!is_array($state)) $state = [];

  $map = is_array($state['mapSnapshot'] ?? null) ? $state['mapSnapshot'] : [];
  $tech = is_array($state['unlockedTech'] ?? null) ? $state['unlockedTech'] : [];
  $heroes = is_array($campaign['sections']['heroes'] ?? null) ? $campaign['sections']['heroes'] : [];
  $story = is_array($campaign['sections']['story'] ?? null) ? $campaign['sections']['story'] : [];

  $heroNames = [];
  foreach (($heroes['heroes'] ?? []) as $hero) {
    if (!is_array($hero)) continue;
    $name = trim((string) ($hero['customName'] ?? ''));
    if ($name === '') $name = trim((string) ($hero['playerName'] ?? ''));
    if ($name === '') $name = trim((string) ($hero['argonaut'] ?? ''));
    if ($name === '') $name = '未命名英雄';
    $heroNames[] = $name;
  }
  $graveyard = [];
  foreach (($heroes['graveyard'] ?? []) as $hero) {
    if (!is_array($hero)) continue;
    $name = trim((string) ($hero['customName'] ?? ''));
    if ($name === '') $name = trim((string) ($hero['argonaut'] ?? ''));
    $graveyard[] = $name !== '' ? $name : '无名英雄';
  }

  $explored = [];
  // 当天翻开、还没到“进入下一天”的板块也算已揭示，地图回放要画出来。
  foreach (($map['revealedIds'] ?? $map['exploredIds'] ?? []) as $tileId) $explored[] = (string) $tileId;

  $tileNotes = [];
  foreach (($map['tileNotes'] ?? []) as $entry) {
    if (is_array($entry) && isset($entry['tileId'])) {
      $note = trim((string) ($entry['note'] ?? ''));
      if ($note !== '') $tileNotes[(string) $entry['tileId']] = $note;
    }
  }

  $unlockedKeys = [];
  foreach (($tech['unlockedKeys'] ?? []) as $key) $unlockedKeys[] = normalize_key((string) $key);

  $draws = [];
  foreach ((array) ($state['exploration']['drawStateByCycle'][$cycleId]['history'] ?? []) as $entry) {
    if (!is_array($entry)) continue;
    $draws[] = [
      'id' => (string) ($entry['id'] ?? ''),
      'name' => (string) ($entry['name'] ?? ''),
      'day' => (string) ($entry['day'] ?? ''),
    ];
  }

  $scalar = static function ($value): string {
    return is_scalar($value) ? (string) $value : '';
  };
  // 保留备份中的版本信息，由简报使用主控台同一份 A/B 卡面字典解释旧版位置。
  // 缺少卡片记录时返回 null，不能把今天的进展补进历史备份。
  $cardTracks = null;
  if (is_array($state['cardTracks'] ?? null)) {
    $cardTracks = [];
    foreach (['story', 'doom', 'inwardOdyssey'] as $kind) {
      if (!is_array($state['cardTracks'][$kind] ?? null)) continue;
      $cardTracks[$kind] = [];
      foreach (['position', 'progress', 'doom'] as $field) {
        $value = $state['cardTracks'][$kind][$field] ?? null;
        if (is_scalar($value)) $cardTracks[$kind][$field] = $value;
      }
    }
    // 空对象在 JSON 里仍然是对象，方便客户端识别旧版 cardTracks 的存在。
    if (!$cardTracks) $cardTracks = (object) [];
  }
  $cardCounters = null;
  if (is_array($state['cardCounters'] ?? null)) {
    $cardCounters = [];
    foreach (['story', 'doom', 'storyCount', 'doomCount', 'inwardOdyssey', 'inwardOdysseyCount'] as $field) {
      $value = $state['cardCounters'][$field] ?? null;
      if (is_scalar($value)) $cardCounters[$field] = $value;
    }
    if (!$cardCounters) $cardCounters = (object) [];
  }

  $adventureHubs = null;
  if (is_array($state['surveyConstants'] ?? null)) {
    $checked = [];
    foreach ((array) ($state['surveyConstants']['hubs'] ?? []) as $hubId => $boxes) {
      if (!is_array($boxes)) continue;
      $checked[$hubId] = array_map('strval', array_keys(array_filter($boxes, static fn($value) => is_scalar($value) && (bool) $value)));
    }
    $active = $state['surveyConstants']['activeHub'] ?? [];
    $adventureHubs = [
      'checked' => $checked ?: (object) [],
      'activeHub' => is_array($active) ? $scalar($active['itemId'] ?? null) : '',
      'activeBox' => is_array($active) ? $scalar($active['boxId'] ?? null) : '',
    ];
  }

  return [
    'day' => $scalar($state['day'] ?? null),
    'savedAt' => $scalar($map['savedAt'] ?? ($state['updatedAt'] ?? null)),
    'location' => $scalar($state['location'] ?? null),
    'objective' => trim($scalar($state['objective'] ?? null)),
    'reminder' => trim($scalar($state['reminder'] ?? null)),
    'notes' => $scalar($state['notes'] ?? null),
    'dateNotes' => is_array($state['dateNotes'] ?? null) ? array_values($state['dateNotes']) : [],
    'surveyActive' => $scalar($state['specialEventConstantsActive'] ?? null),
    'pharosActive' => $scalar($state['pharosDreamsActive'] ?? null),
    'mainStoryActive' => $scalar($state['mainStoryConstantsActive'] ?? null),
    'cardTracks' => $cardTracks,
    'cardTracksVersion' => is_scalar($state['cardTracksVersion'] ?? null) ? (int) $state['cardTracksVersion'] : null,
    'cardCounters' => $cardCounters,
    'adventureHubs' => $adventureHubs,
    'map' => [
      'explored' => $explored,
      'currentTileId' => $scalar($map['currentTileId'] ?? null),
      'latestRevealedTileId' => $scalar($map['latestRevealedTileId'] ?? null),
      'adversaryTileId' => $scalar($map['adversaryTileId'] ?? null),
      'lastCityTileId' => $scalar($map['lastCityTileId'] ?? null),
      'lastOasisTileId' => $scalar($map['lastOasisTileId'] ?? null),
      'lastSilverRuinTileId' => $scalar($map['lastSilverRuinTileId'] ?? null),
      'scoutCount' => (int) ($map['scoutCount'] ?? 0),
      'scoutTileId' => $scalar($map['scoutTileId'] ?? null),
      'currentTileTagLabels' => array_values(array_map('strval', (array) ($map['currentTileTagLabels'] ?? []))),
      'currentTileFactionLabels' => array_values(array_map('strval', (array) ($map['currentTileFactionLabels'] ?? []))),
      'latestRevealedTileTagLabels' => array_values(array_map('strval', (array) ($map['latestRevealedTileTagLabels'] ?? []))),
      'totalTiles' => (int) ($map['totalTiles'] ?? 0),
      'tileNotes' => $tileNotes,
      'markers' => array_values(array_map('strval', (array) ($map['markers'] ?? []))),
    ],
    'techKeys' => $unlockedKeys,
    'heroes' => ['names' => $heroNames, 'graveyard' => $graveyard],
    'story' => [
      'bookTitle' => $scalar($story['bookTitle'] ?? null),
      'section' => $scalar($story['section'] ?? null),
      'title' => $scalar($story['title'] ?? null),
      'id' => $scalar($story['id'] ?? null),
    ],
    'draws' => $draws,
  ];
}

/** 当天各步骤里新追加的「地图同步」流水行。 */
function new_map_sync_lines(string $notes, string $previousNotes): array {
  if ($notes === '') return [];
  $prefix = ($previousNotes !== '' && str_starts_with($notes, $previousNotes)) ? $previousNotes : '';
  $lines = [];
  foreach (preg_split('/\r?\n/', substr($notes, strlen($prefix))) ?: [] as $line) {
    $line = trim($line);
    if ($line !== '') $lines[] = $line;
  }
  return $lines;
}

function describe_progress_key(string $value, string $label): string {
  if ($value === '') return '';
  $parts = explode(':', $value, 2);
  $suffix = isset($parts[1]) && $parts[1] !== '' ? '（进度 ' . $parts[1] . '）' : '';
  return $label . '推进到 ' . $parts[0] . $suffix;
}

/** 简报可选的循环：账号存档里所有 profile 的所有循环。 */
function list_cycles(array $campaign): array {
  $dashboard = is_array($campaign['sections']['dashboard'] ?? null) ? $campaign['sections']['dashboard'] : [];
  $profiles = is_array($dashboard['profiles'] ?? null) ? $dashboard['profiles'] : [];
  $out = [];
  foreach ($profiles as $profileId => $profile) {
    if (!is_array($profile)) continue;
    $cycles = is_array($profile['cycles'] ?? null) ? $profile['cycles'] : [];
    foreach ($cycles as $cycleId => $cycle) {
      if (!is_array($cycle)) continue;
      $state = is_array($cycle['state'] ?? null) ? $cycle['state'] : [];
      $out[] = [
        'profileId' => (string) $profileId,
        'profileName' => (string) ($profile['name'] ?? $profileId),
        'cycleId' => (string) $cycleId,
        'label' => cycle_label((string) $cycleId),
        'day' => is_scalar($state['day'] ?? null) ? (string) $state['day'] : '',
      ];
    }
  }
  return $out;
}

/**
 * 科技字典：key -> 显示名/分类，每个循环页面的节点清单与依赖边。
 * 依赖关系与 technology/tech-tree.js 的 buildGraph() 保持一致：requires 是硬前置，
 * requires_any_groups 是可选前置；老数据没有前置时用 xlsm_leads_to 反推。
 */
function load_tech_dictionary(string $root): array {
  static $cache = null;
  if ($cache !== null) return $cache;
  $data = read_json($root . '/technology/tech_card_dictionary.min.json');
  $cards = [];
  $nodesByPage = [];
  foreach (($data['cards'] ?? []) as $card) {
    if (!is_array($card)) continue;
    $rawKey = trim((string) ($card['key'] ?? ''));
    $key = normalize_key($rawKey);
    if ($key === '') continue;
    $name = trim((string) ($card['names']['zh'] ?? ''));
    if ($name === '') $name = trim((string) ($card['names']['en'] ?? $key));
    $nameEn = trim((string) ($card['names']['en'] ?? $rawKey));
    $referenceName = trim((string) ($card['backNames']['zh'] ?? ''));
    if ($referenceName === '') $referenceName = trim((string) ($card['backNames']['en'] ?? ''));
    if ($referenceName === '') $referenceName = $name;
    if (!isset($cards[$key])) {
      $cards[$key] = ['key' => $key, 'name' => $name, 'referenceName' => $referenceName, 'nameEn' => $nameEn, 'category' => (string) ($card['category'] ?? '')];
    }
    foreach (($card['nodes'] ?? []) as $node) {
      if (!is_array($node)) continue;
      $page = (string) ($node['page'] ?? '');
      if ($page === '') continue;
      $box = is_array($node['box'] ?? null) ? $node['box'] : null;
      $nodesByPage[$page][] = [
        'id' => (string) ($node['id'] ?? ''),
        'key' => $key,
        // 解析 req/unlocks 引用时要用卡片原来的写法（大小写、空格都可能不同）。
        'rawKey' => $rawKey,
        'name' => $name,
        'nameEn' => $nameEn,
        'box' => $box ? array_map('floatval', array_slice($box, 0, 4)) : null,
        // 依赖原始写法原样交给前端：连线由 technology/tech-tree.js 的 buildGraph() 算，
        // 简报不自己实现一套规则，科技树页面的连线才不会和简报出现差异。
        'requires' => array_values(array_map('strval', (array) ($node['req'] ?? []))),
        'requiresAnyGroups' => array_map(
          static fn($group): array => array_values(array_map('strval', (array) $group)),
          array_values((array) ($node['requires_any_groups'] ?? []))
        ),
        'xlsmLeadsTo' => array_values(array_map('strval', (array) ($node['unlocks'] ?? []))),
      ];
    }
  }

  // 页面内解析引用：先按 key，再按英文名（与 tech-tree.js 的 resolve() 同序）。
  $byName = [];
  foreach ($cards as $key => $info) {
    $normalized = normalize_key($info['name']);
    if (!isset($byName[$normalized])) $byName[$normalized] = $key;
  }
  $edges = [];
  foreach ($nodesByPage as $page => $nodes) {
    $idsByKey = [];
    foreach ($nodes as $node) {
      if (!isset($idsByKey[$node['key']])) $idsByKey[$node['key']] = $node['id'];
    }
    $resolve = static function (string $ref) use ($idsByKey, $byName): ?array {
      $normalized = normalize_key($ref);
      if (isset($idsByKey[$normalized])) return [$idsByKey[$normalized], $normalized];
      if (str_contains($normalized, '@@')) return null;
      $key = $byName[$normalized] ?? null;
      if ($key === null || !isset($idsByKey[$key])) return null;
      return [$idsByKey[$key], $key];
    };
    $pageEdges = [];
    $add = static function (?array $from, array $toNode, bool $optional) use (&$pageEdges): void {
      if ($from === null || $from[0] === $toNode['id']) return;
      $edgeKey = $from[0] . '>' . $toNode['id'];
      if (isset($pageEdges[$edgeKey])) {
        $pageEdges[$edgeKey]['optional'] = $pageEdges[$edgeKey]['optional'] && $optional;
        return;
      }
      $pageEdges[$edgeKey] = [
        'source' => $from[0],
        'target' => $toNode['id'],
        'sourceKey' => $from[1],
        'targetKey' => $toNode['key'],
        'optional' => $optional,
      ];
    };
    foreach ($nodes as $node) {
      foreach ($node['requires'] as $ref) $add($resolve($ref), $node, false);
      foreach ($node['requiresAnyGroups'] as $group) {
        foreach ($group as $ref) $add($resolve($ref), $node, true);
      }
    }
    // 老条目没有 req：用 unlocks 反推，与 tech-tree.js 的兜底一致。
    foreach ($nodes as $node) {
      if ($node['requires'] || $node['requiresAnyGroups']) continue;
      foreach ($node['xlsmLeadsTo'] as $ref) {
        $target = $resolve($ref);
        if ($target === null) continue;
        $targetNode = null;
        foreach ($nodes as $candidate) {
          if ($candidate['id'] === $target[0]) { $targetNode = $candidate; break; }
        }
        if ($targetNode === null || $targetNode['requires'] || $targetNode['requiresAnyGroups']) continue;
        $add([$node['id'], $node['key']], $targetNode, false);
      }
    }
    foreach ($pageEdges as $edge) $edges[$page][] = $edge;
  }

  $cache = ['cards' => $cards, 'nodesByPage' => $nodesByPage, 'edges' => $edges];
  return $cache;
}

/** 地图定义：每个循环的板块（坐标、正反面图）与画布尺寸。 */
function load_map_cycles(string $root): array {
  static $cache = null;
  if ($cache !== null) return $cache;
  $raw = @file_get_contents($root . '/map/map-data.js');
  $cycles = [];
  if ($raw !== false) {
    $json = preg_replace(['/^\s*window\.ATO_MAP_DATA\s*=\s*/', '/;\s*$/'], '', (string) $raw);
    $data = json_decode((string) $json, true);
    foreach (($data['cycles'] ?? []) as $cycle) {
      if (is_array($cycle)) $cycles[(string) ($cycle['id'] ?? '')] = $cycle;
    }
  }
  $cache = $cycles;
  return $cache;
}

/**
 * 读一个循环的每日备份目录。
 *
 * 天数不靠目录名回推：`day-T6-00-8907b12a` 这种名字是 campaign_backup_component() 把
 * 「T6/00」里的斜杠换成连字符、又补了 8 位哈希的结果，靠名字反推只能拿到一串难读的字符。
 * 备份文件里的 state.day 才是权威值（主控台的「恢复前一天」也是按它校验的），所以这里
 * 直接从当天最新的一份快照里读天数。
 *
 * 返回 ['days' => [天数...], 'files' => [天数 => [文件...]]]。
 */
function collect_backup_days(string $dir): array {
  $days = [];
  $files = [];
  if (!is_dir($dir)) return ['days' => [], 'files' => []];
  foreach (scandir($dir) ?: [] as $entry) {
    if ($entry === '.' || $entry === '..' || !str_starts_with($entry, 'day-')) continue;
    $path = $dir . DIRECTORY_SEPARATOR . $entry;
    if (!is_dir($path)) continue;
    $dayFiles = glob($path . DIRECTORY_SEPARATOR . '*.json') ?: [];
    if (!$dayFiles) continue;
    sort($dayFiles, SORT_STRING);
    $dayFiles = array_slice($dayFiles, -MAX_REVISIONS_PER_DAY);
    $day = snapshot_day($dayFiles) ?? substr($entry, 4);
    $files[$day] = $dayFiles;
    $days[] = $day;
  }
  usort($days, static fn(string $a, string $b): int => day_sort_key($a) <=> day_sort_key($b));
  return ['days' => $days, 'files' => $files];
}

/** 从一天里最新的一份快照读 state.day（先比 revision 再比修改时间）。 */
function snapshot_day(array $paths): ?string {
  $bestDay = null;
  $bestRevision = -1;
  $bestModified = -1;
  foreach ($paths as $path) {
    $campaign = read_json($path);
    if (!is_array($campaign) || !is_array($campaign['sections']['dashboard'] ?? null)) continue;
    $dashboard = $campaign['sections']['dashboard'];
    $profileId = campaign_profile_id($campaign);
    $profile = $dashboard['profiles'][$profileId] ?? [];
    $cycleId = (string) ($profile['activeCycleId'] ?? '');
    $state = $profile['cycles'][$cycleId]['state'] ?? null;
    if (!is_array($state) || !array_key_exists('day', $state) || !is_scalar($state['day'])) continue;
    $revision = (int) ($campaign['sectionRevisions']['dashboard'] ?? 0);
    $modified = (int) @filemtime($path);
    if ($bestDay === null || $revision > $bestRevision || ($revision === $bestRevision && $modified >= $bestModified)) {
      $bestDay = (string) $state['day'];
      $bestRevision = $revision;
      $bestModified = $modified;
    }
  }
  return $bestDay;
}

/** 目录里已经有这个天数了吗（天数来自快照，可能带斜杠，例如 "T6/00"）。 */
function day_dir_exists(string $dir, string $day): bool {
  return is_dir($dir . DIRECTORY_SEPARATOR . 'day-' . backup_component($day));
}

/** 一天里最新的一份快照（先比 revision 再比修改时间，与主控台「恢复前一天」一致）。 */
function latest_snapshot(string $cycleId, array $paths): ?array {
  $best = null;
  $bestRevision = -1;
  $bestModified = -1;
  foreach ($paths as $path) {
    $campaign = read_json($path);
    if (!is_array($campaign) || !is_array($campaign['sections'] ?? null)) continue;
    $revision = (int) ($campaign['sectionRevisions']['dashboard'] ?? 0);
    $modified = (int) @filemtime($path);
    if ($best === null || $revision > $bestRevision || ($revision === $bestRevision && $modified >= $bestModified)) {
      $best = extract_snapshot($campaign, $cycleId);
      $bestRevision = $revision;
      $bestModified = $modified;
    }
  }
  return $best;
}

$userId = $_SESSION['ato_user_id'] ?? null;
if (!is_string($userId) || $userId === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录主控台，再打开战役简报。']);
}
$userId = preg_replace('/[^a-z0-9_-]/', '', strtolower($userId)) ?? '';
if ($userId === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '登录信息无效，请重新登录。']);
}

$campaign = read_json($dataDir . DIRECTORY_SEPARATOR . 'ato-campaign-' . $userId . '.json');
if ($campaign === null) {
  respond(404, ['ok' => false, 'code' => 'NO_CAMPAIGN', 'error' => '没有找到这个账号的存档。']);
}

$cycles = list_cycles($campaign);
$dashboard = is_array($campaign['sections']['dashboard'] ?? null) ? $campaign['sections']['dashboard'] : [];
$activeProfileId = (string) ($dashboard['activeProfileId'] ?? 'default');
$requestedProfile = isset($_GET['profile']) && is_string($_GET['profile']) ? trim($_GET['profile']) : '';
$requestedCycle = isset($_GET['cycle']) && is_string($_GET['cycle']) ? trim($_GET['cycle']) : '';

$profileId = $requestedProfile;
if ($profileId === '' || !isset($dashboard['profiles'][$profileId])) $profileId = $activeProfileId;
if (!isset($dashboard['profiles'][$profileId]) && is_array($dashboard['profiles'] ?? null) && $dashboard['profiles']) {
  $profileId = (string) array_key_first($dashboard['profiles']);
}

$availableCycles = array_values(array_filter($cycles, static fn(array $c): bool => $c['profileId'] === $profileId));
$availableIds = array_column($availableCycles, 'cycleId');
$profileForActive = $dashboard['profiles'][$profileId] ?? [];
$activeCycleId = is_array($profileForActive) ? (string) ($profileForActive['activeCycleId'] ?? '') : '';
$cycleId = $requestedCycle;
if ($cycleId === '' || !in_array($cycleId, $availableIds, true)) {
  $cycleId = in_array($activeCycleId, $availableIds, true)
    ? $activeCycleId
    : (string) ($availableIds[0] ?? 'c1');
}

$cycleDir = backup_root($dataDir, $userId) . DIRECTORY_SEPARATOR . 'daily'
  . DIRECTORY_SEPARATOR . backup_component($profileId)
  . DIRECTORY_SEPARATOR . backup_component($cycleId);

$collected = collect_backup_days($cycleDir);
$presentDays = $collected['days'];
$dayFiles = $collected['files'];

$base = [
  'ok' => true,
  'version' => BRIEFING_VERSION,
  'user' => ['id' => $userId],
  'cycle' => [
    'profileId' => $profileId,
    'cycleId' => $cycleId,
    'label' => cycle_label($cycleId),
    'backupDir' => str_replace('\\', '/', substr($cycleDir, strlen($root) + 1)),
  ],
  'cycles' => $cycles,
];

if (!$presentDays) {
  respond(200, $base + [
    'hasData' => false,
    'message' => '这个循环还没有每日备份。推进到下一天后，当天的存档会被保留下来，简报才有内容。',
    'timeline' => [],
    'map' => null,
    'tech' => null,
    'summary' => ['days' => 0, 'recordedDays' => 0, 'explored' => 0, 'unlocked' => 0],
  ]);
}

$snapshots = [];
foreach ($presentDays as $day) {
  $snapshots[$day] = latest_snapshot($cycleId, $dayFiles[$day] ?? []);
}

// 日期轴：以实际存在的备份为准（含 "T6/00" 这类序章子日），只把序号中间的缺口补成
// 「无记录」，让差分说明它跨过了没有备份的那几天。
$sequence = $presentDays;
$maxNumeric = 0;
$maxPrologue = 0;
foreach ($presentDays as $day) {
  $key = day_sort_key($day);
  if ($key[0] === 0) $maxPrologue = max($maxPrologue, $key[1]);
  if ($key[0] === 1) $maxNumeric = max($maxNumeric, $key[1]);
}
if ($maxPrologue > 0) {
  // 序章：T0..Tn 里没有备份的补出来
  for ($i = 0; $i <= $maxPrologue; $i += 1) {
    $candidate = 'T' . $i;
    if (!day_dir_exists($cycleDir, $candidate) && !in_array($candidate, $sequence, true)) $sequence[] = $candidate;
  }
}
if ($maxNumeric > 0 || $maxPrologue > 0) {
  for ($i = 0; $i <= $maxNumeric; $i += 1) {
    $candidate = (string) $i;
    if (!day_dir_exists($cycleDir, $candidate) && !in_array($candidate, $sequence, true)) $sequence[] = $candidate;
  }
}
usort($sequence, static fn(string $a, string $b): int => day_sort_key($a) <=> day_sort_key($b));

$mapCycles = load_map_cycles($root);
$cycleDef = $mapCycles[$cycleId] ?? null;
$tileLabels = [];
if (is_array($cycleDef)) {
  foreach (($cycleDef['tiles'] ?? []) as $tile) {
    if (is_array($tile)) $tileLabels[(string) $tile['id']] = (string) ($tile['label'] ?? $tile['id']);
  }
}

$timeline = [];
$coverageByEnd = [];
$techByEnd = [];
$firstTileDay = [];
$firstTechDay = [];
$coveredTiles = [];
$techOrder = [];
$exploredTotal = 0;
$unlockedTotal = 0;

foreach ($sequence as $index => $day) {
  $snapshot = $snapshots[$day] ?? null;
  if ($snapshot === null) {
    $timeline[] = [
      'index' => $index,
      'day' => $day,
      'title' => readable_day($day),
      'present' => false,
      'changes' => [],
    ];
    $coverageByEnd[] = $coverageByEnd ? $coverageByEnd[count($coverageByEnd) - 1] : [];
    $techByEnd[] = $techByEnd ? $techByEnd[count($techByEnd) - 1] : [];
    continue;
  }

  $coverage = $snapshot['map']['explored'];
  $techKeys = $snapshot['techKeys'];
  $prevCoverage = $coverageByEnd ? $coverageByEnd[count($coverageByEnd) - 1] : [];
  $prevTech = $techByEnd ? $techByEnd[count($techByEnd) - 1] : [];

  $newTiles = array_values(array_diff($coverage, array_keys($prevCoverage)));
  $newTech = array_values(array_diff($techKeys, array_keys($prevTech)));

  $mergedCoverage = $prevCoverage;
  foreach ($coverage as $tileId) $mergedCoverage[$tileId] = true;
  $mergedTech = $prevTech;
  foreach ($techKeys as $key) $mergedTech[$key] = true;
  $coverageByEnd[] = $mergedCoverage;
  $techByEnd[] = $mergedTech;

  foreach ($newTiles as $tileId) {
    if (!isset($firstTileDay[$tileId])) $firstTileDay[$tileId] = $day;
    $coveredTiles[$tileId] = true;
  }
  $newTechNames = [];
  foreach ($newTech as $key) {
    if (!isset($firstTechDay[$key])) $firstTechDay[$key] = $day;
    if (!isset($techOrder[$key])) $techOrder[$key] = count($techOrder) + 1;
    $newTechNames[$key] = $key;
  }
  $exploredTotal = max($exploredTotal, count($mergedCoverage));
  $unlockedTotal = max($unlockedTotal, count($mergedTech));

  $savedAt = (string) $snapshot['savedAt'];
  $savedAtLocal = '';
  if ($savedAt !== '') {
    $ts = strtotime($savedAt);
    $offset = (int) (new DateTimeImmutable('now', new DateTimeZone(date_default_timezone_get())))->format('Z');
    if ($ts !== false) $savedAtLocal = date('Y-m-d H:i', $ts + $offset);
  }

  $changes = [];
  if ($newTiles) {
    $labels = array_map(static fn(string $id): string => $tileLabels[$id] ?? $id, $newTiles);
    $changes[] = ['kind' => 'map', 'label' => '翻开板块 ' . count($newTiles) . ' 格', 'items' => $labels];
  }
  $currentTile = (string) $snapshot['map']['currentTileId'];
  if ($currentTile !== '') {
    $detail = $tileLabels[$currentTile] ?? $currentTile;
    if ($snapshot['map']['currentTileTagLabels']) $detail .= '（' . implode('、', $snapshot['map']['currentTileTagLabels']) . '）';
    $changes[] = ['kind' => 'location', 'label' => '阿尔戈号在 ' . $detail, 'items' => []];
  }
  if ($newTech) {
    $changes[] = ['kind' => 'tech', 'label' => '点亮科技 ' . count($newTech) . ' 项', 'items' => array_values($newTech)];
  }
  $drawsToday = [];
  foreach ($snapshot['draws'] as $draw) {
    if ($draw['day'] === $day) $drawsToday[] = $draw['name'] !== '' ? $draw['name'] : $draw['id'];
  }
  if ($drawsToday) {
    $changes[] = ['kind' => 'exploration', 'label' => '冒险牌 ' . count($drawsToday) . ' 张', 'items' => $drawsToday];
  }

  $previousNotes = '';
  for ($back = count($timeline) - 1; $back >= 0; $back -= 1) {
    if (($timeline[$back]['present'] ?? false) && isset($timeline[$back]['notes'])) {
      $previousNotes = (string) $timeline[$back]['notes'];
      break;
    }
  }
  $syncLines = new_map_sync_lines($snapshot['notes'], $previousNotes);
  if ($syncLines) {
    $changes[] = ['kind' => 'mapsync', 'label' => '地图流水 ' . count($syncLines) . ' 条', 'items' => $syncLines];
  }

  $previous = null;
  for ($back = count($timeline) - 1; $back >= 0; $back -= 1) {
    if ($timeline[$back]['present'] ?? false) { $previous = $timeline[$back]; break; }
  }
  if ($snapshot['story']['section'] !== '' && ($previous === null || ($previous['story']['section'] ?? '') !== $snapshot['story']['section'])) {
    $changes[] = [
      'kind' => 'story',
      'label' => '故事推进到「' . $snapshot['story']['section'] . '」',
      'items' => $snapshot['story']['title'] !== '' ? [$snapshot['story']['title']] : [],
    ];
  }
  if ($snapshot['surveyActive'] !== '' && $snapshot['surveyActive'] !== ($previous['surveyActive'] ?? null)) {
    $changes[] = ['kind' => 'constant', 'label' => describe_progress_key($snapshot['surveyActive'], '勘察定数'), 'items' => []];
  }
  if ($snapshot['pharosActive'] !== '' && $snapshot['pharosActive'] !== ($previous['pharosActive'] ?? null)) {
    $changes[] = ['kind' => 'constant', 'label' => '法罗斯梦境进度 ' . $snapshot['pharosActive'], 'items' => []];
  }
  if ($snapshot['mainStoryActive'] !== '' && $snapshot['mainStoryActive'] !== ($previous['mainStoryActive'] ?? null)) {
    $changes[] = ['kind' => 'constant', 'label' => describe_progress_key($snapshot['mainStoryActive'], '主线定数'), 'items' => []];
  }
  if ($previous !== null) {
    $joined = array_values(array_diff($snapshot['heroes']['names'], $previous['heroes']['names']));
    $left = array_values(array_diff($previous['heroes']['names'], $snapshot['heroes']['names']));
    if ($joined) $changes[] = ['kind' => 'hero', 'label' => '加入英雄 ' . count($joined) . ' 名', 'items' => $joined];
    if ($left) $changes[] = ['kind' => 'hero', 'label' => '离队英雄 ' . count($left) . ' 名', 'items' => $left];
  }

  $timeline[] = [
    'index' => $index,
    'day' => $day,
    'title' => readable_day($day),
    'present' => true,
    'savedAt' => $savedAt,
    'savedAtLocal' => $savedAtLocal,
    'location' => $snapshot['location'],
    'objective' => $snapshot['objective'],
    'reminder' => $snapshot['reminder'],
    'notes' => $snapshot['notes'],
    'dateNotes' => $snapshot['dateNotes'],
    'mapSync' => $syncLines,
    'surveyActive' => $snapshot['surveyActive'],
    'pharosActive' => $snapshot['pharosActive'],
    'mainStoryActive' => $snapshot['mainStoryActive'],
    'cardTracks' => $snapshot['cardTracks'],
    'cardTracksVersion' => $snapshot['cardTracksVersion'],
    'cardCounters' => $snapshot['cardCounters'],
    'adventureHubs' => $snapshot['adventureHubs'],
    'story' => $snapshot['story'],
    'heroes' => $snapshot['heroes'],
    'map' => [
      'explored' => $coverage,
      'new' => $newTiles,
      'currentTileId' => $snapshot['map']['currentTileId'],
      'latestRevealedTileId' => $snapshot['map']['latestRevealedTileId'],
      'adversaryTileId' => $snapshot['map']['adversaryTileId'],
      'scoutTileId' => $snapshot['map']['scoutTileId'],
      'scoutCount' => $snapshot['map']['scoutCount'],
      'lastCityTileId' => $snapshot['map']['lastCityTileId'],
      'lastOasisTileId' => $snapshot['map']['lastOasisTileId'],
      'lastSilverRuinTileId' => $snapshot['map']['lastSilverRuinTileId'],
      'markers' => $snapshot['map']['markers'],
      'currentTileTagLabels' => $snapshot['map']['currentTileTagLabels'],
      'currentTileFactionLabels' => $snapshot['map']['currentTileFactionLabels'],
      'exploredCount' => count($coverage),
      'totalTiles' => $snapshot['map']['totalTiles'],
      'tileNotes' => $snapshot['map']['tileNotes'],
    ],
    'tech' => ['unlocked' => $techKeys, 'new' => $newTech],
    'changes' => $changes,
  ];
}

// 地图：只回传这一轮真正出现过的板块（简报不必画出全部格子）。
$tiles = [];
$canvas = ['width' => 1.0, 'height' => 1.0, 'tileWidth' => 1.0];
$layoutCycle = is_array($cycleDef) ? $cycleDef : ['id' => $cycleId, 'tiles' => [], 'width' => 1, 'height' => 1, 'tileWidth' => 1];
if (is_array($cycleDef)) {
  $tilesById = [];
  foreach (($cycleDef['tiles'] ?? []) as $tile) {
    if (is_array($tile)) $tilesById[(string) $tile['id']] = $tile;
  }
  foreach (array_keys($coveredTiles) as $tileId) {
    $tile = $tilesById[$tileId] ?? null;
    $tiles[] = [
      'id' => $tileId,
      'label' => (string) ($tile['label'] ?? $tileId),
      'row' => $tile['row'] ?? null,
      'col' => $tile['col'] ?? null,
      'nx' => $tile['nx'] ?? null,
      'ny' => $tile['ny'] ?? null,
      'front' => (string) ($tile['front'] ?? ''),
      'back' => (string) ($tile['back'] ?? ''),
      'firstDay' => $firstTileDay[$tileId] ?? '',
      'known' => $tile !== null,
    ];
  }
  $canvas = [
    'width' => (float) ($cycleDef['width'] ?? 1),
    'height' => (float) ($cycleDef['height'] ?? 1),
    'tileWidth' => (float) ($cycleDef['tileWidth'] ?? 1),
  ];
}

// 科技树：这一轮涉及到的页面节点 + 依赖边；未点亮的节点也回传，由前端画成灰底。
$dictionary = load_tech_dictionary($root);
$usedPages = [];
foreach ($timeline as $entry) {
  if (!($entry['present'] ?? false)) continue;
  foreach (($entry['tech']['unlocked'] ?? []) as $key) {
    $found = false;
    foreach ($dictionary['nodesByPage'] as $page => $nodes) {
      foreach ($nodes as $node) {
        if ($node['key'] === $key) { $usedPages[$page] = true; $found = true; }
      }
    }
    if (!$found) $usedPages['cycle1'] = true;
  }
}
if (!$usedPages) $usedPages['cycle1'] = true;
ksort($usedPages);

$techPages = [];
foreach (array_keys($usedPages) as $page) {
  $nodes = [];
  foreach (($dictionary['nodesByPage'][$page] ?? []) as $node) {
    $info = $dictionary['cards'][$node['key']] ?? null;
    $isUnlocked = isset($firstTechDay[$node['key']]);
    $nodes[] = [
      'id' => $node['id'],
      'key' => $node['key'],
      'rawKey' => $node['rawKey'],
      'name' => (string) ($info['name'] ?? $node['key']),
      'referenceName' => (string) ($info['referenceName'] ?? $node['key']),
      'nameEn' => (string) ($info['nameEn'] ?? $node['rawKey']),
      'category' => (string) ($info['category'] ?? ''),
      'box' => $node['box'],
      'requires' => $node['requires'],
      'requiresAnyGroups' => $node['requiresAnyGroups'],
      'xlsmLeadsTo' => $node['xlsmLeadsTo'],
      'unlocked' => $isUnlocked,
      'firstDay' => $isUnlocked ? $firstTechDay[$node['key']] : '',
      'order' => $techOrder[$node['key']] ?? null,
    ];
  }
  $techPages[] = [
    'page' => $page,
    'cycleId' => 'c' . preg_replace('/\D/', '', $page),
    'nodes' => $nodes,
    'edges' => $dictionary['edges'][$page] ?? [],
  ];
}

$unlockedRecords = [];
foreach ($firstTechDay as $key => $day) {
  $info = $dictionary['cards'][$key] ?? null;
  $unlockedRecords[] = [
    'key' => $key,
    'name' => (string) ($info['referenceName'] ?? $key),
    'category' => (string) ($info['category'] ?? ''),
    'firstDay' => $day,
    'order' => $techOrder[$key] ?? 0,
  ];
}
usort($unlockedRecords, static fn(array $a, array $b): int => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));

respond(200, $base + [
  'hasData' => true,
  'timeline' => $timeline,
  'map' => [
    'canvas' => $canvas,
    'cycle' => $layoutCycle,
    'tiles' => $tiles,
  ],
  'tech' => [
    'pages' => $techPages,
    'unlocked' => $unlockedRecords,
  ],
  'summary' => [
    'days' => count($sequence),
    'recordedDays' => count($presentDays),
    'firstDay' => (string) ($presentDays[0] ?? ''),
    'lastDay' => (string) ($presentDays[count($presentDays) - 1] ?? ''),
    'explored' => $exploredTotal,
    'totalTiles' => is_array($cycleDef) ? count($cycleDef['tiles'] ?? []) : 0,
    'unlocked' => $unlockedTotal,
  ],
]);
