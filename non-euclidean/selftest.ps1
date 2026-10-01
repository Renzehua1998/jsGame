$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$tmp = "C:\Users\R00913~1\AppData\Local\Temp\opencode"
$allPass = $true
foreach ($sp in 0, 1, 2, 3) {
  $url = "file:///D:/work/%E5%AD%98%E6%A1%A3/code/non-euclidean/index.html?selftest&space=$sp"
  cmd /c "`"$chrome`" --headless=new --disable-gpu --enable-unsafe-swiftshader --user-data-dir=`"$tmp\chrome-profile`" --no-first-run --hide-scrollbars --window-size=1280,720 --virtual-time-budget=8000 --dump-dom `"$url`" > `"$tmp\dom$sp.txt`" 2>&1"
  $html = Get-Content "$tmp\dom$sp.txt" -Raw
  $m = [regex]::Match($html, 'id="selftest"[^>]*>(.*?)</div>', [System.Text.RegularExpressions.RegexOptions]::Singleline)
  if ($m.Success) {
    Write-Output "===== space=$sp ====="
    Write-Output $m.Groups[1].Value
    if ($m.Groups[1].Value -notmatch '"pass":true') { $allPass = $false }
  } elseif ($html -match 'id="overlay"(?![^>]*hidden)') {
    Write-Output "===== space=$sp ===== SELFTEST-FAIL: 致命错误浮层已触发"
    $allPass = $false
  } else {
    Write-Output "===== space=$sp ===== SELFTEST-FAIL: 未找到自检结果div"
    $allPass = $false
  }
}
if ($allPass) { Write-Output "`nALL PASS" } else { Write-Output "`nSOME FAILED" }
cmd /c "`"$chrome`" --headless=new --disable-gpu --enable-unsafe-swiftshader --user-data-dir=`"$tmp\chrome-profile`" --no-first-run --hide-scrollbars --window-size=1280,720 --virtual-time-budget=8000 --screenshot=`"$tmp\latest-sphere.png`" `"file:///D:/work/%E5%AD%98%E6%A1%A3/code/non-euclidean/index.html?selftest&space=1`" > NUL 2>&1"
cmd /c "`"$chrome`" --headless=new --disable-gpu --enable-unsafe-swiftshader --user-data-dir=`"$tmp\chrome-profile`" --no-first-run --hide-scrollbars --window-size=1280,720 --virtual-time-budget=8000 --screenshot=`"$tmp\latest-hyper.png`" `"file:///D:/work/%E5%AD%98%E6%A1%A3/code/non-euclidean/index.html?selftest&space=2`" > NUL 2>&1"
