[CmdletBinding()]
param(
    [switch]$Execute
)

$ErrorActionPreference = "Stop"
$releaseRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $releaseRoot
$patchArchive = Join-Path $PSScriptRoot "source.patch.gz"
$patchPath = Join-Path ([System.IO.Path]::GetTempPath()) ("txzz-5.8.0-rollback-" + [guid]::NewGuid().ToString("N") + ".patch")
$baselineCommit = "ca66ea183bc12108ab4495352128de57cad70a18"
$latestCrx = "releases/tangxin-zhizhe-latest.crx"
$versionedCrx = Join-Path $repositoryRoot "releases\tangxin-zhizhe-5.8.0.crx"

if (-not (Test-Path -LiteralPath $patchArchive -PathType Leaf)) {
    throw "Missing rollback patch archive: $patchArchive"
}

$archiveStream = [System.IO.File]::OpenRead($patchArchive)
$gzipStream = New-Object System.IO.Compression.GZipStream($archiveStream, [System.IO.Compression.CompressionMode]::Decompress)
$patchStream = [System.IO.File]::Create($patchPath)
try {
    $gzipStream.CopyTo($patchStream)
} finally {
    $patchStream.Dispose()
    $gzipStream.Dispose()
    $archiveStream.Dispose()
}

Push-Location $repositoryRoot
try {
    $currentVersion = (Get-Content -LiteralPath "manifest.json" -Raw -Encoding UTF8 | ConvertFrom-Json).version
    if ($currentVersion -ne "5.8.0") {
        throw "Current version is $currentVersion; expected 5.8.0."
    }

    & git cat-file -e "${baselineCommit}:$latestCrx"
    if ($LASTEXITCODE -ne 0) { throw "Baseline is missing $latestCrx." }

    # Verify reverse application first so later user edits are never overwritten silently.
    & git apply --reverse --check --whitespace=nowarn $patchPath
    if ($LASTEXITCODE -ne 0) { throw "Rollback preflight failed; the workspace does not match release 5.8.0." }

    if (-not $Execute) {
        Write-Output "ROLLBACK_CHECK_OK baseline=$baselineCommit version=5.8.0"
        Write-Output "Run again with -Execute to reverse the source patch and restore the prior latest CRX."
        return
    }

    & git apply --reverse --whitespace=nowarn $patchPath
    if ($LASTEXITCODE -ne 0) { throw "Reverse source patch failed." }
    & git restore --source=$baselineCommit -- $latestCrx
    if ($LASTEXITCODE -ne 0) { throw "Restoring the prior latest CRX failed." }
    if (Test-Path -LiteralPath $versionedCrx -PathType Leaf) {
        Remove-Item -LiteralPath $versionedCrx -Force
    }
    Write-Output "ROLLBACK_APPLIED baseline=$baselineCommit"
} finally {
    Pop-Location
    if (Test-Path -LiteralPath $patchPath -PathType Leaf) {
        Remove-Item -LiteralPath $patchPath -Force
    }
}
