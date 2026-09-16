<?php
declare(strict_types=1);

// API responses must remain valid JSON even when the runtime cannot write its
// data directory.  Keep PHP warnings out of the response body and send them to
// the server log instead; the operation below still checks every return value
// and reports a structured error to the client.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
  if (!(error_reporting() & $severity)) return false;
  error_log(sprintf('%s in %s on line %d', $message, $file, $line));
  return true;
});

$cookieLifetime = 60 * 60 * 24 * 180;
ini_set('session.gc_maxlifetime', (string) $cookieLifetime);
// PHP's built-in server changes the working directory to the requested script's
// directory, so a relative session.save_path resolved under api/ and every
// login session was silently dropped.  Pin the portable session directory when
// it exists: session storage must not depend on how the site was launched.
$sessionDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'sessions';
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

$allowedSections = ['dashboard', 'map', 'record', 'technology', 'heroes', 'aibp', 'story'];
$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$usersFile = $dataDir . DIRECTORY_SEPARATOR . 'ato-users.json';
$secondScreensFile = $dataDir . DIRECTORY_SEPARATOR . 'ato-second-screens.json';
// 必须比 php.ini 的 post_max_size（默认 8M）小：请求体一旦超过 post_max_size，
// PHP 在脚本运行之前就把正文丢掉了（php://input 变空，还会往响应里插一段 HTML
// 警告），脚本自己看不到超大请求，只能在读正文之前按 CONTENT_LENGTH 判掉。
$maxBytes = 1024 * 1024 * 6;
$backupCount = 10;

function release_lock(): void {
  $handle = $GLOBALS['atoLockHandle'] ?? null;
  $GLOBALS['atoLockHandle'] = null;
  if (!$handle) return;
  flock($handle, LOCK_UN);
  fclose($handle);
}

function respond(int $status, array $payload): void {
  release_lock();
  http_response_code($status);
  echo json_encode(
    $payload,
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE
  );
  exit;
}

register_shutdown_function(static function (): void {
  release_lock();
});

// 账号文件是「整文件读—改—写」：写入时的原子 rename 只保护读者，两个进程同时
// 注册会各自读到旧内容再写回，后写的那次把先写的账号整个盖掉（实测 24 个并发注册
// 只留下 14 个，被盖掉的账号永久登录不上）。所以改动之前必须先拿独占锁，并在锁内
// 重新读一遍。锁句柄走 $GLOBALS['atoLockHandle']，respond() 和 shutdown 回调都会释放。
function lock_store(string $file, string $error): void {
  $handle = fopen($file . '.lock', 'c');
  if (!$handle || !flock($handle, LOCK_EX)) {
    if ($handle) fclose($handle);
    respond(500, ['ok' => false, 'error' => $error]);
  }
  $GLOBALS['atoLockHandle'] = $handle;
}

// 超过 post_max_size 的请求体会被 PHP 在脚本运行前丢掉，之后读 php://input 只会
// 得到空串，再往下走就会误报成「正文不是 JSON」甚至 AUTH_REQUIRED。先按
// CONTENT_LENGTH 判一次，明确回 413。（PHP 那段 request-startup 警告脚本管不到，
// 生产 ini 里 display_errors=Off 时本来就不会输出。）
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBytes) {
  respond(413, [
    'ok' => false,
    'code' => 'PAYLOAD_TOO_LARGE',
    'error' => 'Save payload is too large.',
  ]);
}

function default_campaign(): array {
  return [
    'version' => 1,
    'updatedAt' => null,
    'sections' => [
      'dashboard' => null,
      'map' => null,
      'record' => null,
      'technology' => null,
      'heroes' => null,
      'aibp' => null,
      'story' => null,
    ],
    'sectionRevisions' => [
      'dashboard' => 0,
      'map' => 0,
      'record' => 0,
      'technology' => 0,
      'heroes' => 0,
      'aibp' => 0,
      'story' => 0,
    ],
  ];
}

function read_json_file(string $file, array $fallback): array {
  if (!is_file($file)) return $fallback;
  $raw = file_get_contents($file);
  $value = json_decode((string) $raw, true);
  if (!is_array($value)) respond(500, ['ok' => false, 'error' => 'Stored JSON is damaged.']);
  return $value;
}

function write_json_file(string $file, array $value): void {
  $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  if ($json === false) respond(500, ['ok' => false, 'error' => 'Could not encode JSON.']);

  $tempFile = $file . '.tmp';
  $handle = fopen($tempFile, 'c');
  if (!$handle) respond(500, ['ok' => false, 'error' => 'Could not open a temp file.']);
  if (!flock($handle, LOCK_EX)) {
    fclose($handle);
    respond(500, ['ok' => false, 'error' => 'Could not lock a temp file.']);
  }
  ftruncate($handle, 0);
  rewind($handle);
  $written = fwrite($handle, $json);
  fflush($handle);
  flock($handle, LOCK_UN);
  fclose($handle);

  // 同目录内的 rename() 是原子替换：读者拿到的要么是上一份完整内容，要么是新写的
  // 完整内容。Windows 上 rename() 覆盖已存在的文件同样成功（本机 PHP 8.4 实测），
  // 只有目标文件正好被别人打开（共享冲突）时才会失败。那种失败绝不能退回 copy()：
  // copy() 会原地截断并重写正在使用中的存档，并发读者可能读到半个文件，磁盘写满时
  // 连上一份存档也一起毁掉。写不进去就明确报错，让调用方重试。
  if ($written === false || $written < strlen($json) || !@rename($tempFile, $file)) {
    @unlink($tempFile);
    respond(500, ['ok' => false, 'error' => 'Could not write JSON.']);
  }
}

function normalize_username(string $username): string {
  return strtolower(trim($username));
}

function public_user(array $user): array {
  return [
    'id' => $user['id'],
    'username' => $user['username'],
    'createdAt' => $user['createdAt'] ?? null,
  ];
}

