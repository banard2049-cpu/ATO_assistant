<?php
declare(strict_types=1);

// 应用内一键更新：只替换「程序代码」，不碰运行时、data/、本地素材。
//
// 服务端校验发布来源，浏览器按计划下载文件。
//   * 只接受本机回环 + 已登录用户的请求；
//   * 服务端从官方仓库读取发布记录、标签指向的提交和文件差异，再按打包规则剔除
//     发布包里没有的路径（tools/、data/、tests/、asset-studio/、本地素材、
//     *.atopack、BGM 音频……）；
//   * 每个文件的内容用 GitHub 给的 git blob sha 校验后才进暂存；
//   * 全部暂存校验通过才动安装目录，动之前先备份，失败可以还原。
//
// 调用顺序（全部为 POST，除 status）：
//   status   能力探测
//   begin    提交目标版本，服务端核实后给出下载/删除清单
//   stage    逐个上传文件内容（?path=&sha=，正文为原始字节）
//   commit   落盘
//   rollback 还原最近一次备份

require_once __DIR__ . '/app-update-policy.php';

// 与 tools/packaging/package_common.py 的排除规则保持一致的那部分在
// app-update-policy.php 里，并有跨语言一致性测试兜底。

// GitHub compare 一次最多列出 300 个文件，到顶说明结果被截断了。
const ATO_UPDATE_COMPARE_FILE_LIMIT = 300;
// 单个程序文件上限。仓库里最大的受版本控制文件约 1.5 MB，留足余量。
const ATO_UPDATE_MAX_FILE_BYTES = 8388608;
// 一次更新的总量上限。
const ATO_UPDATE_MAX_TOTAL_BYTES = 33554432;
const ATO_UPDATE_VERSION_RELATIVE = 'assets/update/app-version.js';
const ATO_UPDATE_PLAN_VERSION = 2;
const ATO_UPDATE_RUNNER_PREFIX = '.ato-update-v2-';

// API 响应必须是合法 JSON，即使运行时写不了盘：把 PHP 警告赶进日志，不要混进正文。
ini_set('display_errors', '0');
ini_set('log_errors', '1');
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
  if (!(error_reporting() & $severity)) return false;
  error_log(sprintf('%s in %s on line %d', $message, $file, $line));
  return true;
});

$cookieLifetime = 60 * 60 * 24 * 180;
ini_set('session.gc_maxlifetime', (string) $cookieLifetime);
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
  // Lax：跨站 POST 不带这个 cookie，恶意网页无法借已登录用户的浏览器触发更新。
  'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$root = dirname(__DIR__);
$dataDir = $root . DIRECTORY_SEPARATOR . 'data';
$stagingRoot = $dataDir . DIRECTORY_SEPARATOR . 'update-staging';
$backupRoot = $dataDir . DIRECTORY_SEPARATOR . 'update-backup';

function respond(int $status, array $payload): void
{
  http_response_code($status);
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}

function ato_update_remove_tree(string $dir): void
{
  if (!is_dir($dir)) return;
  $iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
    RecursiveIteratorIterator::CHILD_FIRST
  );
  foreach ($iterator as $item) {
    if ($item->isDir() && !$item->isLink()) {
      @rmdir($item->getPathname());
    } else {
      @unlink($item->getPathname());
    }
  }
  @rmdir($dir);
}

function ato_update_absolute(string $root, string $relative): string
{
  return $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
}

/** 读出请求正文里的 JSON；读不出来或不是对象就返回 null。 */
function ato_update_json_body(int $maxBytes): ?array
{
  // 超过 post_max_size 的请求体在脚本运行前就被 PHP 丢掉了，脚本只能按
  // CONTENT_LENGTH 判，否则会误报成「正文不是 JSON」。
  if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBytes) {
    respond(413, ['ok' => false, 'code' => 'PAYLOAD_TOO_LARGE', 'error' => '请求内容过大。']);
  }
  $raw = file_get_contents('php://input');
  if ($raw === false || $raw === '') return null;
  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : null;
}

/**
 * 覆盖写一个文件：先写同目录临时文件再改名。同卷改名在 Windows 上也是原子的，
 * 中途失败不会在安装目录里留下半个文件。杀毒/索引器会短暂占用目标文件，所以失败
 * 后重试几次。
 */
function ato_update_replace_file(string $source, string $destination): bool
{
  for ($attempt = 0; $attempt < 6; $attempt++) {
    $temp = $destination . '.atoupdate-' . bin2hex(random_bytes(4));
    if (@copy($source, $temp)) {
      if (@rename($temp, $destination)) return true;
      @unlink($temp);
    } else {
      @unlink($temp);
    }
    usleep(150000);
  }
  return false;
}

