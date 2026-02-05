# 파일 변경 시 자동 커밋 (PowerShell)
# 실행: .\auto-commit.ps1
# 종료: Ctrl+C

Set-Location $PSScriptRoot

Write-Host "자동 커밋 시작 (30초마다 확인, 종료: Ctrl+C)" -ForegroundColor Green
Write-Host "저장소: https://github.com/hoonsung0123-ai/airpot_2" -ForegroundColor Cyan

while ($true) {
    $status = git status --porcelain
    
    if ($status) {
        git add -A
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        git commit -m "auto: $timestamp"
        
        $time = Get-Date -Format "HH:mm:ss"
        Write-Host "[$time] 커밋됨" -ForegroundColor Yellow
        
        # 푸시 시도
        $pushResult = git push origin main 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[$time] 푸시됨" -ForegroundColor Green
        } else {
            Write-Host "[$time] 푸시 실패 - 인증 또는 네트워크 확인 필요" -ForegroundColor Red
        }
    }
    
    Start-Sleep -Seconds 30
}
