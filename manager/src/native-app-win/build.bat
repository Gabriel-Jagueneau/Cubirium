@echo off
set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"

echo Compilation de Cubirium.exe...
"%CSC%" /target:winexe /win32icon:..\..\..\AppIcon.ico /out:..\..\..\Cubirium.exe Program.cs
if %errorlevel% equ 0 (
    echo [SUCCES] Exécutable natif Windows genere avec succes : Cubirium.exe
) else (
    echo [ERREUR] Echec de la compilation C#.
)