/** 便携版才支持应用内更新；其余部署方式给出各自的正确做法。 */
function ato_update_support(string $root): ?array
{
  if (is_file($root . DIRECTORY_SEPARATOR . '.dockerenv')) {
    return ['NOT_PORTABLE', '当前运行在 Docker 容器里，程序文件来自镜像：请在宿主机上执行 docker compose pull && docker compose up -d。'];
  }
  if (!is_dir($root . DIRECTORY_SEPARATOR . 'runtime' . DIRECTORY_SEPARATOR . 'php')) {
    return ['NOT_PORTABLE', '当前不是便携版（没有内置 PHP 运行时），请下载完整安装包更新。'];
  }
  if (!is_writable($root)) {
    return ['READ_ONLY', '安装目录不可写，请把便携包解压到可写目录后再试。'];
  }
  return null;
}

/** 当前暂存的计划目录；没有计划时返回 null。 */
function ato_update_stage_dir(string $stagingRoot): ?string
{
  $dirs = glob($stagingRoot . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR);
  if (!is_array($dirs)) return null;
  foreach ($dirs as $dir) {
    if (is_file($dir . DIRECTORY_SEPARATOR . 'plan.json')) return $dir;
  }
  return null;
}

function ato_update_read_plan(string $stageDir): ?array
{
  $plan = json_decode((string) @file_get_contents($stageDir . DIRECTORY_SEPARATOR . 'plan.json'), true);
  return is_array($plan) ? $plan : null;
}

function ato_update_write_plan(string $stageDir, array $plan): bool
{
  $json = json_encode($plan, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
  return is_string($json) && ato_update_write_atomic($stageDir . DIRECTORY_SEPARATOR . 'plan.json', $json);
}

function ato_update_write_atomic(string $destination, string $content): bool
{
  $temp = $destination . '.atoupdate-' . bin2hex(random_bytes(4));
  $ok = @file_put_contents($temp, $content) === strlen($content)
    && ato_update_replace_file($temp, $destination);
  @unlink($temp);
  return $ok;
}

function ato_update_require_plan_id(?array $plan): void
{
  if ($plan !== null && (!isset($plan['id']) || !hash_equals((string) $plan['id'], (string) ($_GET['plan'] ?? '')))) {
    respond(409, ['ok' => false, 'code' => 'PLAN_CHANGED', 'error' => '更新计划已被另一个页面替换，请重新检查更新。']);
  }
}

function ato_update_require_version(string $root, string $expected): void
{
  $installed = ato_update_local_version($root);
  if ($installed === null || ltrim($installed, 'v') !== ltrim($expected, 'v')) {
    respond(409, ['ok' => false, 'code' => 'VERSION_CHANGED', 'error' => '安装版本已改变，请刷新页面后重新检查更新。']);
  }
}

function ato_update_verified_plan(?array $plan): bool
{
  return ($plan['version'] ?? null) === ATO_UPDATE_PLAN_VERSION
    && is_string($plan['commit'] ?? null) && preg_match('/\A[0-9a-f]{40}\z/', $plan['commit']) === 1;
}

/** Resolve the published tag itself, including annotated tags, to a fixed commit. */
function ato_update_release_commit(string $tag): string
{
  $release = ato_update_github_json('releases/tags/' . rawurlencode($tag));
  if (($release['tag_name'] ?? null) !== $tag || ($release['draft'] ?? null) !== false
      || ($release['prerelease'] ?? null) !== false || empty($release['published_at'])) {
    respond(502, ['ok' => false, 'code' => 'RELEASE_UNVERIFIED',
      'error' => '本机服务无法验证这个 GitHub 正式发布版本，请检查连接或下载完整安装包。']);
  }
  $ref = ato_update_github_json('git/ref/tags/' . rawurlencode($tag));
  $object = ($ref['ref'] ?? null) === 'refs/tags/' . $tag ? ($ref['object'] ?? null) : null;
  for ($depth = 0; $depth <= 2 && is_array($object); $depth++) {
    $sha = $object['sha'] ?? null;
    if (!is_string($sha) || preg_match('/\A[0-9a-f]{40}\z/', $sha) !== 1) break;
    if (($object['type'] ?? null) === 'commit') return $sha;
    if (($object['type'] ?? null) !== 'tag' || $depth === 2) break;
    $annotation = ato_update_github_json('git/tags/' . $sha);
    $object = ($annotation['sha'] ?? null) === $sha ? ($annotation['object'] ?? null) : null;
  }
  respond(502, ['ok' => false, 'code' => 'RELEASE_UNVERIFIED',
    'error' => '无法确认发布标签对应的提交，请稍后重试或下载完整安装包。']);
}

/** 暂存文件是否仍然和计划一致（大小 + 摘要）。 */
function ato_update_staged_is_valid(string $stageDir, array $entry): bool
{
  $path = $stageDir . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, (string) $entry['path']);
  if (!is_file($path)) return false;
  $content = @file_get_contents($path);
  if ($content === false) return false;
  return strlen($content) === (int) $entry['bytes'] && ato_update_git_blob_sha($content) === $entry['sha'];
}

