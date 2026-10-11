; Script NSIS officiel pour Minecraft Server Manager
; Génère un installeur Windows natif autonome (.exe)

!include "MUI2.nsh"
!include "x64.nsh"

Name "Minecraft Server Manager"
OutFile "..\dist\win-McS-Manager.exe"
InstallDir "$LOCALAPPDATA\MinecraftServerManager"
RequestExecutionLevel user

; Compression maximale LZMA
SetCompressor /SOLID lzma

; Configuration visuelle et icône
!define MUI_ICON "..\AppIcon.ico"
!define MUI_UNICON "..\AppIcon.ico"
!define MUI_ABORTWARNING

; Pages de l'installeur
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\MinecraftServerManager.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Démarrer Minecraft Server Manager maintenant"
!insertmacro MUI_PAGE_FINISH

; Pages du désinstalleur
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Langues
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "English"

Section "Application Principale" SecMain
  SetOutPath "$INSTDIR"
  
  ; Exécutable natif de lancement et icônes
  File "..\MinecraftServerManager.exe"
  ; Nettoyage d anciens scripts eventuels
  Delete "$INSTDIR\Lancer-Manager.bat"
  Delete "$INSTDIR\launch-server.bat"
  Delete "$INSTDIR\Lancer-Manager.vbs"
  File "..\AppIcon.ico"
  File "..\AppIcon.png"
  File "..\package.json"
  File "..\diagnose.js"
  
  ; Binaires Windows embarqués (Node.js autonome)
  CreateDirectory "$INSTDIR\bin"
  SetOutPath "$INSTDIR\bin"
  File "..\.cache-win\node-arm64.exe"
  File "..\.cache-win\node-x64.exe"
  File "start-server.vbs"
  
  ; Sélection du node.exe par défaut selon l'architecture
  ${If} ${IsNativeARM64}
    DetailPrint "Architecture ARM64 détectée -> Installation de Node.js natif ARM64"
    CopyFiles /SILENT "$INSTDIR\bin\node-arm64.exe" "$INSTDIR\bin\node.exe"
  ${Else}
    DetailPrint "Architecture x64 détectée -> Installation de Node.js natif x64"
    CopyFiles /SILENT "$INSTDIR\bin\node-x64.exe" "$INSTDIR\bin\node.exe"
  ${EndIf}
  
  ; Fichiers source manager
  CreateDirectory "$INSTDIR\manager"
  SetOutPath "$INSTDIR\manager"
  File "..\manager\package.json"
  
  CreateDirectory "$INSTDIR\manager\src"
  SetOutPath "$INSTDIR\manager\src"
  File /r "..\manager\src\*"
  
  CreateDirectory "$INSTDIR\manager\public"
  SetOutPath "$INSTDIR\manager\public"
  File /r "..\manager\public\*"

  ; Vérification silencieuse et installation de Java 25 en arrière-plan si manquant
  DetailPrint "Vérification de l'environnement Java 25..."
  Exec 'powershell.exe -WindowStyle Hidden -Command "if (-not (Get-Command java -ErrorAction SilentlyContinue) -or (java -version 2>&1 | Select-String \"25\") -eq $null) { Start-Process winget -ArgumentList \"install --id EclipseAdoptium.Temurin.25.JDK -e --silent --accept-package-agreements --accept-source-agreements\" -WindowStyle Hidden }"'

  ; Répertoire de travail pour les raccourcis
  SetOutPath "$INSTDIR"
  
  ; Raccourci sur le Bureau pointant sur l'exécutable natif
  CreateShortCut "$DESKTOP\Minecraft Server Manager.lnk" "$INSTDIR\MinecraftServerManager.exe" "" "$INSTDIR\AppIcon.ico" 0
  
  ; Raccourcis Menu Démarrer
  CreateDirectory "$SMPROGRAMS\Minecraft Server Manager"
  CreateShortCut "$SMPROGRAMS\Minecraft Server Manager\Minecraft Server Manager.lnk" "$INSTDIR\MinecraftServerManager.exe" "" "$INSTDIR\AppIcon.ico" 0
  CreateShortCut "$SMPROGRAMS\Minecraft Server Manager\Désinstaller.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\AppIcon.ico" 0
  
  ; Création du désinstalleur Windows
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Enregistrement dans les paramètres Windows (Ajout/Suppression de programmes)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "DisplayName" "Minecraft Server Manager"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "DisplayIcon" "$\"$INSTDIR\AppIcon.ico$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "Publisher" "Gabriel JAGUENEAU"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "DisplayVersion" "1.0.0"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ; Fermer tout processus résiduel
  ExecWait 'taskkill /f /im node.exe'
  ExecWait 'taskkill /f /im node-arm64.exe'
  ExecWait 'taskkill /f /im node-x64.exe'

  ; Suppression des raccourcis
  Delete "$DESKTOP\Minecraft Server Manager.lnk"
  RMDir /r "$SMPROGRAMS\Minecraft Server Manager"
  
  ; Suppression des fichiers de l'application
  RMDir /r "$INSTDIR"
  
  ; Suppression des caches et LocalStorage (pour réinitialiser l'écran d'accueil lors d'une réinstallation)
  RMDir /r "$LOCALAPPDATA\MinecraftServerManager"
  RMDir /r "$LOCALAPPDATA\Microsoft\Edge\User Data\Default\Local Storage"
  RMDir /r "$LOCALAPPDATA\Microsoft\Edge\User Data\Default\Session Storage"
  
  ; Suppression de la clé de registre Windows
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager"
SectionEnd
