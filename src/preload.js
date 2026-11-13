const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kaolaDrive', {
    // Auth & Info
    login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getState: () => ipcRenderer.invoke('app:get-state'),
    
    // Folder & Shell Actions
    selectFolder: () => ipcRenderer.invoke('folder:select'),
    openFolder: () => ipcRenderer.invoke('folder:open'),
    openWeb: (customUrl) => ipcRenderer.invoke('web:open', customUrl),
    
    // Sync Actions
    syncNow: () => ipcRenderer.invoke('sync:trigger'),
    toggleAutoStart: (enabled) => ipcRenderer.invoke('settings:toggle-autostart', enabled),
    getSyncMode: () => ipcRenderer.invoke('settings:get-sync-mode'),
    setSyncMode: (mode) => ipcRenderer.invoke('settings:set-sync-mode', mode),

    // Virtual Drive (K: in This PC)
    getVirtualDriveStatus: () => ipcRenderer.invoke('virtual-drive:get-status'),
    toggleVirtualDrive: (enabled) => ipcRenderer.invoke('virtual-drive:toggle', enabled),
    openVirtualDrive: () => ipcRenderer.invoke('virtual-drive:open'),

    // File Management (Online vs Offline)
    listFiles: () => ipcRenderer.invoke('files:list'),
    freeUpSpace: (filename) => ipcRenderer.invoke('files:free-space', filename),
    downloadOffline: (filename) => ipcRenderer.invoke('files:download-offline', filename),
    openFile: (filename) => ipcRenderer.invoke('files:open', filename),

    // Window controls
    hideWindow: () => ipcRenderer.invoke('window:hide'),
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    quitApp: () => ipcRenderer.invoke('app:quit'),

    // App Version & Updates
    getAppVersion: () => ipcRenderer.invoke('app:get-version'),
    checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
    openExternalUrl: (url) => ipcRenderer.invoke('app:open-external-url', url),

    // Event Listeners
    onSyncStatus: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('sync:status', handler);
        return () => ipcRenderer.removeListener('sync:status', handler);
    },
    onSyncActivity: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('sync:activity', handler);
        return () => ipcRenderer.removeListener('sync:activity', handler);
    },
    onFilesUpdated: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('files:updated', handler);
        return () => ipcRenderer.removeListener('files:updated', handler);
    },
    onStateChange: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('state:change', handler);
        return () => ipcRenderer.removeListener('state:change', handler);
    },
    onUpdateAvailable: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('app:update-available', handler);
        return () => ipcRenderer.removeListener('app:update-available', handler);
    },
    onTriggerCheckUpdates: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('app:check-updates-trigger', handler);
        return () => ipcRenderer.removeListener('app:check-updates-trigger', handler);
    }
});
