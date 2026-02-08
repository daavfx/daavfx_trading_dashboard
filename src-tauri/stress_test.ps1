# ============================================================================
# RYCTL STRESS TEST RUNNER
# Runs thousands of semantic command tests across the CLI
# ============================================================================

param(
    [int]$Iterations = 1000,
    [string]$RyctlPath = "C:\tmp\ryctl_standalone\release\ryctl.exe",
    [switch]$Verbose,
    [switch]$ParallelMode,
    [int]$ParallelJobs = 8
)

$ErrorActionPreference = "Stop"

# ============================================================================
# COMMAND TEMPLATES - Semantic variations to test
# ============================================================================

$SemanticTemplates = @(
    # Aggressiveness scaling
    "make engine {ENGINE} {PERCENT}% more aggressive",
    "increase aggressiveness by {PERCENT}%",
    "make it {PERCENT}% stronger for group {GROUP}",
    "boost engine {ENGINE} power by {PERCENT}%",
    
    # Conservativeness 
    "make engine {ENGINE} {PERCENT}% safer",
    "reduce risk by {PERCENT}%",
    "make it {PERCENT}% more conservative for group {GROUP}",
    "play it safe on group {GROUP}",
    
    # Doubling/Halving
    "double the lot for group {GROUP}",
    "double grid for engine {ENGINE}",
    "halve the lot for groups {GROUP}-{GROUP2}",
    "half multiplier for all",
    
    # Specific field operations
    "set grid to {VALUE} for group {GROUP}",
    "increase trail by {PERCENT}%",
    "decrease multiplier by {PERCENT}%",
    "set lot to {LOT} for engine {ENGINE}",
    
    # Logic targeting
    "make power {PERCENT}% stronger",
    "boost scalper lot by {PERCENT}%",
    "reduce recovery risk by {PERCENT}%",
    
    # Multi-target
    "double lot for power groups 1-5",
    "make engine A and B {PERCENT}% more aggressive",
    "set grid to {VALUE} for all groups"
)

$QueryTemplates = @(
    "show grid for all groups",
    "show lot for engine {ENGINE}",
    "show power group {GROUP} values",
    "find high grid values",
    "show multiplier for groups {GROUP}-{GROUP2}",
    "compare engine A and B",
    "show all values for group {GROUP}"
)

$MetaCommands = @(
    "/help",
    "apply",
    "cancel"
)

# ============================================================================
# RANDOMIZATION FUNCTIONS
# ============================================================================

function Get-RandomEngine {
    return @("A", "B", "C") | Get-Random
}

function Get-RandomGroup {
    return Get-Random -Minimum 1 -Maximum 16
}

function Get-RandomPercent {
    return Get-Random -Minimum 5 -Maximum 200
}

function Get-RandomValue {
    return Get-Random -Minimum 100 -Maximum 5000
}

function Get-RandomLot {
    $lots = @(0.01, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2)
    return $lots | Get-Random
}

function Expand-Template {
    param([string]$Template)
    
    $result = $Template
    $result = $result -replace "{ENGINE}", (Get-RandomEngine)
    
    $g1 = Get-RandomGroup
    $g2 = [math]::Min(15, $g1 + (Get-Random -Minimum 1 -Maximum 5))
    $result = $result -replace "{GROUP2}", $g2
    $result = $result -replace "{GROUP}", $g1
    
    $result = $result -replace "{PERCENT}", (Get-RandomPercent)
    $result = $result -replace "{VALUE}", (Get-RandomValue)
    $result = $result -replace "{LOT}", (Get-RandomLot)
    
    return $result
}

# ============================================================================
# TEST EXECUTION
# ============================================================================

function Test-SingleCommand {
    param(
        [string]$Command,
        [string]$RyctlPath
    )
    
    $startTime = Get-Date
    
    try {
        $output = & $RyctlPath --input $Command --json 2>&1
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalMilliseconds
        
        $parsed = $output | ConvertFrom-Json -ErrorAction SilentlyContinue
        
        return @{
            Command = $Command
            Success = $true
            Status = if ($parsed) { $parsed.status } else { "unknown" }
            Duration = $duration
            CommandType = if ($parsed.parsed) { $parsed.parsed.command_type } else { "unknown" }
            Output = $output
        }
    }
    catch {
        return @{
            Command = $Command
            Success = $false
            Status = "error"
            Duration = 0
            Error = $_.Exception.Message
        }
    }
}

