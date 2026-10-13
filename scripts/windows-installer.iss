; Script Inno Setup pour Cubirium
; Génère : Cubirium-Setup.exe

#define MyAppName "Cubirium"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Gabriel JAGUENEAU"
#define MyAppURL "https://github.com/Gabriel-Jagueneau"
#define MyAppExeName "Cubirium.exe"

[Setup]
AppId={{D37E6B4A-5762-4C10-91B1-A4290130FA31}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist
OutputBaseFilename=Cubirium-Setup
SetupIconFile=..\AppIcon.ico
UninstallDisplayIcon={app}\AppIcon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\Lancer-Manager.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\Lancer-Manager.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\AppIcon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\AppIcon.png"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\diagnose.js"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\manager\*"; DestDir: "{app}\manager"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\AppIcon.ico"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\AppIcon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall skipifsilent
