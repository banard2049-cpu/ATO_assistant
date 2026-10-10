<?php
declare(strict_types=1);

// Only public card image names are returned. No session or save files are read.
// This replaces hundreds of HTTP requests for guessed, mostly absent card names.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'This endpoint requires GET.']);
    exit;
}
$root = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'aibp' . DIRECTORY_SEPARATOR . 'ps';
$images = [];
$resolvedRoot = realpath($root);
$directories = ['other', 'other/trait'];
if (is_dir($root)) {
    foreach (new DirectoryIterator($root) as $entry) {
        if ($entry->isDir() && !$entry->isLink()
            && preg_match('/^[A-Z][A-Z0-9_]+$/D', $entry->getFilename())) {
            $directories[] = $entry->getFilename();
        }
    }
}
foreach ($directories as $relative) {
    $directory = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    if (!is_dir($directory) || is_link($directory)) continue;
    $resolvedDirectory = realpath($directory);
    if ($resolvedRoot === false || $resolvedDirectory === false
        || !str_starts_with($resolvedDirectory, $resolvedRoot . DIRECTORY_SEPARATOR)) continue;
    foreach (new DirectoryIterator($directory) as $entry) {
        if (!$entry->isFile() || $entry->isLink()) continue;
        $name = $entry->getFilename();
        if (!preg_match('/\.(jpg|jpeg|png)$/iD', $name)) continue;
        $images[] = 'ps/' . $relative . '/' . $name;
    }
}
sort($images, SORT_STRING);
echo json_encode(['ok' => true, 'version' => 1, 'images' => $images],
    JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
