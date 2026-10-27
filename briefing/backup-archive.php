<?php
declare(strict_types=1);

// ZIP transport for daily archives. No ZipArchive extension or whole-ZIP buffers.
const ATO_BACKUP_MANIFEST_LIMIT = 4 * 1024 * 1024;
const ATO_BACKUP_FILE_LIMIT = 16 * 1024 * 1024;
const ATO_BACKUP_ZIP_LIMIT = 512 * 1024 * 1024;
const ATO_BACKUP_TOTAL_LIMIT = 1024 * 1024 * 1024;
const ATO_BACKUP_COUNT_LIMIT = 10000;

final class BackupArchiveException extends RuntimeException {
  public int $status;
  public function __construct(string $message, int $status = 400) { parent::__construct($message); $this->status = $status; }
}

function backup_archive_component(string $value): string {
  $component = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '-', $value), '-');
  if ($component === '') $component = 'value';
  $needsHash = $component !== $value || strlen($component) > 70;
  if (strlen($component) > 70) $component = substr($component, 0, 70);
  return $component . ($needsHash ? '-' . substr(hash('sha256', $value), 0, 8) : '');
}

function backup_archive_timestamp(string $file): int {
  // Imported names preserve millisecond precision that filesystem mtimes lose.
  if (preg_match('/^import-([0-9]{13,15})-[a-f0-9]{64}\.json$/D', basename($file), $match)
      && (int) $match[1] <= 253402300799000) return (int) $match[1];
  return max(0, (int) @filemtime($file)) * 1000;
}

function backup_archive_mkdir(string $path): void {
  if (is_link($path)) throw new BackupArchiveException('备份目录不能是链接。');
  if (!is_dir($path) && !@mkdir($path, 0770, true) && !is_dir($path)) throw new BackupArchiveException('无法创建备份目录，请检查可用空间。', 500);
}

function backup_archive_destination(string $accountRoot, array $identity): string {
  $path = $accountRoot;
  foreach (['daily', backup_archive_component($identity['profileId']), backup_archive_component($identity['cycleId']), 'day-' . backup_archive_component($identity['day'])] as $component) {
    $path .= '/' . $component;
    backup_archive_mkdir($path);
  }
  return $path;
}

function backup_archive_remove(string $path): void {
  if (is_link($path) || is_file($path)) { @unlink($path); return; }
  if (!is_dir($path)) return;
  foreach (scandir($path) ?: [] as $entry) if ($entry !== '.' && $entry !== '..') backup_archive_remove($path . DIRECTORY_SEPARATOR . $entry);
  @rmdir($path);
}

function backup_archive_write($stream, string $bytes): void {
  $offset = 0;
  while ($offset < strlen($bytes)) {
    $written = fwrite($stream, substr($bytes, $offset));
    if ($written === false || $written === 0) throw new BackupArchiveException('备份文件写入失败，请检查可用空间。', 500);
    $offset += $written;
  }
}

function backup_archive_copy($input, $output, int $limit): int {
  $total = 0;
  while (!feof($input)) {
    $chunk = fread($input, 65536);
    if ($chunk === false) throw new BackupArchiveException('无法读取备份文件。');
    $total += strlen($chunk);
    if ($total > $limit) throw new BackupArchiveException('备份压缩包或文件超过支持的大小。', 413);
    backup_archive_write($output, $chunk);
  }
  return $total;
}

function backup_archive_json(string $file, int $limit = ATO_BACKUP_FILE_LIMIT): array {
  $size = @filesize($file);
  if ($size === false || $size > $limit) throw new BackupArchiveException('单份备份超过支持的大小。', 413);
  $raw = file_get_contents($file);
  if ($raw === false) throw new BackupArchiveException('无法读取备份文件。');
  $value = json_decode($raw, true, 256);
  if (!is_array($value)) throw new BackupArchiveException('压缩包中含有无效的备份 JSON。');
  return $value;
}

