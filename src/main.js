const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const DriveSyncApi = require('../engine/api');
const SyncWorker = require('../engine/sync-worker');
const virtualDrive = require('../engine/virtual-drive');
const UpdateChecker = require('../engine/update-checker');

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow = null;
let tray = null;
let syncWorker = null;
let driveApi = null;
let cachedUserInfo = null;
let updateChecker = null;

const configPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'config.json')
    : path.join(__dirname, '..', 'config.json');
const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
const iconPngPath = path.join(__dirname, '..', 'assets', 'icon.png');
const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');

const DEFAULT_SERVER_URL = 'http://kaolawork.test';

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!data.server_url) {
                data.server_url = DEFAULT_SERVER_URL;
            }
            if (!data.sync_mode) {
                data.sync_mode = 'offline';
            }
            if (data.enable_virtual_drive === undefined) {
                data.enable_virtual_drive = true;
            }
            if (!data.virtual_drive_letter) {
                data.virtual_drive_letter = 'K:';
            }
            return data;
        }
    } catch (e) {
        console.error('Lỗi đọc config:', e);
    }
    return {
        server_url: DEFAULT_SERVER_URL,
        sync_folder: path.join(app.getPath('home'), 'KaolaDrive'),
        token: '',
        sync_interval_seconds: 15,
        device_name: 'Windows Desktop Client',
        sync_mode: 'offline',
        enable_virtual_drive: true,
        virtual_drive_letter: 'K:'
    };
}

function saveConfig(cfg) {
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
        console.error('Lỗi ghi config:', e);
    }
}

let config = loadConfig();

function getPhysicalIconPath() {
    try {
        const userDataIcon = path.join(app.getPath('userData'), 'drive_icon.ico');
        if (fs.existsSync(iconPath)) {
            fs.copyFileSync(iconPath, userDataIcon);
            return userDataIcon;
        }
        if (fs.existsSync(userDataIcon)) {
            return userDataIcon;
        }
    } catch (e) {}
    return fs.existsSync(iconPath) ? path.resolve(iconPath) : null;
}

function updateTrayMenu() {
    if (!tray) return;

    const isAutoStart = app.getLoginItemSettings().openAtLogin;
    const vdStatus = virtualDrive.getStatus(config.virtual_drive_letter || 'K:');

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Kaola Drive Desktop', enabled: false },
        { type: 'separator' },
        {
            label: 'Mở bảng điều khiển',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        {
            label: vdStatus.isMounted ? `Mở Ổ đĩa Kaola Drive (${vdStatus.driveLetter})` : 'Mở thư mục Kaola Drive',
            click: () => {
                if (vdStatus.isMounted) {
                    shell.openPath(`${vdStatus.driveLetter}\\`);
                } else {
                    const folder = path.resolve(config.sync_folder || './KaolaDrive');
                    if (fs.existsSync(folder)) {
                        shell.openPath(folder);
                    } else {
                        fs.mkdirSync(folder, { recursive: true });
                        shell.openPath(folder);
                    }
                }
            }
        },
        {
            label: 'Mở trên Trình duyệt Web',
            click: () => {
                if (config.server_url) {
                    const url = config.server_url.replace(/\/+$/, '') + '/drive-portal';
                    shell.openExternal(url);
                }
            }
        },
        {
            label: 'Đồng bộ ngay',
            click: () => {
                if (syncWorker) {
                    syncWorker.triggerSyncNow();
                }
            }
        },
        { type: 'separator' },
        {
            label: `Tạo Ổ đĩa Kaola Drive (${config.virtual_drive_letter || 'K:'}) trong This PC`,
            type: 'checkbox',
            checked: !!config.enable_virtual_drive,
            click: (menuItem) => {
                config.enable_virtual_drive = menuItem.checked;
                saveConfig(config);
                const syncFolder = path.resolve(config.sync_folder || './KaolaDrive');
                const ico = getPhysicalIconPath();
                if (config.enable_virtual_drive) {
                    virtualDrive.mount(syncFolder, config.virtual_drive_letter || 'K:', ico);
                } else {
                    virtualDrive.unmount(config.virtual_drive_letter || 'K:');
                }
                updateTrayMenu();
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('state:change', getAppState());
                }
            }
        },
        {
            label: 'Tự khởi động cùng Windows',
            type: 'checkbox',
            checked: isAutoStart,
            click: (menuItem) => {
                app.setLoginItemSettings({ openAtLogin: menuItem.checked });
            }
        },
        {
            label: 'Kiểm tra bản cập nhật...',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('app:check-updates-trigger');
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Thoát Kaola Drive',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

function initSyncWorker() {
    if (!config.token || !config.server_url) return;

    driveApi = new DriveSyncApi(config.server_url, config.token);
    const syncFolder = path.resolve(config.sync_folder || './KaolaDrive');

    if (syncWorker) {
        syncWorker.stop();
    }

    syncWorker = new SyncWorker(driveApi, syncFolder, config.sync_interval_seconds || 15, config.sync_mode || 'offline');

    // Event bridging to UI
    syncWorker.on('status', (status) => {
        if (tray) {
            const statusText = status.state === 'syncing' ? 'Đang đồng bộ...' : (status.state === 'error' ? 'Lỗi kết nối' : 'Đã cập nhật');
            tray.setToolTip(`Kaola Drive - ${statusText}`);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync:status', status);
        }
    });

    syncWorker.on('activity', (activity) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync:activity', activity);
        }
    });

    syncWorker.on('files:updated', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('files:updated');
        }
    });

    syncWorker.start();

    // Tự động mount ổ đĩa ảo nếu được bật
    if (config.enable_virtual_drive !== false) {
        const ico = getPhysicalIconPath();
        virtualDrive.mount(syncFolder, config.virtual_drive_letter || 'K:', ico);
        updateTrayMenu();
    }

    // Fetch initial user & quota info
    driveApi.getInfo().then(info => {
        cachedUserInfo = info;
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('state:change', getAppState());
        }
    }).catch(err => {
        console.error('Lỗi lấy info tài khoản:', err.message);
    });
}

