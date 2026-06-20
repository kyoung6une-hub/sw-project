Set WshShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
strScriptPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strScriptPath

If objFSO.FolderExists(strScriptPath & "\sw 기말과제") Then
    WshShell.CurrentDirectory = strScriptPath & "\sw 기말과제"
End If

WshShell.Run "cmd.exe /c 실행하기.bat", 0, false