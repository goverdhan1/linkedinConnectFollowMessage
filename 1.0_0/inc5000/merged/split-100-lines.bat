@echo off
setlocal

REM Input file name
set infile=inc5000.txt

REM Run PowerShell to split into 100-line chunks
powershell -Command ^
  "$lines = Get-Content '%infile%';" ^
  "$chunks = 0;" ^
  "$i = 0;" ^
  "foreach ($line in $lines) {" ^
  "  $out = 'part' + $chunks + '.txt';" ^
  "  Add-Content $out $line;" ^
  "  $i++;" ^
  "  if ($i -ge 100) { $chunks++; $i = 0 }" ^
  "}"

echo Done! Files created as part0.txt, part1.txt, etc.
pause