function ato_update_latest_backup(string $backupRoot): ?string
{
  $dirs = glob($backupRoot . DIRECTORY_SEPARATOR . '*', GLOB_ONLYDIR);
  if (!is_array($dirs) || $dirs === []) return null;
  $candidates = [];
  foreach ($dirs as $dir) {
    $plan = ato_update_read_plan($dir);
    if (!is_array($plan) || ($plan['state'] ?? '') === 'rolledback') continue;
    $candidates[$dir] = (float) ($plan['backedUpAt'] ?? 0);
  }
  if ($candidates === []) return null;
  asort($candidates, SORT_NUMERIC);
  return (string) array_key_last($candidates);
}

$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
$action = (string) ($_GET['action'] ?? '');

// 只有已登录、且请求来自本机回环的用户才能更新程序文件。服务器绑在 0.0.0.0 上，
// 第二屏就是靠这个给局域网设备访问的，所以「同网段」不能等于「可信」。
$sessionUserId = $_SESSION['ato_user_id'] ?? null;
if (!is_string($sessionUserId) || $sessionUserId === '') {
  respond(401, ['ok' => false, 'code' => 'AUTH_REQUIRED', 'error' => '请先登录后再更新程序。']);
}
$remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
if (!ato_update_is_loopback($remote)) {
  respond(403, ['ok' => false, 'code' => 'LOCAL_ONLY', 'error' => '更新程序只能在运行本程序的这台电脑上操作，局域网设备无法执行。']);
}

// 不同登录会话也共用安装目录；PHP 会话锁不能保护更新计划及备份。
session_write_close();
$updateLock = @fopen($dataDir . DIRECTORY_SEPARATOR . 'app-update.lock', 'c');
if ($updateLock === false || !flock($updateLock, LOCK_EX | LOCK_NB)) {
  respond(409, ['ok' => false, 'code' => 'UPDATE_BUSY', 'error' => '另一个更新操作正在执行，请稍后重试。']);
}
$latestBackup = ato_update_latest_backup($backupRoot);
$latestBackupPlan = $latestBackup === null ? null : ato_update_read_plan($latestBackup);
$needsRecovery = ($latestBackupPlan['state'] ?? '') === 'applying';
// Windows 内置服务器会占用当前请求的 PHP 文件。提交/还原通过一次性的
// 执行副本完成，避免更新器无法替换自己；上一请求留下的副本在下次访问时清理。
foreach (glob(__DIR__ . DIRECTORY_SEPARATOR . '.ato-update-*.php') ?: [] as $runner) {
  if ($runner !== __FILE__ && (!str_starts_with(basename($runner), ATO_UPDATE_RUNNER_PREFIX)
      || is_file($runner . '.done') || @filemtime($runner) < time() - 3600)) {
    if (@unlink($runner)) @unlink($runner . '.done');
  }
}
if (str_starts_with(basename(__FILE__), ATO_UPDATE_RUNNER_PREFIX)) {
  if (!in_array($action, ['commit', 'rollback'], true)) {
    respond(405, ['ok' => false, 'error' => 'Unsupported action.']);
  }
  register_shutdown_function(static function (): void { @file_put_contents(__FILE__ . '.done', ''); });
}

if ($action === 'status') {
  if ($method !== 'GET') respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
  $support = ato_update_support($root);
  $stageDir = ato_update_stage_dir($stagingRoot);
  $plan = $stageDir === null ? null : ato_update_read_plan($stageDir);
  $staged = 0;
  $planned = 0;
  if (ato_update_verified_plan($plan)) {
    foreach ($plan['downloads'] ?? [] as $entry) {
      $planned++;
      if (is_array($entry) && isset($entry['bytes']) && ato_update_staged_is_valid($stageDir, $entry)) $staged++;
    }
  }
  respond(200, [
    'ok' => true,
    'supported' => $support === null,
    'code' => $support[0] ?? null,
    'reason' => $support[1] ?? null,
    'version' => ato_update_local_version($root),
    'canCommit' => ato_update_verified_plan($plan) && !$needsRecovery && $staged === $planned,
    'canRollback' => $latestBackup !== null,
    'backupId' => $latestBackup === null ? null : basename($latestBackup),
    'rollbackVersion' => $latestBackupPlan['from'] ?? null,
    'needsRecovery' => $needsRecovery,
    'planId' => $plan['id'] ?? null,
  ]);
}

