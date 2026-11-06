# Summarize matrix choices via DeepSeek API
# Usage: powershell -ExecutionPolicy Bypass -File tools\summarize-matrix.ps1
# Draft output only; apply reviewed summaries to record/matrix-data.js.

# ==================== Config ====================
$DEEPSEEK_API_KEY = $env:DEEPSEEK_API_KEY
$MODEL = "deepseek-chat"
$API_URL = "https://api.deepseek.com/chat/completions"
$OUTPUT_FILE = "tools\matrix-summaries.json"
$DELAY_MS = 500
# ================================================

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $DEEPSEEK_API_KEY) {
    throw "请先设置 DEEPSEEK_API_KEY 环境变量"
}

$matrixSource = Get-Content -Path "record\matrix-data.js" -Raw -Encoding UTF8
$matrixJson = $matrixSource -replace '^[\s\S]*?window\.ATO_MATRIX_DATA\s*=\s*', '' -replace ';\s*$', ''
$matrixData = $matrixJson | ConvertFrom-Json
$cells = @($matrixData.PSObject.Properties)

Write-Host ("Total cells: " + $cells.Count)

$results = @{}
if (Test-Path $OUTPUT_FILE) {
    try {
        $existing = Get-Content -Path $OUTPUT_FILE -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($prop in $existing.PSObject.Properties) {
            $results[$prop.Name] = $prop.Value
        }
        Write-Host ("Existing results: " + $results.Count + ", skipping those")
    } catch {
        $results = @{}
    }
}

$done = 0
$skipped = 0
$errors = 0

foreach ($cell in $cells) {
    $code = $cell.Name

    if ($results.ContainsKey($code)) {
        $skipped++
        continue
    }

    $notes = @($cell.Value.sources)

    if ($notes.Count -eq 0) {
        $skipped++
        continue
    }

    $notesText = $notes -join [char]10

    $promptText = "You are a board game assistant for Aeon Trespass: Odyssey. Here are all source references for choice matrix cell " + $code + ":" + [char]10 + "---" + [char]10 + $notesText + [char]10 + "---" + [char]10 + "Please summarize in one short Chinese sentence: what key choice or event does marking this cell represent? Only answer with the summary, no explanation."

    $bodyObj = @{
        model = $MODEL
        messages = @(@{ role = "user"; content = $promptText })
        temperature = 0.3
        max_tokens = 200
    }
    $bodyJson = $bodyObj | ConvertTo-Json -Depth 4 -Compress

    try {
        $headers = @{
            "Content-Type" = "application/json; charset=utf-8"
            "Authorization" = "Bearer $DEEPSEEK_API_KEY"
        }
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
        $response = Invoke-RestMethod -Uri $API_URL -Method Post -Headers $headers -Body $bodyBytes

        $summary = $response.choices[0].message.content.Trim()
        $results[$code] = $summary
        $done++
        $total = $done + $skipped
        Write-Host ("[$total/" + $cells.Count + "] " + $code + ": " + $summary)
    } catch {
        $errors++
        $errMsg = $_.Exception.Message
        Write-Host ("[ERROR] " + $code + ": " + $errMsg) -ForegroundColor Red
        $results[$code] = "[ERROR] $errMsg"
    }

    $results | ConvertTo-Json -Depth 2 | Out-File -FilePath $OUTPUT_FILE -Encoding utf8NoBOM
    Start-Sleep -Milliseconds $DELAY_MS
}

Write-Host ""
Write-Host ("Done! Success: $done, Skipped: $skipped, Errors: $errors")
Write-Host ("Output: $OUTPUT_FILE")
