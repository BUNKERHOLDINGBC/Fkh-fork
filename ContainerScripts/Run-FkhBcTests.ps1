[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $RequestBase64
)

$ErrorActionPreference = 'Stop'

try {
    $requestJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RequestBase64))
    $request = $requestJson | ConvertFrom-Json
} catch {
    throw 'The test request is invalid.'
}

$timeoutMinutes = [int]$request.TimeoutMinutes
if ($timeoutMinutes -lt 1 -or $timeoutMinutes -gt 120) {
    throw 'The test timeout must be between 1 and 120 minutes.'
}

$operationId = [Guid]::NewGuid().ToString('N')
$basePath = "C:\run\my\fkh-runtests-$operationId"
$resultPath = "$basePath.xml"
$stdoutPath = "$basePath.stdout"
$stderrPath = "$basePath.stderr"
$workerPath = 'C:\run\my\Invoke-FkhBcTests.ps1'
$process = $null

try {
    if (-not (Test-Path -LiteralPath $workerPath -PathType Leaf)) {
        throw "The FKH test worker is missing at '$workerPath'."
    }

    $process = Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $workerPath, '-RequestBase64', $RequestBase64, '-ResultPath', $resultPath) `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru `
        -WindowStyle Hidden

    if (-not $process.WaitForExit($timeoutMinutes * 60 * 1000)) {
        try {
            $process.Kill($true)
        } catch {
            $process.Kill()
        }
        throw "Business Central test execution timed out after $timeoutMinutes minute(s)."
    }
    $process.WaitForExit()

    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
    if ($process.ExitCode -ne 0) {
        $message = if ([string]::IsNullOrWhiteSpace($stderr)) { 'The test worker failed without diagnostics.' } else { $stderr.Trim() }
        throw $message
    }
    if (-not [string]::IsNullOrWhiteSpace($stderr)) {
        throw $stderr.Trim()
    }

    Write-Output $stdout.TrimEnd()
} finally {
    if ($null -ne $process) {
        $process.Dispose()
    }
    Remove-Item -LiteralPath $resultPath, $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
}