function getAppState() {
    return {
        isAuthenticated: !!config.token,
        config: config,
        user: cachedUserInfo?.user || null,
        company: cachedUserInfo?.company || null,
        storage: cachedUserInfo?.storage || null,
        autoStart: app.getLoginItemSettings().openAtLogin,
        recentActivities: syncWorker ? syncWorker.recentActivities : [],
        virtualDrive: virtualDrive.getStatus(config.virtual_drive_letter || 'K:')
    };
}

function createMainWindow() {
    const winIcon = fs.existsSync(iconPngPath) ? iconPngPath : (fs.existsSync(iconPath) ? iconPath : logoPath);
    mainWindow = new BrowserWindow({
        width: 460,
        height: 680,
        minWidth: 420,
        minHeight: 600,
        maxWidth: 560,
        maxHeight: 850,
        frame: false,
        show: false,
        icon: winIcon,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    // Instead of closing, hide to system tray
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });
}

function createTray() {
    let trayImage;
    if (fs.existsSync(iconPngPath)) {
        trayImage = nativeImage.createFromPath(iconPngPath);
    } else if (fs.existsSync(iconPath)) {
        trayImage = nativeImage.createFromPath(iconPath);
    } else {
        trayImage = nativeImage.createFromPath(logoPath);
    }

    tray = new Tray(trayImage);
    tray.setToolTip('Kaola Drive Desktop');

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });

    updateTrayMenu();
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.whenReady().then(() => {
    createMainWindow();
    createTray();
    initSyncWorker();

    updateChecker = new UpdateChecker(app.getVersion(), config.server_url);
    updateChecker.on('update-available', (updateInfo) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:update-available', updateInfo);
        }
        if (tray && (!mainWindow || !mainWindow.isVisible())) {
            tray.displayBalloon({
                iconType: 'info',
                title: 'Kaola Drive - Bản cập nhật mới',
                content: `Đã có bản cập nhật Kaola Drive v${updateInfo.latestVersion}. Bấm để xem chi tiết.`
            });
        }
    });
    updateChecker.startPeriodicCheck(30 * 60 * 1000);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('before-quit', () => {
    app.isQuitting = true;
    if (syncWorker) {
        syncWorker.stop();
    }
    virtualDrive.unmount(config.virtual_drive_letter || 'K:');
});

// IPC Communication Handlers
ipcMain.handle('app:get-state', () => {
    return getAppState();
});

ipcMain.handle('auth:login', async (_event, creds) => {
    try {
        const serverUrl = (creds.serverUrl || config.server_url || DEFAULT_SERVER_URL).replace(/\/+$/, '');
        const api = new DriveSyncApi(serverUrl, '');
        const res = await api.login(creds.email, creds.password, config.device_name || 'Windows Desktop PC');

        if (res.status === 'success' && res.token) {
            config.server_url = serverUrl;
            config.token = res.token;
            if (creds.syncFolder) {
                config.sync_folder = creds.syncFolder;
            }
            saveConfig(config);

            cachedUserInfo = {
                user: res.user,
                company: res.company,
                storage: res.quota
            };

            initSyncWorker();
            return { status: 'success' };
        } else {
            return { status: 'error', message: res.message || 'Đăng nhập không thành công.' };
        }
    } catch (err) {
        return { status: 'error', message: err.message };
    }
});

