@echo off
echo Compiling Registry Writer with Admin Manifest...
C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe /target:winexe /reference:System.Windows.Forms.dll /win32manifest:app.manifest /out:RegistryWriter.exe RegistryWriter.cs
echo Done! 