; Script NSIS officiel pour Cubirium
; Génère un installeur Windows natif autonome (.exe)

!include "MUI2.nsh"
!include "x64.nsh"

Name "Cubirium"
OutFile "..\dist\win-Cubirium.exe"
InstallDir "$LOCALAPPDATA\Cubirium"
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
!define MUI_FINISHPAGE_RUN "$INSTDIR\Cubirium.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Démarrer Cubirium maintenant"
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
  File "..\Cubirium.exe"
  ; Nettoyage d anciens scripts eventuels
  Delete "$INSTDIR\Lancer-Manager.bat"
  Delete "$INSTDIR\launch-server.bat"
  Delete "$INSTDIR\Lancer-Manager.vbs"
  Delete "$INSTDIR\MinecraftServerManager.exe"
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

  ; Répertoire de travail pour les raccourcis
  SetOutPath "$INSTDIR"
  
  ; Raccourci sur le Bureau pointant sur l'exécutable natif
  CreateShortCut "$DESKTOP\Cubirium.lnk" "$INSTDIR\Cubirium.exe" "" "$INSTDIR\AppIcon.ico" 0
  Delete "$DESKTOP\Minecraft Server Manager.lnk"
  
  ; Raccourcis Menu Démarrer
  CreateDirectory "$SMPROGRAMS\Cubirium"
  CreateShortCut "$SMPROGRAMS\Cubirium\Cubirium.lnk" "$INSTDIR\Cubirium.exe" "" "$INSTDIR\AppIcon.ico" 0
  CreateShortCut "$SMPROGRAMS\Cubirium\Désinstaller.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\AppIcon.ico" 0
  RMDir /r "$SMPROGRAMS\Minecraft Server Manager"
  
  ; Création du désinstalleur Windows
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  
  ; Enregistrement dans les paramètres Windows (Ajout/Suppression de programmes)
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "DisplayName" "Cubirium"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "DisplayIcon" "$\"$INSTDIR\AppIcon.ico$\""
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "Publisher" "Gabriel JAGUENEAU"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "DisplayVersion" "1.1.0"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium" "NoRepair" 1
SectionEnd

Section "Uninstall"
  ; Fermer tout processus résiduel
  ExecWait 'taskkill /f /im node.exe'
  ExecWait 'taskkill /f /im node-arm64.exe'
  ExecWait 'taskkill /f /im node-x64.exe'

  ; Suppression des raccourcis
  Delete "$DESKTOP\Cubirium.lnk"
  Delete "$DESKTOP\Minecraft Server Manager.lnk"
  RMDir /r "$SMPROGRAMS\Cubirium"
  RMDir /r "$SMPROGRAMS\Minecraft Server Manager"
  
  ; Suppression des fichiers de l'application
  RMDir /r "$INSTDIR"
  
  ; Suppression des caches et LocalStorage (pour réinitialiser l'écran d'accueil lors d'une réinstallation)
  RMDir /r "$LOCALAPPDATA\Cubirium"
  RMDir /r "$LOCALAPPDATA\MinecraftServerManager"
  RMDir /r "$LOCALAPPDATA\Microsoft\Edge\User Data\Default\Local Storage"
  RMDir /r "$LOCALAPPDATA\Microsoft\Edge\User Data\Default\Session Storage"
  
  ; Suppression des clés de registre Windows
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Cubirium"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\MinecraftServerManager"
SectionEnd
