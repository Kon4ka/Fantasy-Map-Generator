@echo off
powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'node.exe' -ArgumentList 'scripts\map-launch.mjs' -WorkingDirectory '%~dp0..' -WindowStyle Hidden"
