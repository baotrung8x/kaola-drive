$WshShell = New-Object -ComObject WScript.Shell
$desktopPath = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")
$shortcutPath = [System.IO.Path]::Combine($desktopPath, "Kaola Drive.lnk")
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "C:\laragon\www\Kaola-Drive-Destop\KaolaDrive.bat"
$shortcut.WorkingDirectory = "C:\laragon\www\Kaola-Drive-Destop"
$shortcut.Description = "Kaola Drive Desktop"
$shortcut.IconLocation = "C:\laragon\www\Kaola-Drive-Destop\assets\icon.ico, 0"
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Host "[+] Shortcut successfully updated at: $shortcutPath"
