const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { calculateFileHash } = require('./hasher');

class SyncWorker extends EventEmitter {
    constructor(api, syncFolder, intervalSeconds = 15, syncMode = 'offline') {
        super();
        this.api = api;
        this.syncFolder = path.resolve(syncFolder);
        this.intervalMs = intervalSeconds * 1000;
        this.syncMode = syncMode || 'offline'; // 'offline' | 'online_only'
        this.metaFilePath = path.join(this.syncFolder, '.kaola-sync-meta.json');
        this.meta = {
            last_sync_time: null,
            file_map: {} // local_relative_path -> { uuid, checksum, version, size, status, is_locked, updated_at }
        };
        this.isRunning = false;
        this.isSyncing = false;
        this.recentActivities = [];
    }

    setSyncMode(mode) {
        this.syncMode = mode || 'offline';
        this.log(`Chế độ đồng bộ đã chuyển sang: ${this.syncMode === 'online_only' ? 'Tiết kiệm dung lượng (Online-only)' : 'Lưu sẵn ngoại tuyến (Offline)'}`);
    }

    emitActivity(activity) {
        const item = {
            id: Date.now() + Math.random().toString(36).substring(2, 7),
            time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            ...activity
        };
        this.recentActivities.unshift(item);
        if (this.recentActivities.length > 50) {
            this.recentActivities.pop();
        }
        this.emit('activity', item);
    }

    log(msg, type = 'info') {
        const time = new Date().toLocaleTimeString('vi-VN');
        const prefix = {
            info: '[\x1b[36mINFO\x1b[0m]',
            success: '[\x1b[32mOK\x1b[0m]',
            warn: '[\x1b[33mWARN\x1b[0m]',
            error: '[\x1b[31mERROR\x1b[0m]',
            sync: '[\x1b[35mSYNC\x1b[0m]'
        }[type] || '[INFO]';
        console.log(`${time} ${prefix} ${msg}`);
    }

    init() {
        if (!fs.existsSync(this.syncFolder)) {
            fs.mkdirSync(this.syncFolder, { recursive: true });
            this.log(`Đã tạo thư mục đồng bộ cục bộ: ${this.syncFolder}`);
        }

        if (fs.existsSync(this.metaFilePath)) {
            try {
                this.meta = JSON.parse(fs.readFileSync(this.metaFilePath, 'utf8'));
                if (!this.meta.file_map) this.meta.file_map = {};
            } catch (e) {
                this.meta = { last_sync_time: null, file_map: {} };
            }
        }

        // Tự động gán status cho các mục cũ nếu chưa có
        for (let [relPath, info] of Object.entries(this.meta.file_map)) {
            if (!info.status) {
                const fullPath = path.join(this.syncFolder, relPath);
                info.status = fs.existsSync(fullPath) ? 'offline' : 'online_only';
            }
        }
    }

    saveMeta() {
        try {
            fs.writeFileSync(this.metaFilePath, JSON.stringify(this.meta, null, 2), 'utf8');
        } catch (e) {
            // Ignore error writing hidden meta
        }
    }

    start() {
        this.init();
        this.isRunning = true;
        this.log(`Khởi động tiến trình đồng bộ Kaola Drive. Chu kỳ quét: ${this.intervalMs / 1000}s`);
        this.emit('status', { state: 'idle', message: 'Sẵn sàng đồng bộ', lastSyncTime: this.meta.last_sync_time });

        // Chạy đồng bộ lần đầu ngay lập tức
        this.syncCycle().catch(err => {
            this.log(err.message, 'error');
            this.emit('status', { state: 'error', message: err.message });
        });

        // Lặp định kỳ
        this.timer = setInterval(() => {
            if (!this.isSyncing && this.isRunning) {
                this.syncCycle().catch(err => {
                    this.log(err.message, 'error');
                    this.emit('status', { state: 'error', message: err.message });
                });
            }
        }, this.intervalMs);
    }