function read_users(string $usersFile): array {
  $store = read_json_file($usersFile, ['version' => 1, 'users' => []]);
  $store['users'] = is_array($store['users'] ?? null) ? $store['users'] : [];
  return $store;
}

function user_campaign_file(string $dataDir, string $userId): string {
  return $dataDir . DIRECTORY_SEPARATOR . 'ato-campaign-' . $userId . '.json';
}

function read_second_screens(string $file): array {
  $store = read_json_file($file, ['version' => 1, 'screens' => []]);
  $store['screens'] = is_array($store['screens'] ?? null) ? $store['screens'] : [];
  return $store;
}

function application_base_path(): string {
  $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? '/api/campaign-state.php'));
  $base = rtrim(str_replace('\\', '/', dirname(dirname($scriptName))), '/.');
  $forwardedPrefix = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PREFIX'] ?? ''))[0]);
  if ($forwardedPrefix !== '') {
    $prefix = '/' . trim($forwardedPrefix, '/');
    if ($base === '' || !str_starts_with($base . '/', $prefix . '/')) $base = $prefix . $base;
  }
  return ($base === '' ? '' : $base) . '/';
}

function second_screen_path(): string {
  return application_base_path() . 'ss/';
}

function request_is_https(): bool {
  $forwardedProto = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0]));
  return $forwardedProto === 'https' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
}

function second_screen_urls(string $token): array {
  $scheme = request_is_https() ? 'https' : 'http';
  $forwardedHost = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? ''))[0]);
  $hostHeader = $forwardedHost !== '' ? $forwardedHost : (string) ($_SERVER['HTTP_HOST'] ?? '127.0.0.1:8793');
  $port = parse_url($scheme . '://' . $hostHeader, PHP_URL_PORT);
  $portSuffix = $port ? ':' . $port : '';
  $hosts = [];
  $headerHost = (string) (parse_url($scheme . '://' . $hostHeader, PHP_URL_HOST) ?: '');
  if ($headerHost !== '') $hosts[] = $headerHost;
  $hostname = gethostname();
  $addresses = $hostname ? gethostbynamel($hostname) : false;
  foreach (is_array($addresses) ? $addresses : [] as $address) {
    if (filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) && !str_starts_with($address, '127.')) {
      $hosts[] = $address;
    }
  }
  // On Windows, gethostname() can be returned in the system code page (for
  // example GBK) rather than UTF-8. Passing that value to json_encode() makes
  // it return false and leaves a successful HTTP 200 response with an empty
  // body. Only include hostnames that are safe ASCII DNS labels.
  if (is_string($hostname) && preg_match('/^[A-Za-z0-9][A-Za-z0-9.-]*$/', $hostname) === 1) {
    $hosts[] = $hostname . '.local';
  }
  $hosts = array_values(array_unique($hosts));
  // 网址里必须带上开启第二屏时生成的随机 token：第二屏返回的是账号的存档内容，
  // 匿名访问光凭这个地址不该拿得到。
  $path = second_screen_path() . ($token !== '' ? '?token=' . rawurlencode($token) : '');
  return array_map(static function (string $host) use ($scheme, $portSuffix, $path): string {
    return $scheme . '://' . $host . $portSuffix . $path;
  }, $hosts);
}

// 第二屏页面（ss/app.js）从自己的网址里取出 token，之后每次请求都附在 query 上；
// 地图模式渲染在 ss 内嵌的 map/index.html 里，那份前端不归本次改动管、只会请求裸
// 地址，所以第二屏页面同时把 token 写进同源 Cookie 作为兜底。两处都按 hash_equals 比对。
function second_screen_request_token(): string {
  $token = $_GET['token'] ?? null;
  if (!is_string($token) || trim($token) === '') $token = $_COOKIE['ato_second_screen_token'] ?? '';
  return is_string($token) ? trim($token) : '';
}

function second_screen_token_matches(string $expected): bool {
  if ($expected === '') return false;
  $provided = second_screen_request_token();
  return $provided !== '' && hash_equals($expected, $provided);
}

