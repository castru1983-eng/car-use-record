# ============================================================
# Car-Use Record 自動定期備份腳本
# 執行時機：每月 1 號自動執行 (或隨時手動執行)
# 雙重備份：本機雙路徑 (D:\CarBackup + 專案備份) + Google Drive 雲端
# ============================================================

$API_URL       = "https://car-use-record.vercel.app/api/sync"
$SUPABASE_URL  = 'https://lhvzyxyxwtitkkrhtcmh.supabase.co/rest/v1/system_state?id=eq.main&select=*'
$SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxodnp5eHl4d3RpdGtrcmh0Y21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1NDU3NDYsImV4cCI6MjEwMzEyMTc0Nn0.77OW-QTI3-RVJkATEzBiHR-PL79RWq5Ka7ckM-INm9w"

# 本機路徑 (使用 PSScriptRoot 避免中文路徑編碼問題)
$PRIMARY_DIR   = "D:\CarBackup"
$PROJECT_DIR   = Join-Path $PSScriptRoot "backups"
$LOG_FILE      = Join-Path $PRIMARY_DIR "backup-log.txt"
$PROJ_LOG      = Join-Path $PSScriptRoot "backup-log.txt"

# Google Drive 雲端路徑 (透過 rclone)
$GDRIVE_REMOTE = "gdrive:car-use-record-backups"

# 尋找 rclone 執行檔
$RCLONE_PATH   = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "rclone.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName)
if (-not $RCLONE_PATH) { $RCLONE_PATH = "rclone" }

# 確保目錄存在
if (-not (Test-Path $PRIMARY_DIR)) { New-Item -ItemType Directory -Path $PRIMARY_DIR -Force | Out-Null }
if (-not (Test-Path $PROJECT_DIR)) { New-Item -ItemType Directory -Path $PROJECT_DIR -Force | Out-Null }

function Write-Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $msg"
    Write-Host $line
    try {
        [System.IO.File]::AppendAllText($LOG_FILE, "$line`r`n", [System.Text.Encoding]::UTF8)
        [System.IO.File]::AppendAllText($PROJ_LOG, "$line`r`n", [System.Text.Encoding]::UTF8)
    } catch {}
}

$DATE_TAG    = Get-Date -Format "yyyy-MM"
$FILENAME    = "backup_${DATE_TAG}.json"
$LOCAL_FILE  = Join-Path $PRIMARY_DIR $FILENAME
$PROJ_FILE   = Join-Path $PROJECT_DIR $FILENAME
$LATEST_FILE = Join-Path $PROJECT_DIR "backup_latest.json"

Write-Log "===== 開始定期備份作業 (月份: $DATE_TAG) ====="

# Step 1: 從 API 拉取最新資料 (含 Supabase 雙重備援)
$backupData = $null
Write-Log "正在拉取最新資料：$API_URL"
try {
    $resp = Invoke-WebRequest -Uri $API_URL -UseBasicParsing -TimeoutSec 20
    if ($resp.StatusCode -eq 200) {
        $backupData = $resp.Content | ConvertFrom-Json
        Write-Log "OK: 從 Vercel API 取得資料成功"
    }
} catch {
    Write-Log "WARN: Vercel API 未回應，切換至 Supabase 直接備援拉取..."
}

if (-not $backupData -or -not $backupData.state) {
    try {
        $headers = @{
            'apikey' = $SUPABASE_KEY;
            'Authorization' = "Bearer $SUPABASE_KEY"
        }
        $supa = Invoke-RestMethod -Uri $SUPABASE_URL -Headers $headers -TimeoutSec 20
        if ($supa -and $supa.Count -gt 0 -and $supa[0].state) {
            $backupData = @{
                success   = $true;
                db        = "supabase_direct";
                state     = $supa[0].state;
                timestamp = $supa[0].timestamp
            }
            Write-Log "OK: 從 Supabase 直接讀取備份資料成功！"
        }
    } catch {
        Write-Log "FAIL: Supabase 備援讀取亦失敗：$($_.Exception.Message)"
    }
}

if (-not $backupData -or -not $backupData.state) {
    Write-Log "CRITICAL: 資料拉取全部失敗，終止備份。"
    exit 1
}

# Step 2: 雙路徑本機寫入儲存
try {
    $prettyJson = $backupData | ConvertTo-Json -Depth 25
    [System.IO.File]::WriteAllText($LOCAL_FILE, $prettyJson, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($PROJ_FILE, $prettyJson, [System.Text.Encoding]::UTF8)
    [System.IO.File]::WriteAllText($LATEST_FILE, $prettyJson, [System.Text.Encoding]::UTF8)
    
    $recCount  = if ($backupData.state.records) { $backupData.state.records.Count } else { 0 }
    $fuelCount = if ($backupData.state.fuelTransactions) { $backupData.state.fuelTransactions.Count } else { 0 }
    Write-Log "OK: 本機雙重備份成功！簽到: $recCount 筆，加油: $fuelCount 筆"
    Write-Log "  - 主備份路徑: $LOCAL_FILE"
    Write-Log "  - 專案備份路徑: $PROJ_FILE"
} catch {
    Write-Log "FAIL: 本機寫入失敗：$($_.Exception.Message)"
    exit 1
}

# Step 3: 上傳至 Google Drive 雲端備份
Write-Log "正在上傳至 Google Drive ($GDRIVE_REMOTE) ..."
try {
    $r1 = & "$RCLONE_PATH" copy "$LOCAL_FILE" "$GDRIVE_REMOTE/" --contimeout 10s --timeout 30s 2>&1 | Out-String
    $r2 = & "$RCLONE_PATH" copy "$LATEST_FILE" "$GDRIVE_REMOTE/" --contimeout 10s --timeout 30s 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
        Write-Log "OK: Google Drive 雲端備份上傳完成：$GDRIVE_REMOTE/$FILENAME"
    } else {
        Write-Log "WARN: Google Drive 上傳警告：$r1"
    }
} catch {
    Write-Log "FAIL: Google Drive 上傳失敗：$($_.Exception.Message)"
}

Write-Log "===== 備份作業順利完成 ====="