if ($method !== 'POST') {
  respond(405, ['ok' => false, 'error' => 'Unsupported method.']);
}

$support = ato_update_support($root);
if ($support !== null) {
  respond(409, ['ok' => false, 'code' => $support[0], 'error' => $support[1]]);
}

if ($action === 'prepare') {
  $main = @file_get_contents($root . '/api/app-update.php');
  $policy = @file_get_contents($root . '/api/app-update-policy.php');
  if ($main === false || $policy === false) {
    respond(500, ['ok' => false, 'code' => 'PREPARE_FAILED', 'error' => '无法读取更新程序，请下载完整安装包。']);
  }
  // 将规则代码嵌入副本，避免 require 再次占用即将被替换的原始规则文件。
  $policy = preg_replace('/^<\?php\s*declare\(strict_types=1\);\s*/', '', $policy);
  $marker = "require_once __DIR__ . '/app-update-policy.php';";
  $offset = strpos($main, $marker);
  if ($offset === false) {
    respond(500, ['ok' => false, 'code' => 'PREPARE_FAILED', 'error' => '更新程序格式不兼容，请下载完整安装包。']);
  }
  $combined = substr_replace($main, $policy, $offset, strlen($marker));
  $name = ATO_UPDATE_RUNNER_PREFIX . bin2hex(random_bytes(16)) . '.php';
  if (!ato_update_write_atomic(__DIR__ . DIRECTORY_SEPARATOR . $name, $combined)) {
    respond(500, ['ok' => false, 'code' => 'PREPARE_FAILED', 'error' => '无法创建更新执行副本，请检查 api 目录权限和磁盘空间。']);
  }
  respond(200, ['ok' => true, 'endpoint' => './api/' . $name]);
}