function public_second_screen_payload(array $campaign, array $screenEntry = []): array {
  $dashboard = is_array($campaign['sections']['dashboard'] ?? null) ? $campaign['sections']['dashboard'] : [];
  $profiles = is_array($dashboard['profiles'] ?? null) ? $dashboard['profiles'] : [];
  $profileId = (string) ($dashboard['activeProfileId'] ?? '');
  $profile = is_array($profiles[$profileId] ?? null) ? $profiles[$profileId] : [];
  if (!$profile && $profiles) {
    $profileId = (string) array_key_first($profiles);
    $profile = is_array($profiles[$profileId] ?? null) ? $profiles[$profileId] : [];
  }
  $cycleId = (string) ($profile['activeCycleId'] ?? 'c2');
  $dashboardCycle = is_array($profile['cycles'][$cycleId]['state'] ?? null) ? $profile['cycles'][$cycleId]['state'] : [];

  $mapSection = $campaign['sections']['map'] ?? null;
  if (is_array($mapSection['users'] ?? null)) {
    $mapState = $mapSection['users'][$profileId] ?? null;
  } else {
    $mapState = $mapSection;
  }
  $mapState = is_array($mapState) ? $mapState : [];
  $mapCycle = is_array($mapState['cycles'][$cycleId] ?? null) ? $mapState['cycles'][$cycleId] : [];

  $aibpSection = $campaign['sections']['aibp'] ?? null;
  if (is_array($aibpSection['users'] ?? null)) {
    $aibpState = $aibpSection['users'][$profileId] ?? null;
  } else {
    $aibpState = $aibpSection;
  }
  $aibpState = is_array($aibpState) ? $aibpState : [];

  $storyState = $campaign['sections']['story'] ?? null;
  if (is_array($storyState['users'] ?? null)) {
    $storyState = $storyState['users'][$profileId] ?? null;
  }
  $storyState = is_array($storyState) ? $storyState : [];

  $legacyScale = max(60, min(200, (int) ($screenEntry['displayScale'] ?? 100)));
  $savedScales = is_array($screenEntry['displayScales'] ?? null) ? $screenEntry['displayScales'] : [];
  $displayScales = [
    'map' => max(60, min(200, (int) ($savedScales['map'] ?? $legacyScale))),
    'battleBoard' => max(60, min(200, (int) ($savedScales['battleBoard'] ?? 100))),
  ];
  $battleRotation = (int) ($screenEntry['battleRotation'] ?? 0);
  if (!in_array($battleRotation, [0, 90, 180, 270], true)) $battleRotation = 0;
  $battleSwapped = !empty($screenEntry['battleSwapped']);
  $battleBoardVisible = !array_key_exists('battleBoardVisible', $screenEntry) || !empty($screenEntry['battleBoardVisible']);

  return [
    'profileName' => (string) ($profile['name'] ?? '阿尔戈号'),
    'cycleId' => $cycleId,
    'day' => $dashboardCycle['day'] ?? 0,
    'map' => $mapCycle,
    'mapDisplay' => [
      'showBack' => (bool) ($mapState['showBack'] ?? false),
      'onlyExplored' => (bool) ($mapState['onlyExplored'] ?? false),
      'hideUnknown' => (bool) ($mapState['hideUnknown'] ?? true),
      'showAdjacency' => (bool) ($mapState['showAdjacency'] ?? false),
      'query' => (string) ($mapState['query'] ?? ''),
    ],
    'aibp' => $aibpState,
    'story' => $storyState,
    'displayMode' => (string) ($screenEntry['displayMode'] ?? 'map'),
    'mapRevision' => (int) ($campaign['sectionRevisions']['map'] ?? 0),
    'aibpRevision' => (int) ($campaign['sectionRevisions']['aibp'] ?? 0),
    'storyRevision' => (int) ($campaign['sectionRevisions']['story'] ?? 0),
    'dashboardRevision' => (int) ($campaign['sectionRevisions']['dashboard'] ?? 0),
    'updatedAt' => $campaign['updatedAt'] ?? null,
    'displayScales' => $displayScales,
    'battleRotation' => $battleRotation,
    'battleSwapped' => $battleSwapped,
    'battleBoardVisible' => $battleBoardVisible,
  ];
}

function current_user(array $users): ?array {
  $userId = $_SESSION['ato_user_id'] ?? null;
  if (!is_string($userId) || !isset($users[$userId])) return null;
  return $users[$userId];
}

function read_campaign(string $saveFile): array {
  $campaign = read_json_file($saveFile, default_campaign());
  $campaign += default_campaign();
  $campaign['sections'] = is_array($campaign['sections'] ?? null) ? $campaign['sections'] : [];
  $campaign['sections'] += default_campaign()['sections'];
  $campaign['sectionRevisions'] = is_array($campaign['sectionRevisions'] ?? null) ? $campaign['sectionRevisions'] : [];
  $campaign['sectionRevisions'] += default_campaign()['sectionRevisions'];
  return $campaign;
}

function write_campaign(string $saveFile, array $campaign): void {
  $campaign['version'] = 1;
  $campaign['updatedAt'] = gmdate('c');
  write_json_file($saveFile, $campaign);
}

function campaign_game_day(array $campaign): array {
  $dashboard = is_array($campaign['sections']['dashboard'] ?? null)
    ? $campaign['sections']['dashboard']
    : [];
  $profiles = is_array($dashboard['profiles'] ?? null) ? $dashboard['profiles'] : [];
  $profileId = (string) ($dashboard['activeProfileId'] ?? 'default');
  $profile = is_array($profiles[$profileId] ?? null) ? $profiles[$profileId] : [];
  if (!$profile && $profiles) {
    $profileId = (string) array_key_first($profiles);
    $profile = is_array($profiles[$profileId] ?? null) ? $profiles[$profileId] : [];
  }

  $cycleId = (string) ($profile['activeCycleId'] ?? 'unknown');
  $cycle = is_array($profile['cycles'][$cycleId] ?? null) ? $profile['cycles'][$cycleId] : [];
  $state = is_array($cycle['state'] ?? null) ? $cycle['state'] : [];
  $hasDay = array_key_exists('day', $state) && is_scalar($state['day']);
  $day = $hasDay ? (string) $state['day'] : 'unknown';
  $parts = [
    $profileId !== '' ? $profileId : 'default',
    $cycleId !== '' ? $cycleId : 'unknown',
    $day !== '' ? $day : 'unknown',
  ];

  return [
    'identity' => (string) json_encode($parts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    'parts' => $parts,
    'valid' => (bool) $profile && (bool) $cycle && $hasDay,
  ];
}

function campaign_backup_component(string $value): string {
  $component = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '-', $value), '-');
  if ($component === '') $component = 'value';
  // 截断阈值是 70 个字符：判断要不要加哈希必须用同一个阈值，否则 71–80 个字符的
  // profileId/cycleId 会被截到 70 个字符又不带哈希，两个不同的值共用同一个备份目录，
  // "恢复前一天"就会读到别人那天的存档。
  $needsHash = $component !== $value || strlen($component) > 70;
  if (strlen($component) > 70) $component = substr($component, 0, 70);
  if ($needsHash) $component .= '-' . substr(hash('sha256', $value), 0, 8);
  return $component;
}

function campaign_backup_root(string $saveFile): string {
  $baseName = basename($saveFile);
  $userId = preg_replace('/^ato-campaign-|\.json$/i', '', $baseName) ?? $baseName;
  return dirname($saveFile)
    . DIRECTORY_SEPARATOR . 'backups'
    . DIRECTORY_SEPARATOR . campaign_backup_component($userId);
}

function ensure_campaign_backup_dir(string $dir): void {
  if (!is_dir($dir) && !mkdir($dir, 0770, true)) {
    respond(500, ['ok' => false, 'error' => 'Could not create a campaign backup directory.']);
  }
}

