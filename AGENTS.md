# ATO Assistant 仓库维护说明

## Windows 双击 `start-windows.bat` 弹出安全警告

2026-11-27 在 Windows 上核实过一次「打开文件 - 安全警告 / 无法验证发布者」。目标是恢复原 BAT 的双击启动。该文件没有 `Zone.Identifier` 数据流，但从工作区继承了 NTFS 的低完整性标签。Windows 将它判为 Internet 区域，附件安全检查返回 `S_FALSE`（提示）。恢复该文件的 `Medium` 标签后，独立进程复查得到本地计算机区域（`0`）及 `S_OK`（允许打开）。

### 排查

在仓库根目录运行 PowerShell。

```powershell
$batch = (Resolve-Path -LiteralPath '.\start-windows.bat').ProviderPath
Get-Item -LiteralPath $batch -Stream *
icacls.exe $batch
```

- 有 `Zone.Identifier` 时先确认文件来源和区号。对已确认可信且带下载标记的副本，可使用 `Unblock-File -LiteralPath $batch` 单独解除标记。
- 只有 `:$DATA` 且 `icacls` 显示 `Low Mandatory Level` 时，使用下面的单文件修复。BAT 的内容和作者注释无法改变资源管理器的发布者验证。此修复也适用于同一个文件被工作区重新标成 `Low` 的情况。

### 修复并验证

先试 `icacls.exe $batch /setintegritylevel M`。若返回 `Access is denied` 且当前账号是该文件的所有者，使用下面的 PowerShell。之前在 Codex 里需要通过单次 `require_escalated` 在沙箱外执行，因为沙箱内无法修改这个文件的访问控制列表。脚本临时给所有者补足 `WRITE_OWNER`，随后在 `finally` 恢复原访问权限。

```powershell
$ErrorActionPreference = 'Stop'
$batch = (Resolve-Path -LiteralPath '.\start-windows.bat').ProviderPath
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$section = [System.Security.AccessControl.AccessControlSections]::Access
$originalAcl = Get-Acl -LiteralPath $batch
if ($originalAcl.Owner -ine $identity.Name) {
    throw '请用这个 BAT 的文件所有者账号执行。'
}
$originalAccess = $originalAcl.GetSecurityDescriptorSddlForm($section)
$originalHash = (Get-FileHash -LiteralPath $batch).Hash

try {
    icacls.exe $batch /grant ('*' + $identity.User.Value + ':(WO)')
    if ($LASTEXITCODE -ne 0) { throw '无法临时授予 WRITE_OWNER。' }
    icacls.exe $batch /setintegritylevel M
    if ($LASTEXITCODE -ne 0) { throw '无法设置 Medium 完整性标签。' }
} finally {
    $acl = Get-Acl -LiteralPath $batch
    if ($acl.GetSecurityDescriptorSddlForm($section) -cne $originalAccess) {
        $acl.SetSecurityDescriptorSddlForm($originalAccess, $section)
        Set-Acl -LiteralPath $batch -AclObject $acl
    }
    if ((Get-Acl -LiteralPath $batch).GetSecurityDescriptorSddlForm($section) -cne $originalAccess) {
        throw '原访问权限未恢复。'
    }
}

if ((Get-FileHash -LiteralPath $batch).Hash -ne $originalHash) {
    throw 'BAT 文件内容发生了变化。'
}
icacls.exe $batch
```

确认 `icacls` 显示 `Medium Mandatory Level`。可通过双击原 BAT 验证，或在新进程中对原路径运行 `IAttachmentExecute::CheckPolicy`（用文件路径设置 `SetLocalPath`，用对应的 `file:` URI 设置 `SetSource`）。预期返回 `S_OK`。若同时检查 `MapUrlToZone`，使用新进程以避免读到旧的区域判定。修复范围限于受影响的单个 BAT，保留工作区的目录标签和 Windows 全局安全设置。

[微软 icacls 文档](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls) · [微软附件安全检查文档](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-iattachmentexecute-checkpolicy)
