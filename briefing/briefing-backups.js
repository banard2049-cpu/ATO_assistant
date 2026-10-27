// Transfer original daily archives without collecting ZIP bytes in the page.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_BRIEFING_BACKUPS = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';

  const MAX_ZIP_BYTES = 512 * 1024 * 1024;

  function bind({ canStart = () => true, onBusyChange = () => {}, onImported = () => {} } = {}) {
    const exportButton = document.getElementById('exportBackupsButton');
    const importButton = document.getElementById('importBackupsButton');
    const input = document.getElementById('backupZipInput');
    const status = document.getElementById('backupStatus');
    if (!exportButton || !importButton || !input || !status) return;
    let busy = false;

    function show(message, error = false) {
      status.hidden = !message;
      status.textContent = message;
      status.dataset.state = error ? 'error' : 'progress';
    }

    async function request(url, options) {
      const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
      let result;
      try { result = await response.json(); }
      catch (_) { throw new Error(`服务未能处理备份压缩包（HTTP ${response.status}），请检查服务的请求大小和可用空间。`); }
      if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
      return result;
    }

    function nativeTransfer(action) {
      const method = action === 'export' ? 'exportDailyBackups' : 'importDailyBackups';
      if (typeof window.ATOAndroid[method] !== 'function') {
        return Promise.reject(new Error('当前安卓程序不支持备份压缩包，请安装新版 APK 后重试。'));
      }
      return new Promise((resolve, reject) => {
        const callback = (result) => {
          if (result?.action && result.action !== action) return;
          if (window.ATOAndroidBackupsResult === callback) delete window.ATOAndroidBackupsResult;
          if (result?.ok) resolve(result);
          else if (result?.cancelled) resolve({ cancelled: true });
          else reject(new Error(result?.error || '备份操作失败，请重试。'));
        };
        window.ATOAndroidBackupsResult = callback;
        try {
          if (window.ATOAndroid[method]() === false) throw new Error('无法开始备份操作，请确认已登录且没有其他文件操作。');
        } catch (error) {
          if (window.ATOAndroidBackupsResult === callback) delete window.ATOAndroidBackupsResult;
          reject(error);
        }
      });
    }

    async function transfer(action, file) {
      if (busy || !canStart()) { show('请等待当前操作完成。'); return; }
      busy = true;
      exportButton.disabled = importButton.disabled = true;
      const button = action === 'export' ? exportButton : importButton;
      button.setAttribute('aria-busy', 'true');
      onBusyChange(true);
      show(action === 'export' ? '正在打包全部每日备份…' : '正在校验并导入备份压缩包…');
      let imported;
      try {
        if (window.ATOAndroid) {
          const result = await nativeTransfer(action);
          if (result.cancelled) show(action === 'export' ? '已取消导出。' : '已取消导入。');
          else if (action === 'export') show(`已导出全部每日备份${result.total == null ? '' : `（${result.total} 份）`}。`);
          else imported = result;
        } else if (action === 'export') {
          const result = await request('backups.php?action=prepare-export', { method: 'POST', headers: { 'X-ATO-Backup': '1' } });
          const url = new URL(result.downloadUrl, window.location.href);
          if (url.origin !== window.location.origin || !url.pathname.endsWith('/briefing/backups.php')) throw new Error('备份下载地址无效，请重试。');
          const anchor = document.createElement('a');
          anchor.href = url.href;
          anchor.download = result.filename || 'ATO-daily-backups.zip';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          show(`已开始下载全部每日备份（${result.total} 份），请在下载列表中查看。`);
        } else {
          if (!file) throw new Error('请选择备份 ZIP 文件。');
          if (!/\.zip$/i.test(file.name)) throw new Error('请选择导出的备份 ZIP 压缩包。');
          if (file.size > MAX_ZIP_BYTES) throw new Error('备份压缩包超过 512 MB，请分开迁移。');
          imported = await request('backups.php?action=import', {
            method: 'PUT', headers: { 'Content-Type': 'application/zip', 'X-ATO-Backup': '1' }, body: file,
          });
        }
        if (imported) show(`已导入 ${imported.imported || 0} 份备份，跳过 ${imported.skipped || 0} 份重复备份。`);
      } catch (error) {
        show(`${action === 'export' ? '导出' : '导入'}失败：${error?.message || String(error)}`, true);
      } finally {
        busy = false;
        exportButton.disabled = importButton.disabled = false;
        button.setAttribute('aria-busy', 'false');
        onBusyChange(false);
        input.value = '';
      }
      if (imported) await onImported(imported);
    }

    exportButton.addEventListener('click', () => transfer('export'));
    importButton.addEventListener('click', () => {
      if (busy || !canStart()) { show('请等待当前操作完成。'); return; }
      if (window.ATOAndroid) transfer('import');
      else input.click();
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) transfer('import', file);
    });
  }

  return { bind };
});
