# Summarize matrix choices via DeepSeek API
# Usage: powershell -ExecutionPolicy Bypass -File tools\summarize-matrix.ps1

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

$html = Get-Content -Path "record\index.html" -Raw -Encoding UTF8
$startMarker = "const choiceMatrixNotes = {"
$startIdx = $html.IndexOf($startMarker)
$endMarker = [char]10 + "    };"
$endIdx = $html.IndexOf($endMarker, $startIdx)
$block = $html.Substring($startIdx + $startMarker.Length - 1, $endIdx - $startIdx - $startMarker.Length + 3)

$pattern = [regex]'"([A-Z]{1,2}\d{1,2})"\s*:\s*\[([\s\S]*?)\]'
$allMatches = $pattern.Matches($block)

Write-Host ("Total cells: " + $allMatches.Count)

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

foreach ($m in $allMatches) {
    $code = $m.Groups[1].Value
    $notesRaw = $m.Groups[2].Value

    if ($results.ContainsKey($code)) {
        $skipped++
        continue
    }

    $notePattern = [regex]'"([^"]+)"'
    $noteHits = $notePattern.Matches($notesRaw)
    $notes = @()
    foreach ($nm in $noteHits) {
        $notes += $nm.Groups[1].Value
    }

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
        Write-Host ("[$total/" + $allMatches.Count + "] " + $code + ": " + $summary)
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
