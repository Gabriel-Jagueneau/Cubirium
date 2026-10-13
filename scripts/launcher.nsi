; Launcher autonome natif Windows pour Cubirium
; Lance le backend Node.js en arriere-plan sans AUCUNE console (CREATE_NO_WINDOW / SW_HIDE)
; Attend que le serveur soit pret et ouvre immediatement l interface dans sa fenetre autonome.

!include "FileFunc.nsh"
!include "x64.nsh"
!include "LogicLib.nsh"

Name "Cubirium"
OutFile "..\Cubirium.exe"
Icon "..\AppIcon.ico"
SilentInstall silent
RequestExecutionLevel user

Section
  ; Repertoire racine de l application
  ${GetParent} "$EXEPATH" $0
  
  ; 1. Detection du binaire Node.js (ARM64 vs x64, embarque ou systeme)
  StrCpy $1 ""
  ${If} ${IsNativeARM64}
    ${If} ${FileExists} "$0\bin\node-arm64.exe"
      StrCpy $1 "$0\bin\node-arm64.exe"
    ${ElseIf} ${FileExists} "$0\.cache-win\node-arm64.exe"
      StrCpy $1 "$0\.cache-win\node-arm64.exe"
    ${EndIf}
  ${Else}
    ${If} ${FileExists} "$0\bin\node-x64.exe"
      StrCpy $1 "$0\bin\node-x64.exe"
    ${ElseIf} ${FileExists} "$0\.cache-win\node-x64.exe"
      StrCpy $1 "$0\.cache-win\node-x64.exe"
    ${EndIf}
  ${EndIf}

  ${If} $1 == ""
    ${If} ${FileExists} "$0\bin\node.exe"
      StrCpy $1 "$0\bin\node.exe"
    ${ElseIf} ${FileExists} "$0\.cache-win\node.exe"
      StrCpy $1 "$0\.cache-win\node.exe"
    ${Else}
      StrCpy $1 "node"
    ${EndIf}
  ${EndIf}

  ; 2. Verifier si le serveur est DEJA actif (pour reouverture instantanee sans relancer Node)
  System::Call 'wininet::InternetOpenW(w "MSM", i 1, i 0, i 0, i 0) p .r5'
  StrCpy $6 0
  ${If} $5 != 0
    System::Call 'wininet::InternetOpenUrlW(p r5, w "http://127.0.0.1:4567/api/status", i 0, i 0, i 0x80000000, i 0) p .r6'
    ${If} $6 != 0
      System::Call 'wininet::InternetCloseHandle(p r6)'
    ${EndIf}
    System::Call 'wininet::InternetCloseHandle(p r5)'
  ${EndIf}

  ; Si le serveur ne tourne pas encore, le demarrer silencieusement
  ${If} $6 == 0
    SetOutPath "$0\manager"
    
    ; Methode 1 : Demarrage direct via Win32 CreateProcessW avec CREATE_NO_WINDOW (0x08000000)
    System::Call "*( &l, &v64 ) p .r8"
    System::Call "*( &v16 ) p .r9"
    StrCpy $3 '"$1" "$0\manager\src\server.js"'
    System::Call 'kernel32::CreateProcessW(i 0, w r3, i 0, i 0, i 0, i 0x08000000, i 0, w "$0\manager", p r8, p r9) i .r4'
    
    ${If} $4 != 0
      System::Call "*$9(p .r5, p .r6)"
      System::Call 'kernel32::CloseHandle(p r5)'
      System::Call 'kernel32::CloseHandle(p r6)'
    ${Else}
      ; Methode 2 (Fallback) : Demarrage via WScript.Shell sans console (SW_HIDE)
      ${If} ${FileExists} "$0\bin\start-server.vbs"
        Exec 'wscript.exe //nologo "$0\bin\start-server.vbs" "$1" "$0\manager\src\server.js" "$0\manager"'
      ${Else}
        Exec '"$1" "$0\manager\src\server.js"'
      ${EndIf}
    ${EndIf}
    
    System::Free $8
    System::Free $9

    ; 3. Attente active que le serveur soit pret (boucle de max 8 secondes, 250ms par cycle)
    StrCpy $7 0
    ${Do}
      Sleep 250
      IntOp $7 $7 + 1

      System::Call 'wininet::InternetOpenW(w "MSM", i 1, i 0, i 0, i 0) p .r5'
      ${If} $5 != 0
        System::Call 'wininet::InternetOpenUrlW(p r5, w "http://127.0.0.1:4567/api/status", i 0, i 0, i 0x80000000, i 0) p .r6'
        ${If} $6 != 0
          System::Call 'wininet::InternetCloseHandle(p r6)'
          System::Call 'wininet::InternetCloseHandle(p r5)'
          ${Break}
        ${EndIf}
        System::Call 'wininet::InternetCloseHandle(p r5)'
      ${EndIf}

      ${If} $7 > 32 ; 32 * 250ms = 8 secondes maximum
        ${Break}
      ${EndIf}
    ${Loop}
  ${EndIf}

  ; 4. Localiser Microsoft Edge pour ouvrir l application dans une fenetre dediee
  ReadRegStr $2 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${If} $2 == ""
    ReadRegStr $2 HKCU "SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${EndIf}
  ${If} $2 == ""
    ReadRegStr $2 HKLM "SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe" ""
  ${EndIf}
  ${If} $2 == ""
    StrCpy $2 "$PROGRAMFILES\Microsoft\Edge\Application\msedge.exe"
    ${IfNot} ${FileExists} "$2"
      StrCpy $2 "$PROGRAMFILES(x86)\Microsoft\Edge\Application\msedge.exe"
    ${EndIf}
    ${IfNot} ${FileExists} "$2"
      StrCpy $2 "$LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
    ${EndIf}
  ${EndIf}

  ; 5. Ouvrir la fenetre de l application (mode autonome, sans barre d adresse ni onglet)
  ${If} ${FileExists} "$2"
    Exec '"$2" --app=http://127.0.0.1:4567 --window-size=1280,820'
  ${Else}
    ExecShell "open" "http://127.0.0.1:4567"
  ${EndIf}
SectionEnd