function backup_archive_text($value, int $limit = 256): string {
  if (!is_string($value) || $value === '' || strlen($value) > $limit || preg_match('/[\x00-\x1f\x7f]/', $value)) throw new BackupArchiveException('备份中的战役、循环或日期信息无效。');
  return $value;
}

function backup_archive_identity(array $campaign): array {
  $dashboard = $campaign['sections']['dashboard'] ?? null;
  if (!is_array($dashboard)) throw new BackupArchiveException('备份缺少主控台数据。');
  $profileId = backup_archive_text($dashboard['activeProfileId'] ?? null);
  $profile = $dashboard['profiles'][$profileId] ?? null;
  if (!is_array($profile)) throw new BackupArchiveException('备份中的战役不存在。');
  $cycleId = backup_archive_text($profile['activeCycleId'] ?? null);
  $day = $profile['cycles'][$cycleId]['state']['day'] ?? null;
  if (!is_scalar($day)) throw new BackupArchiveException('备份缺少有效天数。');
  return ['profileId' => $profileId, 'cycleId' => $cycleId, 'day' => backup_archive_text((string) $day, 128)];
}

function backup_archive_cycle(array $identity, string $name = ''): array {
  $cycleId = $identity['cycleId'];
  return $identity + ['profileName' => $name !== '' ? $name : $identity['profileId'],
    'label' => ['c1' => '循环 I', 'c2' => '循环 II', 'c3' => '循环 III', 'c4' => '循环 IV', 'c5' => '循环 V'][$cycleId] ?? $cycleId];
}

function backup_archive_day_key(string $day): array {
  if (preg_match('#^T(\d+)(?:[/-](\d+))?$#D', $day, $matches)) return [0, (int) $matches[1], (int) ($matches[2] ?? 0)];
  if (preg_match('/^-?\d+$/D', $day)) return [1, (int) $day, 0];
  return [2, 0, 0];
}

function backup_archive_merge_cycle(array &$cycles, array $cycle): void {
  $key = $cycle['profileId'] . "\0" . $cycle['cycleId'];
  if (!isset($cycles[$key]) || backup_archive_day_key((string) $cycle['day']) > backup_archive_day_key((string) ($cycles[$key]['day'] ?? ''))) $cycles[$key] = $cycle;
}

/** A conventional deflated ZIP, streaming each source file into the destination. */
final class BackupZipWriter {
  private $stream;
  private array $directory = [];
  public function __construct(string $path) {
    $this->stream = @fopen($path, 'xb');
    if (!$this->stream) throw new BackupArchiveException('无法创建备份压缩包。', 500);
  }
  public function add(string $name, string $source): void {
    $input = fopen($source, 'rb');
    if (!$input) throw new BackupArchiveException('无法读取待导出的备份。', 500);
    $offset = ftell($this->stream);
    $flags = 0x808; // UTF-8 names and trailing data descriptor.
    backup_archive_write($this->stream, pack('VvvvvvVVVvv', 0x04034b50, 20, $flags, 8, 0, 33, 0, 0, 0, strlen($name), 0) . $name);
    $start = ftell($this->stream); $size = 0; $crc = hash_init('crc32b'); $deflater = deflate_init(ZLIB_ENCODING_RAW, ['level' => 6]);
    try {
      while (!feof($input)) {
        $chunk = fread($input, 65536);
        if ($chunk === false) throw new BackupArchiveException('读取备份失败。', 500);
        $size += strlen($chunk); hash_update($crc, $chunk);
        $compressed = deflate_add($deflater, $chunk, feof($input) ? ZLIB_FINISH : ZLIB_NO_FLUSH);
        if ($compressed === false) throw new BackupArchiveException('压缩备份失败。', 500);
        backup_archive_write($this->stream, $compressed);
      }
    } finally { fclose($input); }
    $compressedSize = ftell($this->stream) - $start; $checksum = hexdec(hash_final($crc));
    backup_archive_write($this->stream, pack('VVVV', 0x08074b50, $checksum, $compressedSize, $size));
    $this->directory[] = pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, $flags, 8, 0, 33, $checksum, $compressedSize, $size,
      strlen($name), 0, 0, 0, 0, 0, $offset) . $name;
    if (ftell($this->stream) > ATO_BACKUP_ZIP_LIMIT) throw new BackupArchiveException('备份压缩包超过 512 MB。', 413);
  }
  public function finish(): void {
    $start = ftell($this->stream);
    foreach ($this->directory as $entry) backup_archive_write($this->stream, $entry);
    $length = ftell($this->stream) - $start; $count = count($this->directory);
    backup_archive_write($this->stream, pack('VvvvvVVv', 0x06054b50, 0, 0, $count, $count, $length, $start, 0));
    fclose($this->stream); $this->stream = null;
  }
  public function __destruct() { if (is_resource($this->stream)) fclose($this->stream); }
}

