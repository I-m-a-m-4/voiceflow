$ErrorActionPreference = "Stop"

$downloads = "C:\Users\Bello Imam\Downloads"
$packDir = Join-Path $downloads "VoiceflowPack"
$extractDir = Join-Path $downloads "VoiceflowExtract"

# 1. Locate the latest MSI
$msiFile = Get-ChildItem -Path (Join-Path $downloads "voiceflow_*_x64_en-US.msi") | 
           Sort-Object LastWriteTime -Descending | 
           Select-Object -First 1

if (-not $msiFile) {
    Write-Error "No Voiceflow MSI found in $downloads"
    exit 1
}

Write-Host "Found MSI: $($msiFile.FullName)"
if ($msiFile.Name -match "voiceflow_([0-9\.]+)_x64_en-US\.msi") {
    $version = $Matches[1]
} else {
    Write-Error "Could not parse version from $($msiFile.Name)"
    exit 1
}
Write-Host "Version: $version"

# 2. Extract MSI in quiet mode
if (Test-Path $extractDir) {
    Remove-Item -Path $extractDir -Recurse -Force
}

$msiPath = $msiFile.FullName
$argList = "/a `"$msiPath`" /qn TARGETDIR=`"$extractDir`""
Write-Host "Extracting via msiexec..."
$proc = Start-Process msiexec.exe -ArgumentList $argList -NoNewWindow -Wait -PassThru

if ($proc.ExitCode -ne 0) {
    Write-Error "msiexec extraction failed with exit code $($proc.ExitCode)"
    exit 1
}

$extractedExe = Join-Path $extractDir "PFiles\voiceflow\app.exe"
if (-not (Test-Path $extractedExe)) {
    Write-Error "Extracted app.exe not found at $extractedExe"
    exit 1
}

# 3. Update the MSIX packing folder
$destExe = Join-Path $packDir "app.exe"
Copy-Item -Path $extractedExe -Destination $destExe -Force
Write-Host "Successfully replaced $destExe"

# 4. Clean up temporary extraction folder
Remove-Item -Path $extractDir -Recurse -Force
Write-Host "Cleaned up temporary extraction directory"

# 5. Verify / Update AppxManifest.xml version
$manifestPath = Join-Path $packDir "AppxManifest.xml"
$repoManifest = Join-Path $PSScriptRoot "..\store-assets\AppxManifest.xml"
if (Test-Path $repoManifest) {
    Copy-Item -Path $repoManifest -Destination $manifestPath -Force
}

if (Test-Path $manifestPath) {
    $manifestContent = Get-Content $manifestPath -Raw
    # Update only the <Identity ... Version="..." /> attribute using lookbehind/lookahead
    $manifestContent = [regex]::Replace($manifestContent, '(?<=<Identity\b[^>]*?\bVersion=")[0-9\.]+(?=")', "$version.0")
    # Ensure MinVersion is at least 10.0.17763.0 (must be >= 10.0.17763.0 for Microsoft Store)
    $manifestContent = [regex]::Replace($manifestContent, '(?<=<TargetDeviceFamily\b[^>]*?\bMinVersion=")[0-9\.]+(?=")', "10.0.17763.0")
    Set-Content -Path $manifestPath -Value $manifestContent -NoNewline
    Write-Host "AppxManifest.xml set to Version=`"$version.0`" with MinVersion=`"10.0.17763.0`""
}

# 6. Pack to MSIX using MSIXHeroCLI
$outMsix = Join-Path $downloads "VoiceflowPack_$version.msix"
if (Test-Path $outMsix) {
    Remove-Item -Path $outMsix -Force
}
Write-Host "Packing to $outMsix using MSIXHeroCLI..."

& MSIXHeroCLI.exe pack -d "$packDir" -p "$outMsix"

if ($LASTEXITCODE -ne 0) {
    Write-Error "MSIXHeroCLI failed with exit code $LASTEXITCODE"
    exit 1
}

if (Test-Path $outMsix) {
    $msixItem = Get-Item $outMsix
    Write-Host "SUCCESS: MSIX package created successfully at $($msixItem.FullName) ($([math]::Round($msixItem.Length / 1MB, 2)) MB)"
} else {
    Write-Error "MSIX packaging failed, $outMsix not found"
    exit 1
}
