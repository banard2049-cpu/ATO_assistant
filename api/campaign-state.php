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

$allowedSections = ['dashboard', 'map', 'record', 'technology'];
$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$usersFile = $dataDir . DIRECTORY_SEPARATOR . 'ato-users.json';
$maxBytes = 1024 * 1024 * 8;

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
    ],
    'sectionRevisions' => [
      'dashboard' => 0,
      'map' => 0,
      'record' => 0,
      'technology' => 0,
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

$user = current_user($users);
if (!$user) {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => 'Please log in first.']);
}

$section = $_GET['section'] ?? null;
if ($section !== null && !in_array($section, $allowedSections, true)) {
  respond(400, ['ok' => false, 'error' => 'Unknown section.']);
}

$saveFile = user_campaign_file($dataDir, $user['id']);
$backupFile = $saveFile . '.backup';

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
  $campaign = update_campaign_section($campaign, $payloadSection, $payload['state'], payload_user_id($payload));
  $campaign['sectionRevisions'][$payloadSection] = $currentRevision + 1;
  if (is_file($saveFile)) @copy($saveFile, $backupFile);
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