// ------------------------------------------------------------------ begin ---
if ($action === 'begin') {
  if ($needsRecovery) {
    respond(409, ['ok' => false, 'code' => 'RECOVERY_REQUIRED', 'error' => '上次更新尚未完成，请先还原上一版再重试。']);
  }
  $body = ato_update_json_body(4 * 1024 * 1024);
  if ($body === null) {
    respond(400, ['ok' => false, 'code' => 'BAD_REQUEST', 'error' => '请求内容不是合法的 JSON。']);
  }
  $current = $body['current'] ?? null;
  $tag = $body['target'] ?? null;
  $targetVersion = is_string($tag) ? ato_update_parse_version($tag) : null;
  if (!is_string($current) || ato_update_parse_version($current) === null
      || $targetVersion === null || $targetVersion['prerelease'] !== '') {
    respond(400, ['ok' => false, 'code' => 'BAD_VERSION', 'error' => '版本号格式不正确，已停止更新。']);
  }
  if (!ato_update_is_newer($tag, $current)) {
    respond(409, ['ok' => false, 'code' => 'ALREADY_LATEST', 'error' => '当前已经是最新版本。']);
  }
  ato_update_require_version($root, $current);
  set_time_limit(45);
  $commit = ato_update_release_commit($tag);
  $baseTag = 'v' . ltrim($current, 'v');
  $compare = ato_update_github_json('compare/' . rawurlencode($baseTag) . '...' . $commit);
  if (!is_array($compare['files'] ?? null) || !array_is_list($compare['files'])) {
    respond(502, ['ok' => false, 'code' => 'COMPARE_UNVERIFIED',
      'error' => '本机服务无法从 GitHub 确认版本差异，请检查连接或下载完整安装包。']);
  }
  if (!in_array($compare['status'] ?? null, ['ahead', 'identical'], true)) {
    respond(409, ['ok' => false, 'code' => 'DIVERGED_RELEASE',
      'error' => '当前版本与目标发布版本不在同一条线上，请下载完整安装包。']);
  }
  $changed = $compare['files'];
  if (count($changed) >= ATO_UPDATE_COMPARE_FILE_LIMIT) {
    respond(409, [
      'ok' => false, 'code' => 'TOO_MANY_FILES',
      'error' => '本次改动超过 GitHub 一次能列出的上限（300 个文件），请下载完整安装包。',
    ]);
  }

  $downloads = [];
  $deletions = [];
  foreach ($changed as $file) {
    if (!is_array($file) || !is_string($file['filename'] ?? null) || !is_string($file['status'] ?? null)) {
      respond(502, ['ok' => false, 'code' => 'COMPARE_UNVERIFIED', 'error' => 'GitHub 返回的文件清单不完整，已停止更新。']);
    }
    $name = (string) ($file['filename'] ?? '');
    $safe = ato_update_normalize_relative($name);
    if ($safe === null) {
      respond(409, ['ok' => false, 'code' => 'UNSAFE_PATH', 'error' => '发布内容里出现了不安全的路径，已停止更新：' . $name]);
    }
    // 改名要先把旧路径删掉，否则新旧两份会同时留在安装目录里。
    $previous = (string) ($file['previous_filename'] ?? '');
    if ($previous !== '') {
      $previousSafe = ato_update_normalize_relative($previous);
      if ($previousSafe === null) {
        respond(409, ['ok' => false, 'code' => 'UNSAFE_PATH', 'error' => '发布内容里出现了不安全的路径，已停止更新：' . $previous]);
      }
      if (!ato_update_path_excluded($previousSafe)) $deletions[$previousSafe] = true;
    }
    // 发布包里本来没有的路径既不下载也不删除：这正是打包器的口径。
    if (ato_update_path_excluded($safe)) continue;
    // 版本文件由更新器自己按发布包的格式写，不走下载。
    if ($safe === ATO_UPDATE_VERSION_RELATIVE) continue;

    if ((string) ($file['status'] ?? '') === 'removed') {
      $deletions[$safe] = true;
      continue;
    }
    $sha = strtolower((string) ($file['sha'] ?? ''));
    if (preg_match('/^[0-9a-f]{40}$/', $sha) !== 1) {
      respond(502, ['ok' => false, 'code' => 'MISSING_SHA', 'error' => 'GitHub 没有给出文件校验值，无法确认下载内容，已停止更新。']);
    }
    $downloads[$safe] = $sha;
  }
  // 既要下载又出现在删除里的路径以「下载」为准（改名后又加回来）。
  $deletions = array_keys(array_diff_key($deletions, $downloads));

  ato_update_remove_tree($stagingRoot);
  $planId = bin2hex(random_bytes(16));
  $stageDir = $stagingRoot . DIRECTORY_SEPARATOR . $planId;
  if (!@mkdir($stageDir . DIRECTORY_SEPARATOR . 'files', 0770, true) && !is_dir($stageDir . DIRECTORY_SEPARATOR . 'files')) {
    respond(500, ['ok' => false, 'code' => 'STAGING_FAILED', 'error' => '无法写入暂存目录 data/update-staging，请检查磁盘空间和权限。']);
  }
  $plan = [
    'version' => ATO_UPDATE_PLAN_VERSION,
    'id' => $planId,
    'current' => $current,
    'target' => $tag,
    'commit' => $commit,
    'downloads' => [],
    'deletions' => $deletions,
    'createdAt' => time(),
  ];
  foreach ($downloads as $path => $sha) {
    $plan['downloads'][] = ['path' => $path, 'sha' => $sha];
  }
  if (!ato_update_write_plan($stageDir, $plan)) {
    ato_update_remove_tree($stagingRoot);
    respond(500, ['ok' => false, 'code' => 'STAGING_FAILED', 'error' => '无法写入更新计划，请检查磁盘空间和权限。']);
  }

  respond(200, [
    'ok' => true,
    'phase' => 'planned',
    'planId' => $plan['id'],
    'current' => $current,
    'target' => $tag,
    'commit' => $commit,
    'downloads' => $plan['downloads'],
    'deletions' => $deletions,
    'fileCount' => count($plan['downloads']),
    'deletionCount' => count($deletions),
  ]);
}

