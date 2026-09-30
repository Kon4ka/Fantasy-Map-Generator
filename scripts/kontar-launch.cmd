@echo off
powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath 'node.exe' -ArgumentList 'scripts\kontar-launch.mjs' -WorkingDirectory 'D:\Programming\AI\Fantasy-Map-Generator' -WindowStyle Hidden"