    stop() {
        this.isRunning = false;
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.log('Đã dừng tiến trình đồng bộ.');
        this.emit('status', { state: 'paused', message: 'Tiến trình đồng bộ đã tạm dừng' });
    }

    setSyncFolder(newFolder) {
        this.syncFolder = path.resolve(newFolder);
        this.metaFilePath = path.join(this.syncFolder, '.kaola-sync-meta.json');
        this.init();
    }

    async triggerSyncNow() {
        if (this.isSyncing) return false;
        this.syncCycle().catch(err => {
            this.log(err.message, 'error');
            this.emit('status', { state: 'error', message: err.message });
        });
        return true;
    }

    async syncCycle() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        this.emit('status', { state: 'syncing', message: 'Đang kiểm tra và đồng bộ...' });

        try {
            // 1. Kéo thay đổi từ Cloud về máy tính (Cloud -> Local)
            await this.pullFromCloud();

            // 2. Quét thay đổi từ máy tính đẩy lên Cloud (Local -> Cloud)
            await this.pushToCloud();

            this.meta.last_sync_time = new Date().toISOString();
            this.saveMeta();
            this.emit('status', {
                state: 'idle',
                message: 'Tất cả tệp đã được cập nhật',
                lastSyncTime: this.meta.last_sync_time
            });
            this.emit('files:updated');
        } catch (err) {
            this.emit('status', { state: 'error', message: err.message });
            throw err;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Kéo các tệp mới/sửa/xóa từ Cloud về máy tính
     * Tôn trọng chế độ online_only (Smart Sync)
     */
    async pullFromCloud() {
        try {
            const res = await this.api.getChanges(this.meta.last_sync_time);
            if (res.status !== 'success') return;

            const changes = res.changes || {};

            // Xử lý tệp đã bị xóa trên Cloud
            if (Array.isArray(changes.deleted_uuids)) {
                for (let deletedUuid of changes.deleted_uuids) {
                    for (let [relPath, info] of Object.entries(this.meta.file_map)) {
                        if (info.uuid === deletedUuid) {
                            const fullPath = path.join(this.syncFolder, relPath);
                            if (fs.existsSync(fullPath)) {
                                fs.unlinkSync(fullPath);
                                this.log(`[Xóa cục bộ] Tệp đã bị xóa trên Cloud: ${relPath}`, 'warn');
                                this.emitActivity({
                                    type: 'delete',
                                    filename: relPath,
                                    status: 'success',
                                    message: 'Đã xóa theo Cloud'
                                });
                            }
                            delete this.meta.file_map[relPath];
                        }
                    }
                }
            }

            // Xử lý tệp mới hoặc được sửa trên Cloud
            if (Array.isArray(changes.files)) {
                for (let file of changes.files) {
                    const localPath = path.join(this.syncFolder, file.name);
                    const localExists = fs.existsSync(localPath);
                    const metaItem = this.meta.file_map[file.name];

                    // Kiểm tra xem tệp có nên duy trì ở chế độ Online-only không:
                    // 1. Nếu người dùng đã giải phóng dung lượng (status === 'online_only' và chưa tải lại)
                    // 2. Hoặc chế độ tổng quát là 'online_only' và tệp chưa được yêu cầu giữ offline
                    const keepOnlineOnly = (metaItem && metaItem.status === 'online_only' && !localExists) ||
                                           (this.syncMode === 'online_only' && (!metaItem || metaItem.status !== 'offline'));

                    if (keepOnlineOnly) {
                        // Cập nhật metadata, KHÔNG tải byte tệp về ổ cứng (tiết kiệm dung lượng)
                        this.meta.file_map[file.name] = {
                            uuid: file.uuid,
                            checksum: file.checksum,
                            version: file.version,
                            size: file.file_size,
                            status: 'online_only',
                            is_locked: !!file.is_locked,
                            locked_by_name: file.locked_by_name,
                            updated_at: file.updated_at
                        };
                        this.log(`[Chỉ lưu Cloud] Đã lập chỉ mục tệp On-Demand: ${file.name} (0 bytes trên đĩa)`, 'sync');
                        continue;
                    }

                    // Tải về vật lý nếu ở chế độ Offline hoặc tệp đã được yêu cầu tải Offline
                    const currentLocalHash = localExists ? await calculateFileHash(localPath) : null;

                    if (currentLocalHash !== file.checksum) {
                        this.log(`[Tải về] Đang cập nhật từ Cloud: ${file.name} (v${file.version})...`, 'sync');
                        this.emit('status', { state: 'syncing', message: `Đang tải về: ${file.name}...` });
                        await this.api.downloadFile(file.uuid, localPath);
                        this.meta.file_map[file.name] = {
                            uuid: file.uuid,
                            checksum: file.checksum,
                            version: file.version,
                            size: file.file_size,
                            status: 'offline',
                            is_locked: !!file.is_locked,
                            locked_by_name: file.locked_by_name,
                            updated_at: file.updated_at
                        };
                        this.log(`[Đã tải] Hoàn tất: ${file.name}`, 'success');
                        this.emitActivity({
                            type: 'download',
                            filename: file.name,
                            version: file.version,
                            size: file.file_size,
                            status: 'success',
                            message: `Đã tải về tệp (v${file.version})`
                        });
                    } else {
                        // File đã có sẵn và trùng khớp hash
                        this.meta.file_map[file.name] = {
                            ...this.meta.file_map[file.name],
                            uuid: file.uuid,
                            checksum: file.checksum,
                            version: file.version,
                            size: file.file_size,
                            status: 'offline',
                            is_locked: !!file.is_locked,
                            locked_by_name: file.locked_by_name,
                            updated_at: file.updated_at
                        };
                    }
                }
            }
        } catch (e) {
            this.log(`Lỗi khi kéo dữ liệu từ Cloud: ${e.message}`, 'error');
            this.emitActivity({
                type: 'error',
                filename: 'Cloud Sync',
                status: 'error',
                message: e.message
            });
        }
    }

    /**
     * Quét các tệp mới/sửa trên máy tính và đẩy lên Cloud
     */
    async pushToCloud() {
        try {
            const files = fs.readdirSync(this.syncFolder);

            for (let filename of files) {
                // Bỏ qua file meta ẩn, temp, hoặc file hệ thống của ổ đĩa ảo
                const lower = filename.toLowerCase();
                if (filename.startsWith('.') || filename.startsWith('~$') || lower === 'autorun.inf' || lower === 'icon.ico' || lower === 'desktop.ini' || lower === 'thumbs.db') continue;

                const fullPath = path.join(this.syncFolder, filename);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // Chưa xử lý subfolder trong prototype ngắn hạn
                    continue;
                }

                const localHash = await calculateFileHash(fullPath);
                const metaItem = this.meta.file_map[filename];

                // Nếu file chưa có trên meta hoặc hash đã thay đổi -> Đẩy lên Cloud
                if (!metaItem || metaItem.checksum !== localHash) {
                    this.log(`[Tải lên] Phát hiện thay đổi cục bộ, đang đẩy lên Cloud: ${filename}...`, 'sync');
                    this.emit('status', { state: 'syncing', message: `Đang tải lên: ${filename}...` });

                    try {
                        const uploadRes = await this.api.uploadFile(fullPath, null, metaItem ? metaItem.uuid : null);

                        if (uploadRes && uploadRes.status === 'success' && uploadRes.item) {
                            this.meta.file_map[filename] = {
                                uuid: uploadRes.item.uuid,
                                checksum: uploadRes.item.checksum,
                                version: uploadRes.item.version,
                                size: uploadRes.item.file_size,
                                status: 'offline',
                                updated_at: uploadRes.item.updated_at
                            };
                            this.log(`[Đã tải lên] Thành công: ${filename} (v${uploadRes.item.version})`, 'success');
                            this.emitActivity({
                                type: 'upload',
                                filename: filename,
                                version: uploadRes.item.version,
                                size: uploadRes.item.file_size,
                                status: 'success',
                                message: `Đã tải lên Cloud (v${uploadRes.item.version})`
                            });
                        }
                    } catch (uploadErr) {
                        const errMsg = uploadErr.message || '';
                        const isLockError = errMsg.includes('423') || errMsg.toLowerCase().includes('khóa') || errMsg.toLowerCase().includes('locked');

                        if (isLockError) {
                            this.log(`[Khóa tệp] Không thể đẩy ${filename}: ${errMsg}`, 'warn');
                            this.emitActivity({
                                type: 'warn',
                                filename: filename,
                                status: 'locked',
                                message: `Tệp đang bị khóa bởi thành viên khác. Bản sửa đổi cục bộ được giữ nguyên.`
                            });
                        } else {
                            this.log(`[Lỗi tải lên] ${filename}: ${errMsg}`, 'error');
                            this.emitActivity({
                                type: 'error',
                                filename: filename,
                                status: 'error',
                                message: errMsg
                            });
                        }
                    }
                }
            }
        } catch (e) {
            this.log(`Lỗi khi đẩy dữ liệu lên Cloud: ${e.message}`, 'error');
            this.emitActivity({
                type: 'error',
                filename: 'Upload',
                status: 'error',
                message: e.message
            });
        }
    }