function campaign_day_backup_dir(string $saveFile, array $gameDay, string $kind): string {
  [$profileId, $cycleId, $day] = $gameDay['parts'];
  return campaign_backup_root($saveFile)
    . DIRECTORY_SEPARATOR . $kind
    . DIRECTORY_SEPARATOR . campaign_backup_component($profileId)
    . DIRECTORY_SEPARATOR . campaign_backup_component($cycleId)
    . DIRECTORY_SEPARATOR . 'day-' . campaign_backup_component($day);
}

function campaign_daily_backup_file(string $saveFile, array $gameDay, string $archiveId): string {
  return campaign_day_backup_dir($saveFile, $gameDay, 'daily')
    . DIRECTORY_SEPARATOR . campaign_backup_component($archiveId) . '.json';
}

function campaign_recent_backup_file(string $saveFile, array $gameDay, int $index): string {
  return campaign_day_backup_dir($saveFile, $gameDay, 'recent')
    . DIRECTORY_SEPARATOR . 'backup-' . str_pad((string) $index, 2, '0', STR_PAD_LEFT) . '.json';
}

function migrate_legacy_campaign_backups(string $saveFile, int $backupCount): void {
  $dir = dirname($saveFile);
  $baseName = basename((string) (preg_replace('/\.json$/i', '', $saveFile) ?? $saveFile));
  $legacyFiles = glob($dir . DIRECTORY_SEPARATOR . $baseName . '.daily.*.json') ?: [];
  foreach ($legacyFiles as $legacyFile) {
    $fileName = basename($legacyFile);
    $prefix = $baseName . '.daily.';
    if (!str_starts_with($fileName, $prefix) || !str_ends_with($fileName, '.json')) continue;
    $body = substr($fileName, strlen($prefix), -5);
    $parts = explode('.', $body);
    if (count($parts) !== 4 || !str_starts_with($parts[2], 'day-')) continue;
    $gameDay = [
      'parts' => [$parts[0], $parts[1], substr($parts[2], 4)],
    ];
    $destination = campaign_daily_backup_file($saveFile, $gameDay, $parts[3]);
    ensure_campaign_backup_dir(dirname($destination));
    if (is_file($destination)) continue;
    if (!rename($legacyFile, $destination)) {
      respond(500, ['ok' => false, 'error' => 'Could not move a legacy campaign backup.']);
    }
  }

  $legacyMarker = $saveFile . '.backup-current-day.json';
  $markerFile = campaign_backup_root($saveFile) . DIRECTORY_SEPARATOR . 'backup-current-day.json';
  $legacyMarkerPayload = read_campaign_backup_marker($legacyMarker);
  $legacyIdentityParts = is_string($legacyMarkerPayload['identity'])
    ? json_decode($legacyMarkerPayload['identity'], true)
    : null;
  if (is_array($legacyIdentityParts) && count($legacyIdentityParts) === 3) {
    $gameDay = ['parts' => array_map('strval', $legacyIdentityParts)];
    for ($index = 1; $index <= $backupCount; $index += 1) {
      $legacyBackup = $saveFile . '.backup.' . $index;
      if (!is_file($legacyBackup)) continue;
      $destination = campaign_recent_backup_file($saveFile, $gameDay, $index);
      ensure_campaign_backup_dir(dirname($destination));
      if (is_file($destination)) continue;
      if (!rename($legacyBackup, $destination)) {
        respond(500, ['ok' => false, 'error' => 'Could not move a legacy campaign backup.']);
      }
    }
  }
  if (is_file($legacyMarker) && !is_file($markerFile)) {
    ensure_campaign_backup_dir(dirname($markerFile));
    if (!rename($legacyMarker, $markerFile)) {
      respond(500, ['ok' => false, 'error' => 'Could not move a legacy campaign backup marker.']);
    }
  }
}

function new_campaign_archive_id(): string {
  return gmdate('Ymd\THis\Z') . '-' . bin2hex(random_bytes(4));
}

function read_campaign_backup_marker(string $markerFile): array {
  if (!is_file($markerFile)) return ['identity' => null, 'archiveId' => null];
  $marker = json_decode((string) file_get_contents($markerFile), true);
  if (!is_array($marker)) return ['identity' => null, 'archiveId' => null];
  return [
    'identity' => is_string($marker['identity'] ?? null) ? $marker['identity'] : null,
    'archiveId' => is_string($marker['archiveId'] ?? null) ? $marker['archiveId'] : null,
  ];
}

function clear_campaign_recent_backups(string $saveFile, int $backupCount): void {
  for ($index = 1; $index <= $backupCount; $index += 1) {
    $backupFile = $saveFile . '.backup.' . $index;
    if (is_file($backupFile) && !unlink($backupFile)) {
      respond(500, ['ok' => false, 'error' => 'Could not clear an old campaign backup.']);
    }
  }
  clear_campaign_backup_tree(campaign_backup_root($saveFile) . DIRECTORY_SEPARATOR . 'recent');
}

function clear_campaign_backup_tree(string $dir): void {
  if (!is_dir($dir)) return;
  $iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
  );
  foreach ($iterator as $item) {
    $path = $item->getPathname();
    if ($item->isDir()) {
      if (!rmdir($path)) respond(500, ['ok' => false, 'error' => 'Could not clear a campaign backup directory.']);
    } elseif (!unlink($path)) {
      respond(500, ['ok' => false, 'error' => 'Could not clear a campaign backup.']);
    }
  }
  if (!rmdir($dir)) respond(500, ['ok' => false, 'error' => 'Could not clear a campaign backup directory.']);
}

function copy_campaign_backup(string $source, string $destination): void {
  ensure_campaign_backup_dir(dirname($destination));
  if (!copy($source, $destination)) {
    respond(500, ['ok' => false, 'error' => 'Could not create a campaign backup.']);
  }
}

