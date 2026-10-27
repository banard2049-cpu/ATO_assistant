<?php
declare(strict_types=1);

require_once __DIR__ . '/backup-archive.php';
ini_set('display_errors', '0');
ini_set('log_errors', '1');
$reserve = str_repeat(' ', 65536);
$workingDirectory = null;
$finished = false;
register_shutdown_function(static function () use (&$reserve, &$workingDirectory, &$finished): void {
  $reserve = null;
  if (is_string($workingDirectory)) backup_archive_remove($workingDirectory);
  if ($finished) return;
  $error = error_get_last();
  if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
    http_response_code(503); header('Content-Type: application/json; charset=utf-8');
    echo '{"ok":false,"code":"BACKUP_RESOURCE_LIMIT","error":"处理备份所需资源超过程序限制，请释放空间或提高服务内存限制后重试。"}';
  }
});

function backup_endpoint_json(int $status, array $body): void {
  global $finished;
  $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
  $finished = true; http_response_code($status);
  header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store'); echo $json; exit;
}

function backup_endpoint_download(string $file): void {
  global $finished;
  $input = fopen($file, 'rb');
  if (!$input) throw new BackupArchiveException('备份压缩包已过期，请重新导出。', 404);
  $finished = true;
  header('Content-Type: application/zip'); header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff');
  header('Content-Disposition: attachment; filename="ATO-daily-backups-' . gmdate('Ymd-His') . '.zip"');
  header('Content-Length: ' . filesize($file));
  while (!feof($input)) { $chunk = fread($input, 65536); if ($chunk === false) break; echo $chunk; }
  fclose($input); exit;
}

try {
  $dataEnvironment = getenv('ATO_DATA_DIR');
  $dataDir = is_string($dataEnvironment) && $dataEnvironment !== '' ? rtrim($dataEnvironment, '\\/') : dirname(__DIR__) . '/data';
  $sessionDir = $dataDir . '/sessions'; backup_archive_mkdir($sessionDir);
  session_save_path($sessionDir);
  session_set_cookie_params(['lifetime' => 60 * 60 * 24 * 180, 'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Lax']);
  session_start();
  $user = $_SESSION['ato_user_id'] ?? null; session_write_close();
  if (!is_string($user) || !preg_match('/^[a-z0-9][a-z0-9_-]{2,31}$/D', $user)) backup_endpoint_json(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录主控台。']);
  $action = $_GET['action'] ?? '';
  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
  $allowed = $action === 'import' ? ['PUT', 'POST'] : ($action === 'prepare-export' ? ['POST'] : ['GET']);
  if (!in_array($method, $allowed, true)) backup_endpoint_json(405, ['ok' => false, 'error' => '不支持这种备份操作方式。']);
  if ($method !== 'GET') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $originHost = $origin !== '' ? parse_url($origin, PHP_URL_HOST) : null;
    $originPort = $origin !== '' ? parse_url($origin, PHP_URL_PORT) : null;
    $expectedOrigin = $originHost === null ? '' : $originHost . ($originPort !== null ? ':' . $originPort : '');
    if (($_SERVER['HTTP_X_ATO_BACKUP'] ?? '') !== '1' || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site'
        || ($origin !== '' && strcasecmp($expectedOrigin, (string) ($_SERVER['HTTP_HOST'] ?? '')) !== 0)) backup_endpoint_json(403, ['ok' => false, 'error' => '请从当前程序的战役简报页面操作备份。']);
  }
  $accountRoot = $dataDir . '/backups/' . backup_archive_component($user);
  if (is_link($dataDir . '/backups') || is_link($accountRoot)) throw new BackupArchiveException('备份目录不能是链接。');
  backup_archive_mkdir($accountRoot);
  $lock = fopen($accountRoot . '/.briefing-backups.lock', 'c');
  if (!$lock || !flock($lock, LOCK_EX)) throw new BackupArchiveException('无法锁定备份操作，请重试。', 500);
  $transferRoot = $accountRoot . '/.briefing-transfer'; backup_archive_mkdir($transferRoot);
  foreach (scandir($transferRoot) ?: [] as $item) {
    if (preg_match('/^[a-f0-9]{32}$/D', $item) && filemtime($transferRoot . '/' . $item) < time() - 15 * 60) backup_archive_remove($transferRoot . '/' . $item);
  }
  if ($action === 'download') {
    $token = $_GET['token'] ?? null;
    if (!is_string($token) || !preg_match('/^[a-f0-9]{32}$/D', $token)) throw new BackupArchiveException('备份下载地址无效。');
    $workingDirectory = $transferRoot . '/' . $token;
    if (is_link($workingDirectory) || !is_file($workingDirectory . '/ready.json') || !is_file($workingDirectory . '/backups.zip')) throw new BackupArchiveException('备份压缩包已过期，请重新导出。', 404);
    backup_endpoint_download($workingDirectory . '/backups.zip');
  }
  if (!in_array($action, ['export', 'prepare-export', 'import'], true)) throw new BackupArchiveException('未知备份操作。');
  $token = bin2hex(random_bytes(16)); $workingDirectory = $transferRoot . '/' . $token; backup_archive_mkdir($workingDirectory);
  if ($action === 'import') {
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($contentLength > ATO_BACKUP_ZIP_LIMIT) throw new BackupArchiveException('备份压缩包超过 512 MB。', 413);
    $input = fopen('php://input', 'rb'); $output = fopen($workingDirectory . '/upload.zip', 'xb');
    try { backup_archive_copy($input, $output, ATO_BACKUP_ZIP_LIMIT); }
    finally { fclose($input); fclose($output); }
    $result = backup_archive_import($workingDirectory . '/upload.zip', $accountRoot, $workingDirectory);
    backup_endpoint_json(200, $result);
  }
  $result = backup_archive_export($accountRoot, $workingDirectory);
  if ($action === 'export') backup_endpoint_download($workingDirectory . '/backups.zip');
  file_put_contents($workingDirectory . '/ready.json', json_encode($result));
  $workingDirectory = null; // Retained for the authenticated, one-use download.
  backup_endpoint_json(200, ['ok' => true] + $result + ['downloadUrl' => 'backups.php?action=download&token=' . $token]);
} catch (BackupArchiveException $error) {
  backup_endpoint_json($error->status, ['ok' => false, 'code' => 'BACKUP_ARCHIVE_INVALID', 'error' => $error->getMessage()]);
} catch (Throwable $error) {
  error_log('Daily backup transfer: ' . $error->getMessage());
  backup_endpoint_json(500, ['ok' => false, 'error' => '备份操作失败，请检查剩余空间后重试。']);
}
