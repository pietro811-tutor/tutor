' Avvia il motore di Virgilio senza finestre, all'accensione del PC.
' Un collegamento a questo file sta nella cartella Esecuzione automatica di Windows.
Set fso = CreateObject("Scripting.FileSystemObject")
cartella = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = cartella
' se il motore gira gia', non ne avvio un secondo
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set processi = wmi.ExecQuery("SELECT * FROM Win32_Process WHERE Name = 'node.exe' AND CommandLine LIKE '%motore.js%'")
If processi.Count = 0 Then
  shell.Run "cmd /c node motore.js", 0, False
End If
