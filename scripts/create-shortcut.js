const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const desktopDir = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop');
const appDir = path.resolve(__dirname, '..');
const electronExe = path.join(appDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const iconFile = path.join(appDir, 'assets', 'icon.ico');
const shortcutPath = path.join(desktopDir, 'Kaola Drive.lnk');

if (!fs.existsSync(electronExe)) {
    console.error('Không tìm thấy electron.exe. Vui lòng chạy npm install trước.');
    process.exit(1);
}

const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('${shortcutPath}')
$Shortcut.TargetPath = '${electronExe}'
$Shortcut.Arguments = '.'
$Shortcut.WorkingDirectory = '${appDir}'
$Shortcut.IconLocation = '${iconFile}, 0'
$Shortcut.Description = 'Kaola Drive Desktop'
$Shortcut.Save()
`;

try {
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, { stdio: 'inherit' });
    console.log(`\x1b[32m✔ Đã tạo biểu tượng Kaola Drive ngoài màn hình Desktop thành công:\x1b[0m`);
    console.log(`   ${shortcutPath}`);
} catch (e) {
    console.error('Lỗi khi tạo shortcut:', e.message);
}
