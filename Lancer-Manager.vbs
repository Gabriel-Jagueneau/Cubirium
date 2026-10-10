Option Explicit
Dim WshShell, FSO, currentDir
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
If FSO.FileExists(currentDir & "\MinecraftServerManager.exe") Then
    WshShell.Run "\"" & currentDir & "\MinecraftServerManager.exe\"", 0, False
End If
