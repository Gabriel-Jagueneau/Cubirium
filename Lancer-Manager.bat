@echo off
set "DIR=%~dp0"
if exist "%DIR%Cubirium.exe" (
    start "" "%DIR%Cubirium.exe"
    exit /b 0
)
if exist "%DIR%MinecraftServerManager.exe" (
    start "" "%DIR%MinecraftServerManager.exe"
    exit /b 0
)
