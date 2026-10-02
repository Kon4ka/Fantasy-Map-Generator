@echo off
powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'node.exe' -ArgumentList 'scripts\kontar-launch.mjs' -WorkingDirectory '%~dp0..' -WindowStyle Hidden"