function prepare_campaign_backups(
  string $saveFile,
  array $currentCampaign,
  array $nextCampaign,
  int $backupCount
): void {
  if (!is_file($saveFile)) return;

  migrate_legacy_campaign_backups($saveFile, $backupCount);

  $currentDay = campaign_game_day($currentCampaign);
  $nextDay = campaign_game_day($nextCampaign);
  $markerFile = campaign_backup_root($saveFile) . DIRECTORY_SEPARATOR . 'backup-current-day.json';
  $marker = read_campaign_backup_marker($markerFile);
  if ($marker['identity'] !== $currentDay['identity']) {
    clear_campaign_recent_backups($saveFile, $backupCount);
  }

  $archiveId = $marker['identity'] === $currentDay['identity'] ? $marker['archiveId'] : null;
  if ($currentDay['valid']) {
    if ($archiveId === null || $archiveId === '') $archiveId = new_campaign_archive_id();
    copy_campaign_backup($saveFile, campaign_daily_backup_file($saveFile, $currentDay, $archiveId));
  }

  if ($currentDay['identity'] === $nextDay['identity']) {
    for ($index = $backupCount; $index >= 2; $index -= 1) {
      $previous = campaign_recent_backup_file($saveFile, $currentDay, $index - 1);
      $next = campaign_recent_backup_file($saveFile, $currentDay, $index);
      if (is_file($previous)) {
        copy_campaign_backup($previous, $next);
      } elseif (is_file($next) && !unlink($next)) {
        respond(500, ['ok' => false, 'error' => 'Could not rotate campaign backups.']);
      }
    }
    copy_campaign_backup($saveFile, campaign_recent_backup_file($saveFile, $currentDay, 1));
  } else {
    clear_campaign_recent_backups($saveFile, $backupCount);
  }

  ensure_campaign_backup_dir(dirname($markerFile));
  write_json_file($markerFile, [
    'identity' => $nextDay['identity'],
    'archiveId' => $currentDay['identity'] === $nextDay['identity'] ? $archiveId : null,
  ]);
}

function payload_user_id(array $payload): ?string {
  $userId = $payload['userId'] ?? null;
  if (!is_string($userId)) return null;
  $userId = trim($userId);
  if ($userId === '' || strlen($userId) > 128) return null;
  return $userId;
}

// 保存请求可以声明客户端认为自己正在保存的登录账号。旧页面在账号切换后仍持有上一个
// 账号的内存状态，只凭 Cookie 会把 A 的存档写进 B，所以写入前先核对一次。
// expectedRevision 同样：有字段就核对，缺字段的旧客户端仍按原行为处理。
// 空值按「没给」处理：仓库里的页面在首次读到档案之前会先发 expectedAccountId: ""，
// 把它当成"另一个账号"会硬回 409 并让页面的保存守卫卡死。
function payload_expected_account_id(array $payload): ?string {
  if (!array_key_exists('expectedAccountId', $payload)) return null;
  $accountId = $payload['expectedAccountId'];
  if (!is_string($accountId)) return null;
  $accountId = trim($accountId);
  return $accountId === '' ? null : $accountId;
}

function section_has_user_buckets($section): bool {
  return is_array($section) && (
    array_key_exists('users', $section)
    || array_key_exists('accounts', $section)
  );
}

function update_campaign_section(array $campaign, string $section, $state, ?string $userId): array {
  if ($userId === null || $section === 'dashboard') {
    $campaign['sections'][$section] = $state;
    return $campaign;
  }

  $current = $campaign['sections'][$section] ?? null;
  $next = section_has_user_buckets($current) ? $current : ['users' => []];
  if (!is_array($next)) $next = ['users' => []];
  if (!is_array($next['users'] ?? null)) $next['users'] = [];
  if (is_array($next['accounts'] ?? null)) {
    $next['users'] = array_replace($next['accounts'], $next['users']);
  }
  if (!section_has_user_buckets($current) && $current !== null) {
    $next['users'][$userId] = $current;
  }
  $next['users'][$userId] = $state;
  unset($next['accounts']);
  $campaign['sections'][$section] = $next;
  return $campaign;
}

if (!is_dir($dataDir) && !mkdir($dataDir, 0770, true)) {
  respond(500, ['ok' => false, 'error' => 'Could not create the data directory.']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? null;
$usersStore = read_users($usersFile);
$users = $usersStore['users'];

if ($action === 'me') {
  $user = current_user($users);
  respond(200, ['ok' => true, 'authenticated' => $user !== null, 'user' => $user ? public_user($user) : null]);
}

if ($action === 'logout') {
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool) $params['secure'], (bool) $params['httponly']);
  }
  session_destroy();
  respond(200, ['ok' => true]);
}

if ($action === 'login' || $action === 'register') {
  if ($method !== 'POST') respond(405, ['ok' => false, 'error' => 'This action requires POST.']);
  $raw = file_get_contents('php://input');
  $payload = json_decode((string) $raw, true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);

  $username = normalize_username((string) ($payload['username'] ?? ''));
  $password = (string) ($payload['password'] ?? '');
  if (!preg_match('/^[a-z0-9][a-z0-9_-]{2,31}$/', $username)) {
    respond(400, ['ok' => false, 'error' => 'Account must be 3-32 characters: letters, numbers, underscore, or hyphen.']);
  }
  if (strlen($password) < 4) {
    respond(400, ['ok' => false, 'error' => 'Password must be at least 4 characters.']);
  }

  $userId = preg_replace('/[^a-z0-9_-]/', '', $username);
  // 加锁之后再重新读一遍账号文件：进到这里之前那次读（$users）可能已经被另一个
  // 进程改过，用它写回就会丢账号。密码哈希在锁外先算好，别把 bcrypt 的时间也算进锁里。
  $newPasswordHash = $action === 'register' ? password_hash($password, PASSWORD_DEFAULT) : '';
  lock_store($usersFile, 'Could not lock the account store.');
  $usersStore = read_users($usersFile);
  $users = $usersStore['users'];
  if ($action === 'register') {
    if (isset($users[$userId])) respond(409, ['ok' => false, 'error' => 'Account already exists.']);
    $users[$userId] = [
      'id' => $userId,
      'username' => $username,
      'passwordHash' => $newPasswordHash,
      'createdAt' => gmdate('c'),
    ];
    $usersStore['version'] = 1;
    $usersStore['users'] = $users;
    write_json_file($usersFile, $usersStore);

    $userSaveFile = user_campaign_file($dataDir, $userId);
    write_campaign($userSaveFile, default_campaign());
  } else {
    if (!isset($users[$userId])) {
      respond(401, ['ok' => false, 'error' => 'Account or password is incorrect.']);
    }
    $storedPassword = (string) ($users[$userId]['password'] ?? '');
    $storedHash = (string) ($users[$userId]['passwordHash'] ?? '');
    $passwordMatches = $storedHash !== ''
      ? password_verify($password, $storedHash)
      : ($storedPassword !== '' && hash_equals($storedPassword, $password));
    if (!$passwordMatches) respond(401, ['ok' => false, 'error' => 'Account or password is incorrect.']);
    if ($storedHash === '') {
      $users[$userId]['passwordHash'] = password_hash($password, PASSWORD_DEFAULT);
      unset($users[$userId]['password']);
      $usersStore['users'] = $users;
      write_json_file($usersFile, $usersStore);
    }
  }

  session_regenerate_id(true);
  $_SESSION['ato_user_id'] = $userId;
  respond(200, ['ok' => true, 'user' => public_user($users[$userId])]);
}