// ------------------------------------------------------------------ stage ---
// 正文就是文件原始字节（不套 base64）：?path=<相对路径>&sha=<git blob sha>。
if ($action === 'stage') {
  $stageDir = ato_update_stage_dir($stagingRoot);
  if ($stageDir === null) {
    respond(409, ['ok' => false, 'code' => 'NO_PLAN', 'error' => '还没有开始更新，请先执行「一键更新」。']);
  }
  $plan = ato_update_read_plan($stageDir);
  ato_update_require_plan_id($plan);
  if (!ato_update_verified_plan($plan)) {
    respond(409, ['ok' => false, 'code' => 'NO_PLAN', 'error' => '更新计划需要重新验证，请重新执行「一键更新」。']);
  }
  $declared = (string) ($_GET['path'] ?? '');
  // PHP 已经解码了查询参数；再次解码会破坏文件名中的 %20 等字面文本。
  $path = ato_update_normalize_relative($declared);
  if ($path === null || $path !== $declared) {
    respond(409, ['ok' => false, 'code' => 'UNSAFE_PATH', 'error' => '收到不安全的文件路径，已停止更新。']);
  }
  $sha = strtolower((string) ($_GET['sha'] ?? ''));
  if (preg_match('/^[0-9a-f]{40}$/', $sha) !== 1) {
    respond(400, ['ok' => false, 'code' => 'MISSING_SHA', 'error' => '缺少文件校验值。']);
  }
  // 只接受计划里列出的路径和摘要：客户端不能临时往里塞别的东西。
  $target = null;
  foreach ($plan['downloads'] as $entry) {
    if ((string) $entry['path'] === $path) { $target = $entry; break; }
  }
  if ($target === null || (string) $target['sha'] !== $sha) {
    respond(409, ['ok' => false, 'code' => 'NOT_PLANNED', 'error' => '收到计划之外的文件，已停止更新。']);
  }

  if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > ATO_UPDATE_MAX_FILE_BYTES) {
    respond(413, ['ok' => false, 'code' => 'FILE_TOO_LARGE', 'error' => "文件 {$path} 超过单个文件上限，无法自动更新。"]);
  }
  $content = file_get_contents('php://input');
  if ($content === false) {
    respond(400, ['ok' => false, 'code' => 'BAD_BODY', 'error' => "读取 {$path} 的内容失败。"]);
  }
  if (strlen($content) > ATO_UPDATE_MAX_FILE_BYTES) {
    respond(413, ['ok' => false, 'code' => 'FILE_TOO_LARGE', 'error' => "文件 {$path} 超过单个文件上限，无法自动更新。"]);
  }
  if (ato_update_git_blob_sha($content) !== $sha) {
    respond(502, [
      'ok' => false, 'code' => 'CHECKSUM_MISMATCH',
      'error' => "文件 {$path} 校验失败（内容与发布版本不一致），已取消更新，安装目录未改动。",
    ]);
  }

  $total = 0;
  foreach ($plan['downloads'] as $entry) {
    if ($entry['path'] !== $path) $total += (int) ($entry['bytes'] ?? 0);
  }
  if ($total + strlen($content) > ATO_UPDATE_MAX_TOTAL_BYTES) {
    ato_update_remove_tree($stagingRoot);
    respond(409, ['ok' => false, 'code' => 'TOO_LARGE', 'error' => '本次更新总量过大，请下载完整安装包。']);
  }

  $destination = $stageDir . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $path);
  if (!@mkdir(dirname($destination), 0770, true) && !is_dir(dirname($destination))) {
    ato_update_remove_tree($stagingRoot);
    respond(500, ['ok' => false, 'code' => 'STAGING_FAILED', 'error' => "无法暂存 {$path}，请检查磁盘空间和权限。"]);
  }
  if (@file_put_contents($destination, $content) !== strlen($content)) {
    ato_update_remove_tree($stagingRoot);
    respond(500, ['ok' => false, 'code' => 'STAGING_FAILED', 'error' => "无法暂存 {$path}，请检查磁盘空间和权限。"]);
  }

  foreach ($plan['downloads'] as $index => $entry) {
    if ((string) $entry['path'] === $path) {
      $plan['downloads'][$index]['bytes'] = strlen($content);
      break;
    }
  }
  if (!ato_update_write_plan($stageDir, $plan)) {
    ato_update_remove_tree($stagingRoot);
    respond(500, ['ok' => false, 'code' => 'STAGING_FAILED', 'error' => '无法记录更新计划，请检查磁盘空间和权限。']);
  }

  $done = 0;
  foreach ($plan['downloads'] as $entry) {
    if (isset($entry['bytes'])) $done++;
  }
  respond(200, ['ok' => true, 'phase' => 'staged', 'path' => $path, 'staged' => $done, 'fileCount' => count($plan['downloads'])]);
}

