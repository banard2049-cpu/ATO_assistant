<?php
declare(strict_types=1);

$cookieLifetime = 60 * 60 * 24 * 180;
ini_set('session.gc_maxlifetime', (string) $cookieLifetime);
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

$allowedSections = ['dashboard', 'map', 'record', 'technology', 'heroes', 'aibp'];
$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$usersFile = $dataDir . DIRECTORY_SEPARATOR . 'ato-users.json';
$secondScreensFile = $dataDir . DIRECTORY_SEPARATOR . 'ato-second-screens.json';
$maxBytes = 1024 * 1024 * 8;
$backupCount = 10;

function respond(int $status, array $payload): void {
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
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
    ],
    'sectionRevisions' => [
      'dashboard' => 0,
      'map' => 0,
      'record' => 0,
      'technology' => 0,
      'heroes' => 0,
      'aibp' => 0,
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

  if ($written === false || $written < strlen($json) || !rename($tempFile, $file)) {
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

function second_screen_urls(): array {
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
  if ($hostname) $hosts[] = $hostname . '.local';
  $hosts = array_values(array_unique($hosts));
  $path = second_screen_path();
  return array_map(static function (string $host) use ($scheme, $portSuffix, $path): string {
    return $scheme . '://' . $host . $portSuffix . $path;
  }, $hosts);
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
    'aibp' => $aibpState,
    'displayMode' => (string) ($screenEntry['displayMode'] ?? 'map'),
    'mapRevision' => (int) ($campaign['sectionRevisions']['map'] ?? 0),
    'aibpRevision' => (int) ($campaign['sectionRevisions']['aibp'] ?? 0),
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
  $needsHash = $component !== $value || strlen($component) > 80;
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
  if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
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

if (!is_dir($dataDir) && !mkdir($dataDir, 0775, true)) {
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
  if ($action === 'register') {
    if (isset($users[$userId])) respond(409, ['ok' => false, 'error' => 'Account already exists.']);
    $users[$userId] = [
      'id' => $userId,
      'username' => $username,
      'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
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
  $entry = $entries ? reset($entries) : null;
  $userId = (string) ($entry['userId'] ?? '');
  if (!$entry || $userId === '') {
    respond(404, ['ok' => false, 'code' => 'SCREEN_NOT_FOUND', 'error' => 'Second screen is unavailable.']);
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
  $store = read_second_screens($secondScreensFile);
  $userToken = '';
  $displayScales = ['map' => 100, 'battleBoard' => 100];
  $battleRotation = 0;
  $battleSwapped = false;
  $battleBoardVisible = true;
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
      break;
    }
  }
  if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode((string) $raw, true);
    if (!is_array($payload)) {
      flock($lockHandle, LOCK_UN);
      fclose($lockHandle);
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
  flock($lockHandle, LOCK_UN);
  fclose($lockHandle);
  respond(200, [
    'ok' => true,
    'enabled' => $userToken !== '',
    'displayScales' => $displayScales,
    'battleRotation' => $battleRotation,
    'battleSwapped' => $battleSwapped,
    'battleBoardVisible' => $battleBoardVisible,
    'urls' => $userToken !== '' ? second_screen_urls() : [],
  ]);
}

if ($action === 'second-screen-mode') {
  if ($method !== 'POST') respond(405, ['ok' => false, 'error' => 'This action requires POST.']);
  $raw = file_get_contents('php://input');
  $payload = json_decode((string) $raw, true);
  if (!is_array($payload)) respond(400, ['ok' => false, 'error' => 'Request body must be JSON.']);
  $mode = strtolower(trim((string) ($payload['mode'] ?? '')));
  $mode = $mode === 'aibp' ? 'aibp' : 'map';

  $lockHandle = fopen($secondScreensFile . '.lock', 'c');
  if (!$lockHandle || !flock($lockHandle, LOCK_EX)) {
    if ($lockHandle) fclose($lockHandle);
    respond(500, ['ok' => false, 'error' => 'Could not lock second-screen settings.']);
  }
  $store = read_second_screens($secondScreensFile);
  $changed = false;
  foreach ($store['screens'] as $token => $entry) {
    if (($entry['userId'] ?? null) !== $user['id']) continue;
    if (($entry['displayMode'] ?? 'map') !== $mode) {
      $store['screens'][$token]['displayMode'] = $mode;
      $store['screens'][$token]['modeChangedAt'] = gmdate('c');
      unset($store['screens'][$token]['focusedModule'], $store['screens'][$token]['focusedAt']);
      $changed = true;
    }
  }
  if ($changed) write_json_file($secondScreensFile, $store);
  flock($lockHandle, LOCK_UN);
  fclose($lockHandle);
  respond(200, ['ok' => true, 'displayMode' => $mode]);
}

$section = $_GET['section'] ?? null;
if ($section !== null && !in_array($section, $allowedSections, true)) {
  respond(400, ['ok' => false, 'error' => 'Unknown section.']);
}

$saveFile = user_campaign_file($dataDir, $user['id']);

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

  $campaign = read_campaign($saveFile);
  $expectedRevision = $payload['expectedRevision'] ?? null;
  $currentRevision = (int) ($campaign['sectionRevisions'][$payloadSection] ?? 0);
  if ($expectedRevision !== null && (int) $expectedRevision !== $currentRevision) {
    flock($lockHandle, LOCK_UN);
    fclose($lockHandle);
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
  flock($lockHandle, LOCK_UN);
  fclose($lockHandle);
  respond(200, [
    'ok' => true,
    'section' => $payloadSection,
    'revision' => $campaign['sectionRevisions'][$payloadSection],
    'updatedAt' => $campaign['updatedAt'],
    'user' => public_user($user),
  ]);
}

respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
