@echo off
set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"

echo Compilation de MinecraftServerManager.exe...
"%CSC%" /target:winexe /win32icon:..\..\..\AppIcon.ico /out:..\..\..\MinecraftServerManager.exe Program.cs
if %errorlevel% equ 0 (
    echo [SUCCES] Exécutable natif Windows genere avec succes : MinecraftServerManager.exe
) else (
    echo [ERREUR] Echec de la compilation C#.
)