ipcMain.handle('auth:logout', async () => {
    if (syncWorker) {
        syncWorker.stop();
        syncWorker = null;
    }
    virtualDrive.unmount(config.virtual_drive_letter || 'K:');
    config.token = '';
    saveConfig(config);
    cachedUserInfo = null;
    return { status: 'success' };
});

ipcMain.handle('folder:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Chọn thư mục đồng bộ Kaola Drive',
        properties: ['openDirectory', 'createDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
        const selected = result.filePaths[0];
        config.sync_folder = selected;
        saveConfig(config);
        if (syncWorker) {
            syncWorker.setSyncFolder(selected);
        }
        if (config.enable_virtual_drive) {
            const ico = getPhysicalIconPath();
            virtualDrive.mount(selected, config.virtual_drive_letter || 'K:', ico);
        }
        return selected;
    }
    return null;
});

ipcMain.handle('folder:open', () => {
    const vdStatus = virtualDrive.getStatus(config.virtual_drive_letter || 'K:');
    if (vdStatus.isMounted) {
        shell.openPath(`${vdStatus.driveLetter}\\`);
        return true;
    }
    const folder = path.resolve(config.sync_folder || './KaolaDrive');
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    shell.openPath(folder);
    return true;
});

ipcMain.handle('virtual-drive:get-status', () => {
    return virtualDrive.getStatus(config.virtual_drive_letter || 'K:');
});

ipcMain.handle('virtual-drive:toggle', (_event, enabled) => {
    config.enable_virtual_drive = !!enabled;
    saveConfig(config);
    const syncFolder = path.resolve(config.sync_folder || './KaolaDrive');
    const ico = getPhysicalIconPath();
    if (config.enable_virtual_drive) {
        virtualDrive.mount(syncFolder, config.virtual_drive_letter || 'K:', ico);
    } else {
        virtualDrive.unmount(config.virtual_drive_letter || 'K:');
    }
    updateTrayMenu();
    return virtualDrive.getStatus(config.virtual_drive_letter || 'K:');
});

ipcMain.handle('virtual-drive:open', () => {
    const vdStatus = virtualDrive.getStatus(config.virtual_drive_letter || 'K:');
    if (vdStatus.isMounted) {
        shell.openPath(`${vdStatus.driveLetter}\\`);
        return true;
    }
    const folder = path.resolve(config.sync_folder || './KaolaDrive');
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    shell.openPath(folder);
    return true;
});

ipcMain.handle('web:open', (_event, customUrl) => {
    const baseUrl = customUrl || config.server_url;
    if (baseUrl) {
        const targetUrl = baseUrl.replace(/\/+$/, '') + '/drive-portal';
        shell.openExternal(targetUrl);
    }
    return true;
});

ipcMain.handle('sync:trigger', async () => {
    if (syncWorker) {
        return await syncWorker.triggerSyncNow();
    }
    return false;
});

ipcMain.handle('settings:toggle-autostart', (_event, enabled) => {
    app.setLoginItemSettings({ openAtLogin: !!enabled });
    updateTrayMenu();
    return true;
});

ipcMain.handle('window:hide', () => {
    if (mainWindow) mainWindow.hide();
    return true;
});

ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
    return true;
});

ipcMain.handle('files:list', async () => {
    if (syncWorker) {
        return await syncWorker.getFilesList();
    }
    return [];
});

ipcMain.handle('files:free-space', async (_event, filename) => {
    if (syncWorker) {
        return await syncWorker.freeUpSpace(filename);
    }
    return { status: 'error', message: 'Tiến trình đồng bộ chưa hoạt động' };
});

ipcMain.handle('files:download-offline', async (_event, filename) => {
    if (syncWorker) {
        return await syncWorker.downloadOffline(filename);
    }
    return { status: 'error', message: 'Tiến trình đồng bộ chưa hoạt động' };
});

ipcMain.handle('files:open', async (_event, filename) => {
    if (syncWorker) {
        return await syncWorker.openFile(filename);
    }
    return { status: 'error', message: 'Tiến trình đồng bộ chưa hoạt động' };
});

ipcMain.handle('settings:get-sync-mode', () => {
    return config.sync_mode || 'offline';
});

ipcMain.handle('settings:set-sync-mode', (_event, mode) => {
    config.sync_mode = mode;
    saveConfig(config);
    if (syncWorker) {
        syncWorker.setSyncMode(mode);
    }
    return true;
});

ipcMain.handle('app:get-version', () => {
    return app.getVersion();
});

ipcMain.handle('app:check-updates', async () => {
    if (updateChecker) {
        return await updateChecker.checkForUpdates();
    }
    return {
        checked: false,
        hasUpdate: false,
        currentVersion: app.getVersion()
    };
});

ipcMain.handle('app:open-external-url', async (_event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        shell.openExternal(url);
        return true;
    }
    return false;
});

ipcMain.handle('app:quit', () => {
    app.isQuitting = true;
    app.quit();
});
