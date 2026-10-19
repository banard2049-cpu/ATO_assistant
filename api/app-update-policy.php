<?php
declare(strict_types=1);

// 应用内一键更新的共用规则（HTTP 编排在 api/app-update.php）。
//
// 单独成文件是为了让测试能直接 require 它：tests/test_app_update.py 会把这里的
// 排除规则和 tools/packaging/package_common.py 的 excluded() 放在同一份路径样本上
// 逐条比对——两边必须给出同一个答案。不一致的后果很具体：更新会把发布包里根本
// 没有的文件（tools/、data/、本地素材、*.atopack、BGM 音频）写进用户的安装目录，
// 或者漏掉该更新的文件。
//
// 规则来源就是 package_common.py 的 BLOCKED_TOP / BLOCKED_LEAVES /
// BLOCKED_SUFFIXES / BGM 音频判定。改那边时这里要同步改，测试会拦住漂移。

const ATO_UPDATE_BLOCKED_TOP = [
  '.git', '.github', '.agents', '.codex', '.idea', '.vscode',
  'asset-studio', 'official-assets', 'dist', 'export', 'release', 'releases', 'node_modules',
  'tests', 'docs',
  '.claude', 'log', 'logs', 'tmp', 'output', 'outputs',
  // 图标提取工作区：界面字形的本地草稿，发布包里没有，更新时既不下载也不删除。
  'icon-extract',
];

const ATO_UPDATE_BLOCKED_LEAVES = [
  '.ds_store', '.gitattributes', '.gitignore', 'dockerfile',
  'docker-compose.yml', 'docker-compose.yaml', 'docker-compose.nas.yml',
  '__pycache__', 'desktop.ini', 'thumbs.db',
];

const ATO_UPDATE_BLOCKED_SUFFIXES = [
  '.backup', '.bak', '.tmp', '.log', '.lock', '.atoback', '.atoback.partial',
  '.atopack', '.atopack.partial', '.docx',
];

const ATO_UPDATE_BLOCKED_LEAF_PREFIXES = ['start-windows', 'start-macos', 'php_errors', 'error_log', '.ato-update-'];

const ATO_UPDATE_BGM_MEDIA_SUFFIXES = [
  '.mp3', '.ogg', '.m4a', '.aac', '.wav', '.flac', '.opus', '.wma',
];

// Windows 设备名：写成 CON / NUL / COM1 这类名字（带扩展名也算）后，系统打开的是
// 设备而不是同名文件，落盘会失败或写到别处。发布包里不会有这种路径。
const ATO_UPDATE_RESERVED_WINDOWS_NAMES = [
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
];

/**
 * 校验并规范化一个「发布包相对路径」，不安全时返回 null。
 *
 * 这一步只看路径本身能不能安全地拼到安装目录下，和「该不该随包发布」是两件事
 * （后者是 ato_update_path_excluded）。改名清单来自 GitHub 的响应，属于外部输入，
 * 所以这里按最严的口径判：反斜杠、盘符、UNC、绝对路径、`..`、控制字符、结尾的
 * 点/空格（Windows 会静默丢掉它们）、非法字符、设备名一律拒绝。
 */
function ato_update_normalize_relative(string $raw): ?string
{
    if ($raw === '') return null;
    if (preg_match('/[\x00-\x1f\x7f]/', $raw) === 1) return null;
    // 反斜杠一律拒绝，不做替换：Windows 上它就是分隔符，"..\\..\\x" 必须挡死。
    if (str_contains($raw, '\\')) return null;
    if (str_starts_with($raw, '/')) return null;
    if (preg_match('#^[A-Za-z]:#', $raw) === 1) return null;

    $segments = [];
    foreach (explode('/', $raw) as $segment) {
        if ($segment === '' || $segment === '.') continue;
        if ($segment === '..') return null;
        // Windows 打开文件前会去掉每个分量结尾的点和空格，"/data./x" 实际读的是
        // data/x。规范化后与原文不同就说明这是个刻意绕过的写法，直接拒绝。
        if ($segment !== rtrim($segment, ". \t")) return null;
        if (preg_match('/[<>:"|?*]/', $segment) === 1) return null;
        $stem = strtolower((string) preg_replace('/\..*$/', '', $segment));
        if (in_array($stem, ATO_UPDATE_RESERVED_WINDOWS_NAMES, true)) return null;
        $segments[] = $segment;
    }

    if ($segments === []) return null;
    return implode('/', $segments);
}

/**
 * 该路径是否本来就「不随发布包发布」。
 *
 * 语义与 package_common.py 的 excluded() 完全一致：发布包里没有的东西，更新时既
 * 不下载也不删除。GitHub 的 compare 给出的是仓库的全部改动（release-notes、tests、
 * tools、asset-studio 都在内），靠这一层筛成「便携包里真实存在的文件」。
 */
