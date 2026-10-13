Option Explicit
Dim WshShell, FSO, currentDir
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
If FSO.FileExists(currentDir & "\Cubirium.exe") Then
    WshShell.Run "\"" & currentDir & "\Cubirium.exe\"", 0, False
ElseIf FSO.FileExists(currentDir & "\MinecraftServerManager.exe") Then
    WshShell.Run "\"" & currentDir & "\MinecraftServerManager.exe\"", 0, False
End If
