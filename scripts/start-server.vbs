Option Explicit
Dim sh
Set sh = CreateObject("WScript.Shell")
If WScript.Arguments.Count >= 3 Then
    sh.CurrentDirectory = WScript.Arguments(2)
End If
sh.Run "\"" & WScript.Arguments(0) & "\" \"" & WScript.Arguments(1) & "\"", 0, False