    /**
     * Giải phóng dung lượng (Free up space): Xóa bản copy cục bộ trên đĩa, giữ nguyên trên Cloud
     */
    async freeUpSpace(filename) {
        const fullPath = path.join(this.syncFolder, filename);
        let metaItem = this.meta.file_map[filename];

        if (fs.existsSync(fullPath)) {
            try {
                fs.unlinkSync(fullPath);
            } catch (err) {
                throw new Error(`Không thể xóa tệp cục bộ (có thể đang được mở bởi ứng dụng khác): ${err.message}`);
            }
        }

        if (metaItem) {
            metaItem.status = 'online_only';
        } else {
            this.meta.file_map[filename] = {
                status: 'online_only'
            };
        }
        this.saveMeta();

        this.log(`[Giải phóng] Đã giải phóng dung lượng ổ cứng cho: ${filename}`, 'info');
        this.emitActivity({
            type: 'free_space',
            filename: filename,
            status: 'success',
            message: 'Đã giải phóng dung lượng ổ cứng (chỉ lưu trên Cloud)'
        });
        this.emit('files:updated');
        return { status: 'success', filename };
    }

    /**
     * Tải về ngoại tuyến (Make available offline): Tải file vật lý từ Cloud về máy
     */
    async downloadOffline(filename) {
        const fullPath = path.join(this.syncFolder, filename);
        let metaItem = this.meta.file_map[filename];

        // Nếu chưa có uuid trong meta, tra cứu từ Cloud tree
        if (!metaItem || !metaItem.uuid) {
            const tree = await this.api.getTree();
            if (tree && Array.isArray(tree.files)) {
                const found = tree.files.find(f => f.name === filename);
                if (found) {
                    metaItem = {
                        uuid: found.uuid,
                        checksum: found.checksum,
                        version: found.version,
                        size: found.file_size,
                        status: 'online_only'
                    };
                    this.meta.file_map[filename] = metaItem;
                }
            }
        }

        if (!metaItem || !metaItem.uuid) {
            throw new Error(`Không tìm thấy thông tin tệp trên Cloud để tải về: ${filename}`);
        }

        this.emit('status', { state: 'syncing', message: `Đang tải về: ${filename}...` });
        await this.api.downloadFile(metaItem.uuid, fullPath);

        const newHash = await calculateFileHash(fullPath);
        metaItem.checksum = newHash;
        metaItem.status = 'offline';
        this.saveMeta();

        this.log(`[Tải Offline] Đã lưu tệp sẵn sàng ngoại tuyến: ${filename}`, 'success');
        this.emitActivity({
            type: 'download',
            filename: filename,
            status: 'success',
            message: 'Đã tải về sẵn sàng ngoại tuyến (Offline)'
        });
        this.emit('status', { state: 'idle', message: 'Tất cả tệp đã được cập nhật' });
        this.emit('files:updated');
        return { status: 'success', filename, path: fullPath };
    }