function Run-StressTest {
    param(
        [int]$Iterations,
        [string]$RyctlPath
    )
    
    Write-Host ""
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host "  RYCTL STRESS TEST - $Iterations ITERATIONS" -ForegroundColor Cyan
    Write-Host "============================================================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Verify ryctl exists
    if (-not (Test-Path $RyctlPath)) {
        Write-Host "[ERROR] ryctl not found at: $RyctlPath" -ForegroundColor Red
        Write-Host "Please build with: cargo build --release --bin ryctl" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "[INFO] Using CLI: $RyctlPath" -ForegroundColor Gray
    Write-Host "[INFO] Starting $Iterations iterations..." -ForegroundColor Gray
    Write-Host ""
    
    $results = @()
    $passed = 0
    $failed = 0
    $startTime = Get-Date
    
    # Progress tracking
    $progressInterval = [math]::Max(1, [math]::Floor($Iterations / 100))
    
    for ($i = 1; $i -le $Iterations; $i++) {
        # Select random command type
        $commandType = @("semantic", "semantic", "semantic", "query", "meta") | Get-Random
        
        $command = switch ($commandType) {
            "semantic" { Expand-Template ($SemanticTemplates | Get-Random) }
            "query"    { Expand-Template ($QueryTemplates | Get-Random) }
            "meta"     { $MetaCommands | Get-Random }
        }
        
        $result = Test-SingleCommand -Command $command -RyctlPath $RyctlPath
        $results += $result
        
        if ($result.Success -and $result.Status -ne "error") {
            $passed++
        } else {
            $failed++
            if ($Verbose) {
                Write-Host "[FAIL] $command" -ForegroundColor Red
                Write-Host "       Error: $($result.Error)" -ForegroundColor DarkRed
            }
        }
        
        # Progress update
        if ($i % $progressInterval -eq 0 -or $i -eq $Iterations) {
            $pct = [math]::Round(($i / $Iterations) * 100)
            $elapsed = (Get-Date) - $startTime
            $rate = [math]::Round($i / $elapsed.TotalSeconds, 1)
            Write-Host "`r[PROGRESS] $i/$Iterations ($pct%) | Pass: $passed | Fail: $failed | Rate: $rate cmd/s" -NoNewline
        }
    }
    
    Write-Host ""
    Write-Host ""
    
    $endTime = Get-Date
    $totalDuration = ($endTime - $startTime).TotalSeconds
    
    # ========================================================================
    # STATISTICS
    # ========================================================================
    
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host "  STRESS TEST RESULTS" -ForegroundColor Green
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host ""
    
    # Overall stats
    $passRate = [math]::Round(($passed / $Iterations) * 100, 2)
    
    # Calculate duration stats (handle case where Duration might not be set)
    $durations = $results | Where-Object { $_.Duration -gt 0 } | ForEach-Object { $_.Duration }
    if ($durations.Count -gt 0) {
        $avgDuration = [math]::Round(($durations | Measure-Object -Average).Average, 2)
        $maxDuration = [math]::Round(($durations | Measure-Object -Maximum).Maximum, 2)
        $minDuration = [math]::Round(($durations | Measure-Object -Minimum).Minimum, 2)
    } else {
        $avgDuration = 0
        $maxDuration = 0
        $minDuration = 0
    }
    $cmdPerSec = [math]::Round($Iterations / $totalDuration, 1)
    
    Write-Host "  Total Iterations:     $Iterations" -ForegroundColor White
    Write-Host "  Passed:               $passed ($passRate%)" -ForegroundColor Green
    Write-Host "  Failed:               $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
    Write-Host ""
    Write-Host "  Total Duration:       $([math]::Round($totalDuration, 2))s" -ForegroundColor White
    Write-Host "  Throughput:           $cmdPerSec commands/second" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Avg Command Time:     ${avgDuration}ms" -ForegroundColor White
    Write-Host "  Min Command Time:     ${minDuration}ms" -ForegroundColor White
    Write-Host "  Max Command Time:     ${maxDuration}ms" -ForegroundColor White
    Write-Host ""
    
    # Command type breakdown
    $typeStats = $results | Group-Object -Property CommandType | ForEach-Object {
        $typePass = ($_.Group | Where-Object { $_.Success -and $_.Status -ne "error" }).Count
        @{
            Type = $_.Name
            Count = $_.Count
            Passed = $typePass
            Rate = [math]::Round(($typePass / $_.Count) * 100, 1)
        }
    }
    
    Write-Host "  BY COMMAND TYPE:" -ForegroundColor Yellow
    Write-Host "  ----------------" -ForegroundColor Yellow
    foreach ($stat in $typeStats) {
        Write-Host "    $($stat.Type.PadRight(12)) : $($stat.Count.ToString().PadLeft(5)) tests | $($stat.Passed.ToString().PadLeft(5)) passed | $($stat.Rate)%" -ForegroundColor Gray
    }
    Write-Host ""
    
    # Status breakdown
    $statusStats = $results | Group-Object -Property Status | ForEach-Object {
        @{
            Status = $_.Name
            Count = $_.Count
            Pct = [math]::Round(($_.Count / $Iterations) * 100, 1)
        }
    }
    
    Write-Host "  BY STATUS:" -ForegroundColor Yellow
    Write-Host "  -----------" -ForegroundColor Yellow
    foreach ($stat in $statusStats) {
        $color = switch ($stat.Status) {
            "pass" { "Green" }
            "fail" { "Yellow" }
            "error" { "Red" }
            default { "Gray" }
        }
        Write-Host "    $($stat.Status.PadRight(12)) : $($stat.Count.ToString().PadLeft(5)) ($($stat.Pct)%)" -ForegroundColor $color
    }
    Write-Host ""
    
    # Sample failures if any
    $failures = $results | Where-Object { -not $_.Success -or $_.Status -eq "error" } | Select-Object -First 5
    if ($failures.Count -gt 0) {
        Write-Host "  SAMPLE FAILURES:" -ForegroundColor Red
        Write-Host "  -----------------" -ForegroundColor Red
        foreach ($f in $failures) {
            Write-Host "    Command: $($f.Command)" -ForegroundColor DarkRed
            Write-Host "    Error:   $($f.Error)" -ForegroundColor DarkRed
            Write-Host ""
        }
    }
    
    Write-Host "============================================================================" -ForegroundColor Green
    Write-Host ""
    
    # Save results to JSON
    $reportPath = "stress_test_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
    $report = @{
        timestamp = (Get-Date).ToString("o")
        iterations = $Iterations
        passed = $passed
        failed = $failed
        passRate = $passRate
        totalDuration = $totalDuration
        avgCommandTime = $avgDuration
        throughput = $cmdPerSec
        typeStats = $typeStats
        statusStats = $statusStats
    }
    $report | ConvertTo-Json -Depth 5 | Out-File $reportPath -Encoding UTF8
    Write-Host "[INFO] Results saved to: $reportPath" -ForegroundColor Gray
    
    return $results
}

# ============================================================================
# MAIN
# ============================================================================

Write-Host ""
Write-Host "  ____  _   _  ____ _____ _     " -ForegroundColor Magenta
Write-Host " |  _ \| | | |/ ___|_   _| |    " -ForegroundColor Magenta
Write-Host " | |_) | |_| | |     | | | |    " -ForegroundColor Magenta
Write-Host " |  _ <|  _  | |___  | | | |___ " -ForegroundColor Magenta
Write-Host " |_| \_\_| |_|\____| |_| |_____|" -ForegroundColor Magenta
Write-Host "                                 " -ForegroundColor Magenta
Write-Host "  Semantic Engine Stress Tester" -ForegroundColor Yellow
Write-Host ""

$results = Run-StressTest -Iterations $Iterations -RyctlPath $RyctlPath

Write-Host "[DONE] Stress test complete!" -ForegroundColor Green