function ato_update_path_excluded(string $relative): bool
{
    $parts = [];
    foreach (explode('/', str_replace('\\', '/', $relative)) as $part) {
        if ($part === '' || $part === '.') continue;
        $parts[] = strtolower($part);
    }
    if ($parts === []) return false;

    if (in_array('tools', $parts, true) || in_array('data', $parts, true)) return true;
    if (in_array($parts[0], ATO_UPDATE_BLOCKED_TOP, true)) return true;
    if (ato_update_is_bgm_media($parts)) return true;
    if (ato_update_is_icon_media($parts)) return true;
    // Optional source excerpts and original book crops stay local on updates.
    if (count($parts) >= 4 && implode('/', array_slice($parts, 0, 3)) === 'story/assets/mixed-media'
        && in_array($parts[3], ['mapping.js', 'images'], true)) return true;

    $leaf = $parts[count($parts) - 1];
    if (in_array($leaf, ATO_UPDATE_BLOCKED_LEAVES, true)) return true;
    foreach (ATO_UPDATE_BLOCKED_LEAF_PREFIXES as $prefix) {
        if (str_starts_with($leaf, $prefix)) return true;
    }
    foreach (ATO_UPDATE_BLOCKED_SUFFIXES as $suffix) {
        if (str_ends_with($leaf, $suffix)) return true;
    }
    if (preg_match('/\.backup\.\d+$/', $leaf) === 1) return true;

    return false;
}

/**
 * 主控台 BGM 音频：程序（assets/bgm/*.js）随包发布，音频由使用者自备。
 * @param string[] $parts 已小写化的路径分量
 */
function ato_update_is_bgm_media(array $parts): bool
{
    if ($parts === []) return false;
    $leaf = $parts[count($parts) - 1];
    $suffix = '';
    $dot = strrpos($leaf, '.');
    if ($dot !== false) $suffix = substr($leaf, $dot);
    if (!in_array($suffix, ATO_UPDATE_BGM_MEDIA_SUFFIXES, true)) return false;
    if ($parts[0] === 'bgm') return true;   // 早期版本的位置
    return count($parts) >= 3 && $parts[0] === 'assets' && $parts[1] === 'bgm';
}

/**
 * 主控台界面图标：字形同样由使用者自备，随资料包的 iconFiles 段分发，不进发布包。
 * assets/icons/ 整目录都算（这一目录里没有随包发布的程序代码）。
 * @param string[] $parts 已小写化的路径分量
 */
function ato_update_is_icon_media(array $parts): bool
{
    return count($parts) >= 2 && $parts[0] === 'assets' && $parts[1] === 'icons';
}

/**
 * 只认本机回环来源。
 *
 * 启动脚本把内置服务器绑在 0.0.0.0 上（第二屏就是靠这个给局域网手机看的），所以
 * 写文件的接口必须自己判来源：否则同网段任何人都能改程序文件。
 */
function ato_update_is_loopback(string $remote): bool
{
    if ($remote === '::1') return true;
    if (str_starts_with($remote, '127.')) return true;
    if (str_starts_with($remote, '::ffff:127.')) return true;
    return false;
}

/** 解析 v?X.Y.Z[-pre] 形式的版本号；解析不了返回 null。语义对齐 update-check.js。 */
function ato_update_parse_version(string $value): ?array
{
    if (preg_match('/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/', $value, $m) !== 1) {
        return null;
    }
    return [
        'numbers' => [(int) $m[1], (int) $m[2], (int) $m[3]],
        'prerelease' => $m[4] ?? '',
    ];
}

function ato_update_is_newer(string $latest, string $current): bool
{
    $a = ato_update_parse_version($latest);
    $b = ato_update_parse_version($current);
    if ($a === null || $b === null) return false;
    for ($i = 0; $i < 3; $i++) {
        if ($a['numbers'][$i] !== $b['numbers'][$i]) return $a['numbers'][$i] > $b['numbers'][$i];
    }
    // 数字部分相同时，正式版比预发布版新；两个都是预发布版则不比新旧。
    return $a['prerelease'] === '' && $b['prerelease'] !== '';
}

/**
 * Git 的 blob 摘要（不是文件内容的裸 sha1）。
 *
 * GitHub compare 的 files[].sha 就是新文件的 blob sha，下载完可以用它对上，
 * 确认拿到的字节和目标版本一致——下载被代理改写、截断、缓存串味都能当场发现。
 */
function ato_update_git_blob_sha(string $content): string
{
    return hash('sha1', 'blob ' . strlen($content) . "\x00" . $content);
}

/** 读取本机安装版本（发布构建会覆写这个文件）。 */
function ato_update_local_version(string $root): ?string
{
    $file = $root . DIRECTORY_SEPARATOR . 'assets' . DIRECTORY_SEPARATOR . 'update' . DIRECTORY_SEPARATOR . 'app-version.js';
    if (!is_file($file)) return null;
    $raw = @file_get_contents($file);
    if ($raw === false) return null;
    if (preg_match('/ATO_APP_VERSION\s*=\s*"([^"]*)"/', $raw, $m) !== 1) return null;
    return $m[1];
}

/** 逐个分量做 URL 编码，保留 '/' 作为分隔符。 */
function ato_update_encode_path(string $relative): string
{
    return implode('/', array_map('rawurlencode', explode('/', $relative)));
}