/** Read central records first; never extract paths supplied by the ZIP. */
final class BackupZipReader {
  private $stream;
  public array $entries = [];
  private int $directoryOffset;
  public function __construct(string $path) {
    $size = filesize($path);
    if ($size < 22 || $size > ATO_BACKUP_ZIP_LIMIT) throw new BackupArchiveException('备份压缩包大小无效。', 413);
    $this->stream = fopen($path, 'rb');
    $tailLength = min($size, 65557); fseek($this->stream, -$tailLength, SEEK_END); $tail = $this->read($tailLength);
    $marker = strrpos($tail, "PK\x05\x06");
    if ($marker === false || strlen($tail) - $marker < 22) throw new BackupArchiveException('不是有效的 ZIP 压缩包。');
    $end = unpack('vdisk/vdirectoryDisk/vdiskCount/vcount/Vlength/Voffset/vcomment', substr($tail, $marker + 4, 18));
    if ($end['disk'] || $end['directoryDisk'] || $end['diskCount'] !== $end['count'] || $end['count'] > ATO_BACKUP_COUNT_LIMIT + 1
        || $marker + 22 + $end['comment'] !== strlen($tail)
        || $end['offset'] + $end['length'] !== $size - $tailLength + $marker) throw new BackupArchiveException('不支持分卷或 ZIP64 压缩包。');
    $this->directoryOffset = $end['offset']; fseek($this->stream, $end['offset']); $total = 0;
    for ($i = 0; $i < $end['count']; $i++) {
      $header = $this->read(46);
      if (substr($header, 0, 4) !== "PK\x01\x02") throw new BackupArchiveException('ZIP 文件目录损坏。');
      $entry = unpack('vmade/vneeded/vflags/vmethod/vtime/vdate/Vcrc/Vcompressed/Vsize/vname/vextra/vcomment/vdisk/vinternal/Vexternal/Voffset', substr($header, 4));
      $name = $this->read($entry['name']); $this->read($entry['extra'] + $entry['comment']);
      if (($entry['flags'] & 1) || !in_array($entry['method'], [0, 8], true) || $entry['disk']
          || (($entry['external'] >> 16) & 0170000) === 0120000
          || ($name !== 'manifest.json' && !preg_match('#^backups/[0-9]{8}\.json$#D', $name)) || isset($this->entries[$name])) throw new BackupArchiveException('ZIP 含有不支持、重复或不安全的文件。');
      $limit = $name === 'manifest.json' ? ATO_BACKUP_MANIFEST_LIMIT : ATO_BACKUP_FILE_LIMIT;
      if ($entry['size'] > $limit || $entry['compressed'] > ATO_BACKUP_ZIP_LIMIT || $entry['offset'] + 30 > $this->directoryOffset) throw new BackupArchiveException('ZIP 中的单份备份超过支持大小。', 413);
      $total += $entry['size']; if ($total > ATO_BACKUP_TOTAL_LIMIT) throw new BackupArchiveException('备份解压后的总大小超过 1 GB。', 413);
      $this->entries[$name] = $entry;
    }
    if (ftell($this->stream) !== $end['offset'] + $end['length'] || !isset($this->entries['manifest.json'])) throw new BackupArchiveException('备份清单缺失或 ZIP 目录损坏。');
  }
  private function read(int $length): string {
    $bytes = '';
    while (strlen($bytes) < $length) {
      $chunk = fread($this->stream, $length - strlen($bytes));
      if ($chunk === false || $chunk === '') throw new BackupArchiveException('ZIP 文件不完整。');
      $bytes .= $chunk;
    }
    return $bytes;
  }
  public function extract(string $name, string $destination): void {
    $entry = $this->entries[$name] ?? null;
    if ($entry === null) throw new BackupArchiveException('清单中的备份文件缺失。');
    fseek($this->stream, $entry['offset']); $header = $this->read(30);
    if (substr($header, 0, 4) !== "PK\x03\x04") throw new BackupArchiveException('ZIP 文件头损坏。');
    $local = unpack('vneeded/vflags/vmethod/vtime/vdate/Vcrc/Vcompressed/Vsize/vname/vextra', substr($header, 4));
    if ($this->read($local['name']) !== $name || $local['method'] !== $entry['method'] || $local['flags'] !== $entry['flags']) throw new BackupArchiveException('ZIP 目录与文件头不一致。');
    if (!($entry['flags'] & 8) && ($local['crc'] !== $entry['crc'] || $local['compressed'] !== $entry['compressed'] || $local['size'] !== $entry['size'])) throw new BackupArchiveException('ZIP 目录与文件大小不一致。');
    $this->read($local['extra']);
    if (ftell($this->stream) + $entry['compressed'] > $this->directoryOffset) throw new BackupArchiveException('ZIP 文件边界无效。');
    $out = fopen($destination, 'xb'); if (!$out) throw new BackupArchiveException('无法暂存导入的备份。', 500);
    $crc = hash_init('crc32b'); $length = 0; $remaining = $entry['compressed'];
    $inflater = $entry['method'] === 8 ? inflate_init(ZLIB_ENCODING_RAW) : null;
    try {
      while ($remaining > 0) {
        // Small compressed chunks keep high-ratio input from allocating a huge buffer.
        $chunk = $this->read(min($remaining, 1024)); $remaining -= strlen($chunk);
        $raw = $inflater ? @inflate_add($inflater, $chunk, $remaining === 0 ? ZLIB_FINISH : ZLIB_SYNC_FLUSH) : $chunk;
        if ($raw === false) throw new BackupArchiveException('ZIP 备份解压失败。');
        $length += strlen($raw);
        if ($length > $entry['size']) throw new BackupArchiveException('ZIP 备份实际大小与目录不一致。', 413);
        hash_update($crc, $raw); backup_archive_write($out, $raw);
      }
      if ($length !== $entry['size'] || hexdec(hash_final($crc)) !== $entry['crc']
          || ($inflater && (inflate_get_status($inflater) !== ZLIB_STREAM_END || inflate_get_read_len($inflater) !== $entry['compressed']))) throw new BackupArchiveException('ZIP 备份校验失败。');
    } finally { fclose($out); }
  }
  public function __destruct() { if (is_resource($this->stream)) fclose($this->stream); }
}