// ----------------------------------------------------------------- commit ---
if ($action === 'commit') {
  if ($needsRecovery) {
    respond(409, ['ok' => false, 'code' => 'RECOVERY_REQUIRED', 'error' => '上次更新尚未完成，请先还原上一版再重试。']);
  }
  $stageDir = ato_update_stage_dir($stagingRoot);
  $plan = $stageDir === null ? null : ato_update_read_plan($stageDir);
  if (!ato_update_verified_plan($plan)) {
    respond(409, ['ok' => false, 'code' => 'NO_PLAN', 'error' => '还没有下载好的更新，请先执行「一键更新」。']);
  }
  ato_update_require_plan_id($plan);
  ato_update_require_version($root, (string) ($plan['current'] ?? ''));
  $target = (string) ($plan['target'] ?? '');
  if (ato_update_parse_version($target) === null) {
    ato_update_remove_tree($stagingRoot);
    respond(409, ['ok' => false, 'code' => 'NO_PLAN', 'error' => '更新计划已损坏，请重新执行「一键更新」。']);
  }
  foreach ($plan['downloads'] as $entry) {
    if (!isset($entry['bytes']) || !ato_update_staged_is_valid($stageDir, $entry)) {
      respond(409, [
        'ok' => false, 'code' => 'NOT_STAGED',
        'error' => '还有文件没有下载完成或校验失败，请重新执行「一键更新」。',
      ]);
    }
  }

  $backupDir = $backupRoot . DIRECTORY_SEPARATOR . date('Ymd-His') . '-' . bin2hex(random_bytes(6));
  if (!@mkdir($backupDir, 0770, true) && !is_dir($backupDir)) {
    respond(500, ['ok' => false, 'code' => 'BACKUP_FAILED', 'error' => '无法创建备份目录 data/update-backup，请检查磁盘空间和权限。']);
  }

  // 先备份：被覆盖的、被删除的，以及版本文件。这一步失败就整个停下，安装目录保持原样。
  $managed = [];
  foreach ($plan['downloads'] as $entry) $managed[] = (string) $entry['path'];
  $managed[] = ATO_UPDATE_VERSION_RELATIVE;
  $backupList = [];
  foreach (array_merge($managed, array_map('strval', $plan['deletions'] ?? [])) as $relative) {
    $source = ato_update_absolute($root, $relative);
    if (!is_file($source)) continue;   // 备份里没有 → 说明是本次新建的，还原时删掉
    $destination = $backupDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!@mkdir(dirname($destination), 0770, true) && !is_dir(dirname($destination))) {
      respond(500, ['ok' => false, 'code' => 'BACKUP_FAILED', 'error' => "无法备份 {$relative}，已停止更新，安装目录未改动。"]);
    }
    if (!@copy($source, $destination)) {
      respond(500, ['ok' => false, 'code' => 'BACKUP_FAILED', 'error' => "无法备份 {$relative}，已停止更新，安装目录未改动。"]);
    }
    $backupList[] = $relative;
  }
  $backupPlan = ['version' => 1, 'from' => (string) ($plan['current'] ?? ''), 'target' => $target,
    'downloads' => $managed, 'deletions' => array_values($plan['deletions'] ?? []),
    'backedUpAt' => microtime(true), 'state' => 'applying', 'backups' => []];
  foreach ($backupList as $relative) {
    $digest = @hash_file('sha256', ato_update_absolute($backupDir, $relative));
    if ($digest === false || $digest !== @hash_file('sha256', ato_update_absolute($root, $relative))) {
      respond(500, ['ok' => false, 'code' => 'BACKUP_FAILED', 'error' => '备份校验失败，安装目录未改动。']);
    }
    $backupPlan['backups'][$relative] = $digest;
  }
  if (!ato_update_write_plan($backupDir, $backupPlan)) {
    respond(500, ['ok' => false, 'code' => 'BACKUP_FAILED', 'error' => '无法保存备份清单，安装目录未改动。']);
  }

  $applied = 0;
  foreach ($plan['downloads'] as $entry) {
    $relative = (string) $entry['path'];
    $source = $stageDir . DIRECTORY_SEPARATOR . 'files' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    $destination = ato_update_absolute($root, $relative);
    if (!@mkdir(dirname($destination), 0770, true) && !is_dir(dirname($destination))) {
      respond(500, ['ok' => false, 'code' => 'APPLY_FAILED', 'applied' => $applied, 'backup' => basename($backupDir),
        'error' => "无法创建目录以写入 {$relative}，更新中断，可点击「还原上一版」。"]);
    }
    if (!ato_update_replace_file($source, $destination)) {
      respond(500, ['ok' => false, 'code' => 'APPLY_FAILED', 'applied' => $applied, 'backup' => basename($backupDir),
        'error' => "写入 {$relative} 失败（文件可能被占用），更新中断，可点击「还原上一版」。"]);
    }
    $applied++;
  }

  $deleted = 0;
  foreach (array_map('strval', $plan['deletions'] ?? []) as $relative) {
    $destination = ato_update_absolute($root, $relative);
    if (!is_file($destination)) continue;
    $removed = false;
    for ($attempt = 0; $attempt < 6; $attempt++) {
      if (@unlink($destination)) { $removed = true; break; }
      usleep(150000);
    }
    if (!$removed) {
      respond(500, ['ok' => false, 'code' => 'APPLY_FAILED', 'applied' => $applied, 'deleted' => $deleted,
        'backup' => basename($backupDir),
        'error' => "删除旧文件 {$relative} 失败，更新中断，可点击「还原上一版」。"]);
    }
    $deleted++;
  }

  // 版本号最后写：格式固定（和发布包里一致，不带前缀 v），保证下次比较的基准是对的。
  $versionFile = ato_update_absolute($root, ATO_UPDATE_VERSION_RELATIVE);
  if (!@mkdir(dirname($versionFile), 0770, true) && !is_dir(dirname($versionFile))) {
    respond(500, ['ok' => false, 'code' => 'APPLY_FAILED', 'applied' => $applied, 'backup' => basename($backupDir),
      'error' => '无法写入版本文件，更新中断，可点击「还原上一版」。']);
  }
  if (!ato_update_write_atomic($versionFile, 'window.ATO_APP_VERSION = ' . json_encode(preg_replace('/^v/', '', $target)) . ";\n")) {
    respond(500, ['ok' => false, 'code' => 'APPLY_FAILED', 'error' => '无法写入版本文件，更新中断，可点击「还原上一版」。']);
  }
  $backupPlan['state'] = 'applied';
  if (!ato_update_write_plan($backupDir, $backupPlan)) {
    respond(500, ['ok' => false, 'code' => 'APPLY_FAILED', 'error' => '无法记录更新结果，请先还原上一版再重试。']);
  }

  ato_update_remove_tree($stagingRoot);

  respond(200, [
    'ok' => true,
    'phase' => 'applied',
    'target' => $target,
    'applied' => $applied,
    'deleted' => $deleted,
    'backup' => basename($backupDir),
    'backedUp' => count($backupList),
  ]);
}

