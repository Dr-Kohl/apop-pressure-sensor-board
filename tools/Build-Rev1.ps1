param([switch]$Upload,[string]$Port='COM44',[string]$CliPath)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$cli=$CliPath
if(!$cli) {
    $found=Get-Command arduino-cli -ErrorAction SilentlyContinue
    if($found){$cli=$found.Source}
    else {$cli='C:\Program Files\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'}
}
if(!(Test-Path -LiteralPath $cli)){throw 'Arduino CLI not found. Install it or supply -CliPath.'}
$target='rp2040:rp2040:generic:flash=16777216_0'
$sketch=Join-Path $repo 'firmware\SensorBoardUsb'
$build=Join-Path $repo 'build\rev1'
& $cli compile --fqbn $target --build-property 'build.boot2=boot2_w25q080_2_padded_checksum' --build-path (Join-Path $repo 'build\rev1-cache') --output-dir $build $sketch
if($LASTEXITCODE -ne 0){throw 'Compilation failed'}
if($Upload){
    & $cli upload --fqbn $target --port $Port --input-dir $build $sketch
    if($LASTEXITCODE -ne 0){throw 'Upload failed'}
}