function backup_archive_daily_files(string $accountRoot): array {
  $daily = $accountRoot . '/daily'; if (is_link($daily)) throw new BackupArchiveException('备份目录不能是链接。');
  if (!is_dir($daily)) return [];
  $files = [];
  $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($daily, FilesystemIterator::SKIP_DOTS));
  foreach ($iterator as $file) {
    if ($file->isLink()) throw new BackupArchiveException('备份目录包含链接，无法导出。');
    if (!$file->isFile() || strtolower($file->getExtension()) !== 'json') continue;
    $relative = substr($file->getPathname(), strlen($daily) + 1);
    if (count(preg_split('#[\\\\/]#', $relative)) !== 4) continue;
    $files[] = $file->getPathname();
    if (count($files) > ATO_BACKUP_COUNT_LIMIT) throw new BackupArchiveException('每日备份超过 10000 份。', 413);
  }
  sort($files, SORT_STRING); return $files;
}

function backup_archive_export(string $accountRoot, string $stage): array {
  $files = backup_archive_daily_files($accountRoot);
  if (!$files) throw new BackupArchiveException('当前账号还没有每日备份。', 404);
  $entries = []; $cycles = []; $total = 0;
  $writer = new BackupZipWriter($stage . '/backups.zip');
  foreach ($files as $index => $source) {
    $copy = $stage . '/snapshot.json';
    $input = fopen($source, 'rb'); $output = fopen($copy, 'wb');
    try { $total += backup_archive_copy($input, $output, ATO_BACKUP_FILE_LIMIT); }
    finally { fclose($input); fclose($output); }
    if ($total > ATO_BACKUP_TOTAL_LIMIT) throw new BackupArchiveException('备份总大小超过 1 GB。', 413);
    $campaign = backup_archive_json($copy); $identity = backup_archive_identity($campaign);
    $expectedDirectory = backup_archive_component($identity['profileId']) . '/' . backup_archive_component($identity['cycleId']) . '/day-' . backup_archive_component($identity['day']);
    $actualDirectory = str_replace('\\', '/', substr(dirname($source), strlen($accountRoot . '/daily') + 1));
    if ($actualDirectory !== $expectedDirectory) throw new BackupArchiveException('每日备份目录与实际战役、循环或日期不一致。');
    $profile = $campaign['sections']['dashboard']['profiles'][$identity['profileId']];
    $cycle = backup_archive_cycle($identity, is_string($profile['name'] ?? null) ? $profile['name'] : '');
    backup_archive_merge_cycle($cycles, $cycle);
    unset($campaign, $profile);
    $file = sprintf('backups/%08d.json', $index + 1);
    $entries[] = $identity + ['file' => $file, 'sha256' => hash_file('sha256', $copy), 'timestamp' => backup_archive_timestamp($source)];
    $writer->add($file, $copy); unlink($copy);
  }
  $manifest = ['format' => 'ato-daily-backups', 'version' => 1, 'createdAt' => gmdate('c'), 'cycles' => array_values($cycles), 'entries' => $entries];
  $json = json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
  if (strlen($json) > ATO_BACKUP_MANIFEST_LIMIT) throw new BackupArchiveException('备份清单超过支持的大小。', 413);
  file_put_contents($stage . '/manifest.json', $json); $writer->add('manifest.json', $stage . '/manifest.json'); $writer->finish();
  unlink($stage . '/manifest.json');
  return ['total' => count($entries), 'cycles' => array_values($cycles)];
}

