$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
# Quick Edit in the classic Windows console suspends the process on selection.
try {
 Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class SeetConsole {
 [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int n);
 [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr h, out uint mode);
 [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr h, uint mode);
}
"@
 $handle = [SeetConsole]::GetStdHandle(-10)
 $mode = [uint32]0
 if ([SeetConsole]::GetConsoleMode($handle, [ref]$mode)) {
  [void][SeetConsole]::SetConsoleMode($handle, (($mode -bor 0x80) -band (-bnot 0x40)))
 }
} catch { }
Write-Host ''
Write-Host '  见数 Seet | 启动准备' -ForegroundColor Green
Write-Host '  首次运行需联网；请保留此窗口。阶段进度不代表下载百分比。' -ForegroundColor DarkGray
$script:startupClock = [Diagnostics.Stopwatch]::StartNew()
function Run-Tracked($arguments, $label) {
 $folder = Join-Path $env:TEMP ('Seet-start-' + [Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory $folder | Out-Null
 $stdout = Join-Path $folder 'stdout.log'
 $stderr = Join-Path $folder 'stderr.log'
 $command = (Get-Command npm.cmd).Source
 $process = Start-Process -FilePath $env:ComSpec -ArgumentList ('/d /s /c ""' + $command + '" ' + $arguments + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
 $offsets = @{ $stdout = 0; $stderr = 0 }
 $clock = [Diagnostics.Stopwatch]::StartNew()
 $lastPulse = -5
 while ($true) {
  foreach ($path in @($stdout, $stderr)) {
   if (Test-Path $path) {
    $lines = @(Get-Content -LiteralPath $path -Encoding UTF8 -ErrorAction SilentlyContinue)
    for ($i = $offsets[$path]; $i -lt $lines.Count; $i++) { Write-Host ('    ' + $lines[$i]) -ForegroundColor Gray }
    $offsets[$path] = $lines.Count
   }
  }
  if ($process.HasExited) { break }
  if ($clock.Elapsed.TotalSeconds - $lastPulse -ge 5) {
   Write-Host ('    正在' + $label + '，已用时 ' + [int]$clock.Elapsed.TotalSeconds + ' 秒；进程运行中…') -ForegroundColor DarkCyan
   $lastPulse = $clock.Elapsed.TotalSeconds
  }
  Start-Sleep -Milliseconds 200
  $process.Refresh()
 }
 $process.WaitForExit()
 if ($process.ExitCode -ne 0) { throw ($label + '失败，退出码 ' + $process.ExitCode + '。详细日志：' + $folder) }
 Write-Host ('    完成，用时 ' + [int]$clock.Elapsed.TotalSeconds + ' 秒') -ForegroundColor Green
}
Set-Location (Split-Path $PSScriptRoot -Parent)
function Stage($n, $message) {
  Write-Host ''
  $bar = ('#' * ($n-1)) + ('-' * (6-$n))
  Write-Host "  [$bar] 第 $n/5 阶段 | $message" -ForegroundColor Green
}

try {
 Stage 1 '检查 Node.js 运行环境'
 $valid = $false
 if (Get-Command node -ErrorAction SilentlyContinue) {
   & node -e "process.exit(Number(process.versions.node.split('.')[0])>=22 && (Number(process.versions.node.split('.')[0])>22 || Number(process.versions.node.split('.')[1])>=12)?0:1)"
   $valid = $LASTEXITCODE -eq 0
 }
 if (-not $valid) {
   $cache = Join-Path $env:LOCALAPPDATA 'Seet/runtime'
   New-Item -ItemType Directory -Force $cache | Out-Null
   [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
   $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {'arm64'} else {'x64'}
   $versions = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
   $version = ($versions | Where-Object { $_.version -match '^v22\.' -and $_.files -contains "win-$arch-zip" } | Select-Object -First 1).version
   if (-not $version) { throw 'No supported Node.js release found.' }
   $name = "node-$version-win-$arch"
   $nodeDir = Join-Path $cache $name
   if (-not (Test-Path "$nodeDir/node.exe")) {
     Stage 2 '下载便携 Node.js；下载速度取决于网络，请等待'
     $zip = Join-Path $cache "$name.zip"
     $client = New-Object Net.WebClient
     try {
       $download = $client.DownloadFileTaskAsync([Uri]"https://nodejs.org/dist/$version/$name.zip", $zip)
       $downloadClock = [Diagnostics.Stopwatch]::StartNew()
       while (-not $download.IsCompleted) {
         $received = if (Test-Path $zip) { (Get-Item $zip).Length } else { 0 }
         Write-Host ('    已下载 {0:N1} MB | 已用时 {1} 秒' -f ($received/1MB), [int]$downloadClock.Elapsed.TotalSeconds) -ForegroundColor DarkCyan
         Start-Sleep -Seconds 1
       }
       $download.GetAwaiter().GetResult()
     } finally { $client.Dispose() }
     $sums = (Invoke-WebRequest "https://nodejs.org/dist/$version/SHASUMS256.txt" -UseBasicParsing).Content
     $line = ($sums -split "`n" | Where-Object { $_.Trim().EndsWith("$name.zip") } | Select-Object -First 1)
     if (-not $line -or (Get-FileHash $zip -Algorithm SHA256).Hash -ne ($line -split '\s+')[0]) { throw 'Node.js checksum verification failed.' }
     Expand-Archive -LiteralPath $zip -DestinationPath $cache -Force
   }
   $env:PATH = "$nodeDir;$env:PATH"
 }
 Stage 3 '检查并安装项目依赖'
 $stamp = Join-Path (Get-Location) 'node_modules/.seet-install-key'
 $installKey = (Get-FileHash package-lock.json).Hash + (& node -p 'process.version+process.arch')
 if ((Test-Path $stamp) -and (Test-Path 'node_modules/vite/package.json') -and (Get-Content $stamp -Raw).Trim() -eq $installKey) {
  Write-Host '    依赖与锁文件一致，跳过重复安装。' -ForegroundColor Gray
 } else {
  Run-Tracked 'ci --no-audit --no-fund --loglevel=info --progress=false' '安装依赖'
  Set-Content -LiteralPath $stamp -Value $installKey -Encoding ascii
 }
 Stage 4 '构建网页'
 Run-Tracked 'run build' '构建网页'
 Stage 5 '启动服务，成功后自动打开网页'
 Write-Host ('    准备完成，总用时 ' + [int]$script:startupClock.Elapsed.TotalSeconds + ' 秒。关闭窗口会停止服务。') -ForegroundColor Green
 & node scripts/start.mjs
 if ($LASTEXITCODE -ne 0) { throw 'Server startup failed.' }
} catch {
 Write-Host $_ -ForegroundColor Red
 Read-Host 'Press Enter to close'
 exit 1
}