if ($action === 'second-screen' && $method === 'GET') {
  $screens = read_second_screens($secondScreensFile)['screens'];
  $entries = array_filter($screens, static fn($entry): bool => is_array($entry) && !empty($entry['userId']));
  uasort($entries, static fn(array $left, array $right): int => strcmp((string) ($right['enabledAt'] ?? ''), (string) ($left['enabledAt'] ?? '')));
  $screenToken = $entries ? (string) array_key_first($entries) : '';
  $entry = $entries ? reset($entries) : null;
  $userId = (string) ($entry['userId'] ?? '');
  if (!$entry || $userId === '') {
    respond(404, ['ok' => false, 'code' => 'SCREEN_NOT_FOUND', 'error' => 'Second screen is unavailable.']);
  }
  // 这个分支在登录校验之前，返回的却是账号存档里的内容（角色名、天数、地图状态、
  // 地图筛选、AIBP、故事）。所以它不能只看"有没有开启第二屏"：必须出示开启第二屏
  // 时生成并存进 ato-second-screens.json 的那个随机 token。以前这条分支拿到的
  // token 只是存着、从没被核对过，匿名直连就能把整份存档读走。
  // 例外只有一种：同一个浏览器里已经登录、且开启第二屏的正是本人。主控台从局域网
  // 地址打开时地址栏显示的是不带 token 的 ./ss/ 短地址（见 index.html 的
  // currentShortUrl 分支），同一浏览器里打开还得能用；匿名请求没有会话，仍然 403。
  $sessionUser = current_user($users);
  if (!second_screen_token_matches($screenToken)
      && !($sessionUser !== null && (string) $sessionUser['id'] === $userId)) {
    respond(403, [
      'ok' => false,
      'code' => 'SCREEN_FORBIDDEN',
      'error' => 'Second screen link is missing or no longer valid. Please re-open the URL shown in the dashboard.',
    ]);
  }
  $campaign = read_campaign(user_campaign_file($dataDir, $userId));
  respond(200, ['ok' => true, 'screen' => public_second_screen_payload($campaign, $entry)]);
}

$user = current_user($users);
if (!$user) {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => 'Please log in first.']);
}

if ($action === 'second-screen-status') {
  if ($method !== 'GET' && $method !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
  }
  $lockHandle = fopen($secondScreensFile . '.lock', 'c');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX)) {
    if ($lockHandle) fclose($lockHandle);
    respond(500, ['ok' => false, 'error' => 'Could not lock second-screen settings.']);
  }
  $GLOBALS['atoLockHandle'] = $lockHandle;
  $store = read_second_screens($secondScreensFile);
  $userToken = '';
  $displayScales = ['map' => 100, 'battleBoard' => 100];
  $battleRotation = 0;
  $battleSwapped = false;
  $battleBoardVisible = true;
  $displayMode = 'map';
  foreach ($store['screens'] as $token => $entry) {
    if (($entry['userId'] ?? null) === $user['id']) {
      $userToken = (string) $token;
      $legacyScale = max(60, min(200, (int) ($entry['displayScale'] ?? 100)));
      $savedScales = is_array($entry['displayScales'] ?? null) ? $entry['displayScales'] : [];
      $displayScales = [
        'map' => max(60, min(200, (int) ($savedScales['map'] ?? $legacyScale))),
        'battleBoard' => max(60, min(200, (int) ($savedScales['battleBoard'] ?? 100))),
      ];
      $battleRotation = (int) ($entry['battleRotation'] ?? 0);
      if (!in_array($battleRotation, [0, 90, 180, 270], true)) $battleRotation = 0;
      $battleSwapped = !empty($entry['battleSwapped']);
      $battleBoardVisible = !array_key_exists('battleBoardVisible', $entry) || !empty($entry['battleBoardVisible']);
      $requestedMode = (string) ($entry['displayMode'] ?? 'map');
      $displayMode = in_array($requestedMode, ['aibp', 'story', 'blank'], true) ? $requestedMode : 'map';
      break;
    }
  }
  if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode((string) $raw, true);
    if (!is_array($payload)) {
      respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);
    }
    $enabled = !empty($payload['enabled']);
    if (is_array($payload['displayScales'] ?? null)) {
      foreach (['map', 'battleBoard'] as $moduleId) {
        if (array_key_exists($moduleId, $payload['displayScales'])) {
          $displayScales[$moduleId] = max(60, min(200, (int) $payload['displayScales'][$moduleId]));
        }
      }
    } elseif (array_key_exists('displayScale', $payload)) {
      $displayScales['map'] = max(60, min(200, (int) $payload['displayScale']));
    }
    if (array_key_exists('battleRotation', $payload)) {
      $requestedRotation = (int) $payload['battleRotation'];
      if (in_array($requestedRotation, [0, 90, 180, 270], true)) {
        $battleRotation = $requestedRotation;
      }
    }
    if (array_key_exists('battleSwapped', $payload)) {
      $battleSwapped = (bool) $payload['battleSwapped'];
    }
    if (array_key_exists('battleBoardVisible', $payload)) {
      $battleBoardVisible = (bool) $payload['battleBoardVisible'];
    }
    if ($enabled) {
      foreach ($store['screens'] as $token => $entry) {
        if (($entry['userId'] ?? null) !== $user['id']) unset($store['screens'][$token]);
      }
    }
    if (!$enabled && $userToken !== '') {
      unset($store['screens'][$userToken]);
      $userToken = '';
    } elseif ($enabled && $userToken === '') {
      do {
        $userToken = bin2hex(random_bytes(24));
      } while (isset($store['screens'][$userToken]));
      $store['screens'][$userToken] = [
        'userId' => $user['id'],
        'enabledAt' => gmdate('c'),
        'displayMode' => 'map',
        'displayScales' => $displayScales,
        'battleRotation' => $battleRotation,
        'battleSwapped' => $battleSwapped,
        'battleBoardVisible' => $battleBoardVisible,
      ];
    } elseif ($enabled && $userToken !== '') {
      $store['screens'][$userToken]['displayScales'] = $displayScales;
      $store['screens'][$userToken]['battleRotation'] = $battleRotation;
      $store['screens'][$userToken]['battleSwapped'] = $battleSwapped;
      $store['screens'][$userToken]['battleBoardVisible'] = $battleBoardVisible;
      unset($store['screens'][$userToken]['displayScale']);
    }
    write_json_file($secondScreensFile, $store);
  }
  respond(200, [
    'ok' => true,
    'enabled' => $userToken !== '',
    'displayScales' => $displayScales,
    'battleRotation' => $battleRotation,
    'battleSwapped' => $battleSwapped,
    'battleBoardVisible' => $battleBoardVisible,
    'displayMode' => $displayMode,
    'urls' => $userToken !== '' ? second_screen_urls($userToken) : [],
  ]);
}