function backup_archive_import(string $zipFile, string $accountRoot, string $stage): array {
  $zip = new BackupZipReader($zipFile); $zip->extract('manifest.json', $stage . '/manifest.json');
  $manifest = backup_archive_json($stage . '/manifest.json', ATO_BACKUP_MANIFEST_LIMIT);
  if (($manifest['format'] ?? null) !== 'ato-daily-backups' || ($manifest['version'] ?? null) !== 1 || !is_array($manifest['entries'] ?? null)
      || !array_is_list($manifest['entries']) || !is_array($manifest['cycles'] ?? null) || !array_is_list($manifest['cycles'])
      || count($manifest['entries']) > ATO_BACKUP_COUNT_LIMIT || count($manifest['entries']) !== count($zip->entries) - 1) throw new BackupArchiveException('不是支持的每日备份压缩包。');
  $validated = []; $names = []; $cycles = [];
  foreach ($manifest['entries'] as $index => $entry) {
    if (!is_array($entry) || !is_string($entry['file'] ?? null) || !preg_match('#^backups/[0-9]{8}\.json$#D', $entry['file'])
        || isset($names[$entry['file']]) || !is_string($entry['sha256'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $entry['sha256'])
        || !is_int($entry['timestamp'] ?? null) || $entry['timestamp'] < 0 || $entry['timestamp'] > 253402300799000) throw new BackupArchiveException('每日备份清单无效。');
    $names[$entry['file']] = true; $file = $stage . '/entry-' . $index . '.json'; $zip->extract($entry['file'], $file);
    if (!hash_equals($entry['sha256'], hash_file('sha256', $file))) throw new BackupArchiveException('每日备份内容校验失败。');
    $campaign = backup_archive_json($file); $identity = backup_archive_identity($campaign);
    foreach ($identity as $key => $value) if (($entry[$key] ?? null) !== $value) throw new BackupArchiveException('备份清单与实际战役、循环或日期不一致。');
    $profile = $campaign['sections']['dashboard']['profiles'][$identity['profileId']];
    backup_archive_merge_cycle($cycles, backup_archive_cycle($identity, is_string($profile['name'] ?? null) ? $profile['name'] : ''));
    $validated[] = $entry + ['staged' => $file]; unset($campaign, $profile);
  }
  // Complete validation precedes the first write to the user's archive tree.
  $known = [];
  foreach (backup_archive_daily_files($accountRoot) as $path) $known[hash_file('sha256', $path)] = true;
  $added = []; $skipped = 0; $catalogPath = $accountRoot . '/briefing-catalog.json';
  if (is_link($catalogPath)) throw new BackupArchiveException('备份清单不能是链接。');
  $catalog = is_file($catalogPath) ? backup_archive_json($catalogPath, ATO_BACKUP_MANIFEST_LIMIT) : ['cycles' => []];
  $merged = [];
  foreach (is_array($catalog['cycles'] ?? null) ? $catalog['cycles'] : [] as $cycle) if (is_array($cycle) && is_string($cycle['profileId'] ?? null) && is_string($cycle['cycleId'] ?? null)) $merged[$cycle['profileId'] . "\0" . $cycle['cycleId']] = $cycle;
  foreach ($cycles as $cycle) backup_archive_merge_cycle($merged, $cycle);
  $catalogBytes = json_encode(['cycles' => array_values($merged)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
  if (strlen($catalogBytes) > ATO_BACKUP_MANIFEST_LIMIT) throw new BackupArchiveException('备份战役清单过大。', 413);
  try {
    foreach ($validated as $entry) {
      if (isset($known[$entry['sha256']])) { $skipped++; continue; }
      $directory = backup_archive_destination($accountRoot, $entry);
      $target = $directory . '/import-' . sprintf('%013d', $entry['timestamp']) . '-' . $entry['sha256'] . '.json';
      // Never replace a pre-existing file, even if it has an unexpected name.
      if (file_exists($target)) throw new BackupArchiveException('目标备份已存在且内容不同，导入已取消。', 409);
      if (!@rename($entry['staged'], $target)) throw new BackupArchiveException('保存导入的备份失败。', 500);
      $added[] = $target;
      if (!@touch($target, intdiv($entry['timestamp'], 1000))) throw new BackupArchiveException('无法保存备份时间。', 500);
      $known[$entry['sha256']] = true;
    }
    $catalogTemp = $accountRoot . '/.catalog-' . bin2hex(random_bytes(8)) . '.tmp';
    if (file_put_contents($catalogTemp, $catalogBytes, LOCK_EX) !== strlen($catalogBytes) || !@rename($catalogTemp, $catalogPath)) {
      @unlink($catalogTemp); throw new BackupArchiveException('无法保存导入的战役清单。', 500);
    }
  } catch (Throwable $error) { foreach ($added as $path) @unlink($path); throw $error; }
  return ['ok' => true, 'imported' => count($added), 'skipped' => $skipped, 'total' => count($validated), 'cycles' => array_values($cycles)];
}
