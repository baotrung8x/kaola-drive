const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class VirtualDriveManager {
    constructor() {
        this.currentLetter = null;
    }

    getSubstDrives() {
        try {
            const output = execSync('subst', { encoding: 'utf8' });
            const drives = {};
            const lines = output.split('\n');
            for (const line of lines) {
                const match = line.trim().match(/^([A-Za-z]:)\\?:?\s*=>\s*(.+)$/);
                if (match) {
                    const letter = match[1].toUpperCase();
                    drives[letter] = match[2].trim();
                }
            }
            return drives;
        } catch (e) {
            return {};
        }
    }

    isDriveBusy(letter) {
        const normLetter = letter.toUpperCase().replace(/\\/g, '');
        const root = normLetter.endsWith(':') ? normLetter + '\\' : normLetter + ':\\';
        return fs.existsSync(root);
    }

    findBestAvailableLetter(preferred = 'K:') {
        const preferredNorm = preferred.toUpperCase().replace(/\\/g, '');
        const candidate = preferredNorm.endsWith(':') ? preferredNorm : preferredNorm + ':';

        if (!this.isDriveBusy(candidate)) {
            return candidate;
        }

        const substDrives = this.getSubstDrives();
        if (substDrives[candidate]) {
            return candidate;
        }

        const letters = ['K:', 'L:', 'M:', 'O:', 'P:', 'Q:', 'R:', 'S:', 'T:', 'U:', 'V:', 'W:', 'X:', 'Y:', 'Z:'];
        for (const l of letters) {
            if (!this.isDriveBusy(l)) {
                return l;
            }
        }
        return 'K:';
    }

    /**
     * Thiết lập tên hiển thị mặc định "Kaola Drive" và icon cho ổ đĩa
     * Sử dụng đồng thời MountPoints2 (được Windows Explorer ưu tiên hiển thị)
     * và DriveIcons cùng Shell.Application COM để đảm bảo tên luôn là "Kaola Drive"
     */
    setDriveRegistry(letter, label = 'Kaola Drive', iconPath = null) {
        try {
            const letterOnly = letter.toUpperCase().replace(/[:\\]/g, '');

            // 1. MountPoints2: Bắt buộc để ghi đè volume label của ổ đĩa gốc (tránh kế thừa tên ổ C: như OS MX500)
            const regMountPoint = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\${letterOnly}`;
            execSync(`reg add "${regMountPoint}" /v "_LabelFromReg" /t REG_SZ /d "${label}" /f`, { stdio: 'ignore' });

            // 2. DriveIcons: Thiết lập DefaultLabel và DefaultIcon
            const regBase = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\${letterOnly}`;
            execSync(`reg add "${regBase}\\DefaultLabel" /ve /d "${label}" /f`, { stdio: 'ignore' });

            if (iconPath && fs.existsSync(iconPath)) {
                execSync(`reg add "${regBase}\\DefaultIcon" /ve /d "${iconPath}" /f`, { stdio: 'ignore' });
            }

            // 3. Sử dụng Windows Shell COM để cập nhật trực tiếp tên ổ đĩa trong Explorer namespace
            try {
                const driveRoot = `${letterOnly}:\\\\`;
                const psCmd = `powershell -NoProfile -Command "& { try { $s = New-Object -ComObject Shell.Application; $d = $s.NameSpace('${driveRoot}'); if ($d) { $d.Self.Name = '${label}' } } catch {} }"`;
                execSync(psCmd, { stdio: 'ignore' });
            } catch (comErr) {}

            // 4. Báo Windows Explorer refresh lại icon cache và drive list
            try {
                execSync('ie4uinit.exe -show', { stdio: 'ignore' });
            } catch (refErr) {}
        } catch (e) {
            console.error('Lỗi thiết lập Registry cho ổ đĩa:', e.message);
        }
    }

    clearDriveRegistry(letter) {
        try {
            const letterOnly = letter.toUpperCase().replace(/[:\\]/g, '');
            const regBase = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\DriveIcons\\${letterOnly}`;
            const regMountPoint = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\MountPoints2\\${letterOnly}`;

            execSync(`reg delete "${regBase}" /f`, { stdio: 'ignore' });
            execSync(`reg delete "${regMountPoint}" /v "_LabelFromReg" /f`, { stdio: 'ignore' });
            execSync('ie4uinit.exe -show', { stdio: 'ignore' });
        } catch (e) {}
    }

    mount(syncFolder, preferredLetter = 'K:', iconPath = null) {
        try {
            const resolvedFolder = path.resolve(syncFolder);
            if (!fs.existsSync(resolvedFolder)) {
                fs.mkdirSync(resolvedFolder, { recursive: true });
            }

            // Tạo autorun.inf và chép icon vào thư mục gốc để Windows nhận diện thêm
            try {
                const autorunPath = path.join(resolvedFolder, 'autorun.inf');
                const localIconPath = path.join(resolvedFolder, 'icon.ico');

                if (iconPath && fs.existsSync(iconPath) && !fs.existsSync(localIconPath)) {
                    fs.copyFileSync(iconPath, localIconPath);
                }

                const autorunContent = `[autorun]\r\nlabel=Kaola Drive\r\nicon=icon.ico\r\n`;
                fs.writeFileSync(autorunPath, autorunContent, 'utf8');
            } catch (autoErr) {}

            const letter = this.findBestAvailableLetter(preferredLetter);

            const substs = this.getSubstDrives();
            if (substs[letter]) {
                try {
                    execSync(`subst ${letter} /d`, { stdio: 'ignore' });
                } catch (e) {}
            }

            execSync(`subst ${letter} "${resolvedFolder}"`, { stdio: 'ignore' });

            // Đảm bảo iconPath là file vật lý hợp lệ
            let validIconPath = iconPath;
            const folderIcon = path.join(resolvedFolder, 'icon.ico');
            if (fs.existsSync(folderIcon)) {
                validIconPath = folderIcon;
            }

            this.setDriveRegistry(letter, 'Kaola Drive', validIconPath);
            this.currentLetter = letter;
            console.log(`[VIRTUAL DRIVE] Đã mount Ổ đĩa ${letter} ("Kaola Drive") => ${resolvedFolder}`);

            return {
                success: true,
                driveLetter: letter,
                path: `${letter}\\`,
                label: 'Kaola Drive'
            };
        } catch (err) {
            console.error('[VIRTUAL DRIVE] Lỗi mount ổ đĩa:', err.message);
            return {
                success: false,
                message: err.message
            };
        }
    }

    unmount(letter = null) {
        const targetLetter = letter || this.currentLetter || 'K:';
        const norm = targetLetter.toUpperCase().replace(/\\/g, '');
        const driveLetter = norm.endsWith(':') ? norm : norm + ':';

        try {
            this.clearDriveRegistry(driveLetter);
            execSync(`subst ${driveLetter} /d`, { stdio: 'ignore' });
            console.log(`[VIRTUAL DRIVE] Đã unmount Ổ đĩa ${driveLetter}`);
            this.currentLetter = null;
            return { success: true };
        } catch (e) {
            return { success: false, message: e.message };
        }
    }

    getStatus(letter = 'K:') {
        const norm = (letter || 'K:').toUpperCase().replace(/\\/g, '');
        const driveLetter = norm.endsWith(':') ? norm : norm + ':';
        const substs = this.getSubstDrives();
        const isMounted = !!substs[driveLetter];

        return {
            isMounted,
            driveLetter,
            targetPath: substs[driveLetter] || null,
            label: 'Kaola Drive'
        };
    }
}

module.exports = new VirtualDriveManager();