if ($action === 'second-screen-mode') {
  if ($method !== 'POST') respond(405, ['ok' => false, 'error' => 'This action requires POST.']);
  $raw = file_get_contents('php://input');
  $payload = json_decode((string) $raw, true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);
  $mode = strtolower(trim((string) ($payload['mode'] ?? '')));
  $mode = in_array($mode, ['aibp', 'story', 'blank'], true) ? $mode : 'map';

  $lockHandle = fopen($secondScreensFile . '.lock', 'c');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX)) {
    if ($lockHandle) fclose($lockHandle);
    respond(500, ['ok' => false, 'error' => 'Could not lock second-screen settings.']);
  }
  $GLOBALS['atoLockHandle'] = $lockHandle;
  $store = read_second_screens($secondScreensFile);
  $changed = false;
  // 存档里有没有属于当前账号的第二屏条目。以前没有匹配条目时照样回 200 并回报请求的
  // 模式，页面以为切成功了、第二屏却一直停在地图，排查时完全看不出问题，所以这里要
  // 单独记一笔，最后明确报错。
  $matched = false;
  foreach ($store['screens'] as $token => $entry) {
    if (($entry['userId'] ?? null) !== $user['id']) continue;
    $matched = true;
    if (($entry['displayMode'] ?? 'map') !== $mode) {
      $store['screens'][$token]['displayMode'] = $mode;
      $store['screens'][$token]['modeChangedAt'] = gmdate('c');
      unset($store['screens'][$token]['focusedModule'], $store['screens'][$token]['focusedAt']);
      $changed = true;
    }
    // The AIBP mode is the battle-board view. Keep the legacy board-visibility
    // flag from making the new AIBP checkbox show only the sidebar mirror.
    if ($mode === 'aibp' && ($entry['battleBoardVisible'] ?? true) !== true) {
      $store['screens'][$token]['battleBoardVisible'] = true;
      $changed = true;
    }
  }
  if ($changed) write_json_file($secondScreensFile, $store);
  if (!$matched) {
    respond(409, [
      'ok' => false,
      'code' => 'SCREEN_NOT_ENABLED',
      'error' => 'Second screen is not enabled for this account.',
    ]);
  }
  respond(200, ['ok' => true, 'displayMode' => $mode]);
}

$section = $_GET['section'] ?? null;
if ($section !== null && !in_array($section, $allowedSections, true)) {
  respond(400, ['ok' => false, 'error' => 'Unknown section.']);
}

$saveFile = user_campaign_file($dataDir, $user['id']);