// ---------------------------------------------------------------- rollback ---
if ($action === 'rollback') {
  $backupDir = ato_update_latest_backup($backupRoot);
  $body = ato_update_json_body(4096);
  $requestedBackup = (string) ($body['backupId'] ?? '');
  if ($requestedBackup !== '' && ($backupDir === null || basename($backupDir) !== $requestedBackup)) {
    respond(409, ['ok' => false, 'code' => 'BACKUP_CHANGED', 'error' => '可还原的备份已改变，请刷新页面确认当前版本后重试。']);
  }
  if ($backupDir === null) {
    respond(409, ['ok' => false, 'code' => 'NO_BACKUP', 'error' => '没有可用的备份。']);
  }
  $plan = json_decode((string) @file_get_contents($backupDir . DIRECTORY_SEPARATOR . 'plan.json'), true);
  if (!is_array($plan)) {
    respond(409, ['ok' => false, 'code' => 'NO_BACKUP', 'error' => '备份内容已损坏，无法还原。']);
  }

  // 丢失或损坏的备份不能被误当作「本次新增的文件」而删除现有程序。
  foreach ($plan['backups'] ?? [] as $relative => $digest) {
    if (@hash_file('sha256', ato_update_absolute($backupDir, $relative)) !== $digest) {
      respond(409, ['ok' => false, 'code' => 'BACKUP_DAMAGED', 'error' => '备份文件缺失或损坏，未执行还原，请下载完整安装包。']);
    }
  }
  $plan['state'] = 'applying';
  if (!ato_update_write_plan($backupDir, $plan)) {
    respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => '无法记录还原进度，未执行还原。']);
  }

  $restored = 0;
  $removed = 0;
  foreach (array_map('strval', $plan['downloads'] ?? []) as $relative) {
    $destination = ato_update_absolute($root, $relative);
    $source = $backupDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (is_file($source)) {
      if (!is_dir(dirname($destination)) && !@mkdir(dirname($destination), 0770, true)) {
        respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => "还原 {$relative} 失败。"]);
      }
      if (!ato_update_replace_file($source, $destination)) {
        respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => "还原 {$relative} 失败。"]);
      }
      $restored++;
      continue;
    }
    // 备份里没有这个文件 → 它是本次更新新建的，还原时要删掉。
    if (is_file($destination)) {
      if (!@unlink($destination)) {
        respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => "删除新增文件 {$relative} 失败，请重试还原。"]);
      }
      $removed++;
    }
  }
  foreach (array_map('strval', $plan['deletions'] ?? []) as $relative) {
    $source = $backupDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!is_file($source)) continue;
    $destination = ato_update_absolute($root, $relative);
    if (!@mkdir(dirname($destination), 0770, true) && !is_dir(dirname($destination))) {
      respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => "还原 {$relative} 失败。"]);
    }
    if (!ato_update_replace_file($source, $destination)) {
      respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => "还原 {$relative} 失败。"]);
    }
    $restored++;
  }

  $plan['state'] = 'rolledback';
  if (!ato_update_write_plan($backupDir, $plan)) {
    respond(500, ['ok' => false, 'code' => 'ROLLBACK_FAILED', 'error' => '无法记录还原结果，请重试还原。']);
  }
  ato_update_remove_tree($stagingRoot);
  respond(200, ['ok' => true, 'phase' => 'rolledback', 'restored' => $restored, 'removed' => $removed, 'from' => $plan['from'] ?? null]);
}

if ($action === 'cancel') {
  $stageDir = ato_update_stage_dir($stagingRoot);
  ato_update_require_plan_id($stageDir === null ? null : ato_update_read_plan($stageDir));
  ato_update_remove_tree($stagingRoot);
  respond(200, ['ok' => true, 'phase' => 'cancelled']);
}

respond(400, ['ok' => false, 'code' => 'UNKNOWN_ACTION', 'error' => '未知操作。']);