    /**
     * Mở tệp: Nếu đang là Online-only, tự động tải về trước rồi mở bằng ứng dụng mặc định
     */
    async openFile(filename) {
        const fullPath = path.join(this.syncFolder, filename);
        const exists = fs.existsSync(fullPath);
        const metaItem = this.meta.file_map[filename];

        if (!exists || (metaItem && metaItem.status === 'online_only')) {
            this.log(`[Mở tệp On-Demand] Đang kéo tệp từ Cloud về trước khi mở: ${filename}...`, 'info');
            await this.downloadOffline(filename);
        }

        const { shell } = require('electron');
        await shell.openPath(fullPath);
        return { status: 'success', path: fullPath };
    }

    /**
     * Lấy danh sách hợp nhất tất cả tệp (Cloud + Local Meta) kèm trạng thái Online/Offline
     */
    async getFilesList() {
        let cloudFiles = [];
        try {
            const tree = await this.api.getTree();
            if (tree && Array.isArray(tree.files)) {
                cloudFiles = tree.files;
            }
        } catch (e) {
            this.log(`Lỗi kết nối khi lấy cây thư mục từ Cloud: ${e.message}`, 'warn');
        }

        const result = [];
        const processed = new Set();

        // 1. Quét tệp từ Cloud tree
        for (const cf of cloudFiles) {
            processed.add(cf.name);
            const fullPath = path.join(this.syncFolder, cf.name);
            const existsLocally = fs.existsSync(fullPath);
            const meta = this.meta.file_map[cf.name];

            let status = 'online_only';
            if (meta && meta.status) {
                status = (meta.status === 'offline' && existsLocally) ? 'offline' : 'online_only';
            } else if (existsLocally) {
                status = 'offline';
            }

            result.push({
                uuid: cf.uuid,
                name: cf.name,
                size: cf.file_size || 0,
                version: cf.version || 1,
                status: status,
                existsLocally: existsLocally,
                isLocked: !!cf.is_locked,
                isLockedByOther: !!cf.is_locked_by_other,
                lockedByName: cf.locked_by_name || null,
                extension: cf.extension || path.extname(cf.name).replace('.', ''),
                updatedAt: cf.updated_at || null
            });
        }

        // 2. Thêm các tệp cục bộ có trong meta mà chưa có trên Cloud tree
        for (const [relPath, meta] of Object.entries(this.meta.file_map)) {
            const lower = relPath.toLowerCase();
            if (lower === 'autorun.inf' || lower === 'icon.ico' || lower === 'desktop.ini' || lower === 'thumbs.db') continue;

            if (!processed.has(relPath)) {
                processed.add(relPath);
                const fullPath = path.join(this.syncFolder, relPath);
                const existsLocally = fs.existsSync(fullPath);
                result.push({
                    uuid: meta.uuid || null,
                    name: relPath,
                    size: meta.size || 0,
                    version: meta.version || 1,
                    status: existsLocally ? 'offline' : 'online_only',
                    existsLocally: existsLocally,
                    isLocked: false,
                    isLockedByOther: false,
                    lockedByName: null,
                    extension: path.extname(relPath).replace('.', ''),
                    updatedAt: meta.updated_at || null
                });
            }
        }

        return result;
    }
}

module.exports = SyncWorker;