if ($action === 'restore-previous-day') {
  if ($method !== 'POST') respond(405, ['ok' => false, 'error' => 'This action requires POST.']);
  $payload = json_decode((string) file_get_contents('php://input'), true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);
  if (payload_expected_account_id($payload) !== (string) $user['id']) {
    respond(409, ['ok' => false, 'code' => 'ACCOUNT_MISMATCH', 'error' => '登录账号已变更，请刷新后重试。']);
  }
  foreach (['profileId', 'cycleId', 'currentDay', 'day'] as $field) {
    if (!isset($payload[$field]) || !is_string($payload[$field]) || $payload[$field] === '' || strlen($payload[$field]) > 128) {
      respond(400, ['ok' => false, 'error' => '恢复日期无效。']);
    }
  }
  $lockHandle = fopen($saveFile . '.lock', 'c');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX)) {
    if ($lockHandle) fclose($lockHandle);
    respond(500, ['ok' => false, 'error' => 'Could not lock the save file.']);
  }
  $GLOBALS['atoLockHandle'] = $lockHandle;
  $campaign = read_campaign($saveFile);
  $currentDay = campaign_game_day($campaign);
  if (!$currentDay['valid']
      || $currentDay['parts'] !== [$payload['profileId'], $payload['cycleId'], $payload['currentDay']]
      || !isset($payload['expectedRevision'])
      || (int) $payload['expectedRevision'] !== (int) $campaign['sectionRevisions']['dashboard']) {
    respond(409, ['ok' => false, 'code' => 'SAVE_CONFLICT', 'error' => '当前存档已变更，请刷新后重试。']);
  }
  if ($payload['day'] === $payload['currentDay']) {
    respond(400, ['ok' => false, 'error' => '恢复日期必须是前一天。']);
  }
  migrate_legacy_campaign_backups($saveFile, $backupCount);
  $targetDay = ['parts' => [$payload['profileId'], $payload['cycleId'], $payload['day']]];
  $candidates = glob(campaign_day_backup_dir($saveFile, $targetDay, 'daily') . DIRECTORY_SEPARATOR . '*.json') ?: [];
  $restored = null;
  $latestRevision = -1;
  $latestModified = -1;
  foreach ($candidates as $file) {
    $candidate = json_decode((string) file_get_contents($file), true);
    if (!is_array($candidate) || !is_array($candidate['sections'] ?? null)) continue;
    $candidateDay = campaign_game_day($candidate);
    if (!$candidateDay['valid'] || $candidateDay['parts'] !== $targetDay['parts']) continue;
    // Revisions distinguish repeated visits even when archives share a timestamp.
    $revision = (int) ($candidate['sectionRevisions']['dashboard'] ?? 0);
    $modified = (int) filemtime($file);
    if ($restored === null || $revision > $latestRevision || ($revision === $latestRevision && $modified >= $latestModified)) {
      $restored = $candidate;
      $latestRevision = $revision;
      $latestModified = $modified;
    }
  }
  if ($restored === null) {
    respond(404, ['ok' => false, 'code' => 'BACKUP_NOT_FOUND', 'error' => '没有找到前一天（Day ' . $payload['day'] . '）的可用备份。']);
  }
  $restored['sections'] += default_campaign()['sections'];
  $restored['sectionRevisions'] = [];
  // Never roll revision counters back: stale pages must conflict with the restored save.
  foreach ($allowedSections as $name) {
    $restored['sectionRevisions'][$name] = (int) ($campaign['sectionRevisions'][$name] ?? 0) + 1;
  }
  prepare_campaign_backups($saveFile, $campaign, $restored, $backupCount);
  write_campaign($saveFile, $restored);
  $restored = read_campaign($saveFile);
  respond(200, ['ok' => true, 'campaign' => $restored, 'user' => public_user($user)]);
}

if ($method === 'GET') {
  $campaign = read_campaign($saveFile);
  if ($section !== null) {
    respond(200, [
      'ok' => true,
      'exists' => is_file($saveFile) && $campaign['sections'][$section] !== null,
      'section' => $section,
      'state' => $campaign['sections'][$section],
      'revision' => (int) ($campaign['sectionRevisions'][$section] ?? 0),
      'updatedAt' => $campaign['updatedAt'],
      'user' => public_user($user),
    ]);
  }
  respond(200, ['ok' => true, 'exists' => is_file($saveFile), 'campaign' => $campaign, 'user' => public_user($user)]);
}

if ($method === 'POST') {
  $raw = file_get_contents('php://input');
  if ($raw === false || strlen($raw) > $maxBytes) {
    respond(413, ['ok' => false, 'error' => 'Save payload is too large or could not be read.']);
  }
  $payload = json_decode($raw, true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);

  $payloadSection = $payload['section'] ?? $section;
  if (!is_string($payloadSection) || !in_array($payloadSection, $allowedSections, true)) {
    respond(400, ['ok' => false, 'error' => 'Unknown section.']);
  }
  if (!array_key_exists('state', $payload)) {
    respond(400, ['ok' => false, 'error' => 'Missing state.']);
  }

  $lockHandle = fopen($saveFile . '.lock', 'c');
  if (!$lockHandle) respond(500, ['ok' => false, 'error' => 'Could not open the save lock.']);
  if (!flock($lockHandle, LOCK_EX)) {
    fclose($lockHandle);
    respond(500, ['ok' => false, 'error' => 'Could not lock the save file.']);
  }
  $GLOBALS['atoLockHandle'] = $lockHandle;

  $campaign = read_campaign($saveFile);
  $expectedRevision = $payload['expectedRevision'] ?? null;
  $currentRevision = (int) ($campaign['sectionRevisions'][$payloadSection] ?? 0);
  $expectedAccountId = payload_expected_account_id($payload);
  if ($expectedAccountId !== null && $expectedAccountId !== (string) $user['id']) {
    // 客户端自己说这份状态属于另一个账号：当前会话已经换人，绝不能写入。
    respond(409, [
      'ok' => false,
      'code' => 'ACCOUNT_MISMATCH',
      'error' => 'This page was loaded for another account. Reload it before saving.',
      'section' => $payloadSection,
      'revision' => $currentRevision,
      'updatedAt' => $campaign['updatedAt'],
    ]);
  }
  if ($expectedRevision !== null && (int) $expectedRevision !== $currentRevision) {
    respond(409, [
      'ok' => false,
      'code' => 'SAVE_CONFLICT',
      'error' => 'This section was changed in another page.',
      'section' => $payloadSection,
      'revision' => $currentRevision,
      'updatedAt' => $campaign['updatedAt'],
    ]);
  }
  $currentCampaign = $campaign;
  $campaign = update_campaign_section($campaign, $payloadSection, $payload['state'], payload_user_id($payload));
  $campaign['sectionRevisions'][$payloadSection] = $currentRevision + 1;
  prepare_campaign_backups($saveFile, $currentCampaign, $campaign, $backupCount);
  write_campaign($saveFile, $campaign);
  respond(200, [
    'ok' => true,
    'section' => $payloadSection,
    'revision' => $campaign['sectionRevisions'][$payloadSection],
    'updatedAt' => $campaign['updatedAt'],
    'user' => public_user($user),
  ]);
}

respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
