@echo off
set "DIR=%~dp0"
if exist "%DIR%MinecraftServerManager.exe" (
    start "" "%DIR%MinecraftServerManager.exe"
    exit /b 0
)
