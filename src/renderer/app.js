document.addEventListener('DOMContentLoaded', async () => {
    // Views & Modals
    const viewLogin = document.getElementById('view-login');
    const viewDashboard = document.getElementById('view-dashboard');
    const modalSettings = document.getElementById('modal-settings');

    // Titlebar
    const btnMinimize = document.getElementById('btn-minimize');
    const btnClose = document.getElementById('btn-close');

    // Login Form Elements
    const formLogin = document.getElementById('form-login');
    const inputEmail = document.getElementById('input-email');
    const inputPassword = document.getElementById('input-password');
    const inputServer = document.getElementById('input-server');
    const inputFolder = document.getElementById('input-folder');
    const btnBrowseFolder = document.getElementById('btn-browse-folder');
    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const loginError = document.getElementById('login-error');

    // Dashboard Elements
    const statusDot = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusDesc = document.getElementById('status-desc');
    const statusBadge = document.getElementById('status-badge');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');
    const userCompany = document.getElementById('user-company');
    const storageNumbers = document.getElementById('storage-numbers');
    const storageFill = document.getElementById('storage-fill');
    const lastSyncTime = document.getElementById('last-sync-time');
    const activityList = document.getElementById('activity-list');

    // Tabs Elements
    const tabBtnActivity = document.getElementById('tab-btn-activity');
    const tabBtnFiles = document.getElementById('tab-btn-files');
    const tabContentActivity = document.getElementById('tab-content-activity');
    const tabContentFiles = document.getElementById('tab-content-files');
    const badgeFilesCount = document.getElementById('badge-files-count');

    // Files Elements
    const filesList = document.getElementById('files-list');
    const summaryTotalFiles = document.getElementById('summary-total-files');
    const summaryOnlineFiles = document.getElementById('summary-online-files');
    const summaryOfflineFiles = document.getElementById('summary-offline-files');
    const inputFilesSearch = document.getElementById('input-files-search');
    const filterBtns = document.querySelectorAll('.filter-btn');

    // Action Buttons
    const btnOpenFolder = document.getElementById('btn-open-folder');
    const btnOpenWeb = document.getElementById('btn-open-web');
    const btnSyncNow = document.getElementById('btn-sync-now');
    const iconSyncNow = document.getElementById('icon-sync-now');
    const btnOpenSettings = document.getElementById('btn-open-settings');

    // Settings Modal Elements
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const settingsFolderPath = document.getElementById('settings-folder-path');
    const settingsServerUrl = document.getElementById('settings-server-url');
    const optModeOffline = document.getElementById('opt-mode-offline');
    const optModeOnline = document.getElementById('opt-mode-online');
    const chkAutoStart = document.getElementById('chk-autostart');
    const chkVirtualDrive = document.getElementById('chk-virtual-drive');
    const iconOpenFolder = document.getElementById('icon-open-folder');
    const lblOpenFolder = document.getElementById('lbl-open-folder');
    const btnLogout = document.getElementById('btn-logout');

    // Update & Version Elements
    const badgeSettingsUpdate = document.getElementById('badge-settings-update');
    const bannerUpdateAlert = document.getElementById('banner-update-alert');
    const bannerUpdateVersion = document.getElementById('banner-update-version');
    const btnBannerViewUpdate = document.getElementById('btn-banner-view-update');
    const btnBannerDismissUpdate = document.getElementById('btn-banner-dismiss-update');
    const lblAppVersion = document.getElementById('lbl-app-version');
    const lblVersionCheckStatus = document.getElementById('lbl-version-check-status');
    const btnCheckUpdatesManual = document.getElementById('btn-check-updates-manual');
    const textCheckUpdates = document.getElementById('text-check-updates');
    const spinnerCheckUpdates = document.getElementById('spinner-check-updates');
    const cardUpdateDetails = document.getElementById('card-update-details');
    const updateNewVersion = document.getElementById('update-new-version');
    const updateReleaseNotes = document.getElementById('update-release-notes');
    const btnDownloadUpdate = document.getElementById('btn-download-update');

    let currentState = null;
    let cachedFiles = [];
    let activeFilter = 'all';
    let searchKeyword = '';
    let currentUpdateInfo = null;
    let appVersion = '1.0.0';

    // Window controls
    btnMinimize.addEventListener('click', () => window.kaolaDrive.minimizeWindow());
    btnClose.addEventListener('click', () => window.kaolaDrive.hideWindow());

    // Switch Views
    function showView(name) {
        if (name === 'login') {
            viewLogin.classList.remove('hidden');
            viewDashboard.classList.add('hidden');
        } else {
            viewLogin.classList.add('hidden');
            viewDashboard.classList.remove('hidden');
        }
    }

    // Render App State
    function renderState(state) {
        if (!state) return;
        currentState = state;

        if (!state.isAuthenticated) {
            showView('login');
            inputFolder.value = state.config?.sync_folder || './KaolaDrive';
            if (inputServer) {
                inputServer.value = state.config?.server_url || '';
            }
            return;
        }

        showView('dashboard');

        // User & Company
        if (state.user) {
            userName.textContent = state.user.name || 'Người dùng';
            userCompany.textContent = state.company?.name || 'Tổ chức';
            const initials = (state.user.name || 'KD').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
            userAvatar.textContent = initials || 'KD';
        }

        // Storage Quota
        if (state.storage) {
            const usedStr = state.storage.formatted || '0 B';
            const maxMb = state.storage.max_storage_mb || 204800; // default 200GB
            const maxStr = maxMb >= 1024 ? Math.round(maxMb / 1024) + ' GB' : maxMb + ' MB';
            storageNumbers.textContent = `${usedStr} / ${maxStr}`;

            const percent = state.storage.used_percentage || 0;
            storageFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }

        // Settings view data
        settingsFolderPath.textContent = state.config?.sync_folder || 'C:\\KaolaDrive';
        if (settingsServerUrl) {
            settingsServerUrl.textContent = state.config?.server_url || 'Chưa thiết lập';
        }
        chkAutoStart.checked = !!state.autoStart;

        // Virtual Drive UI state
        const isVdMounted = state.virtualDrive?.isMounted;
        const vdLetter = state.virtualDrive?.driveLetter || 'K:';
        if (lblOpenFolder && iconOpenFolder) {
            if (isVdMounted) {
                lblOpenFolder.textContent = `Mở Kaola Drive (${vdLetter})`;
                iconOpenFolder.textContent = '💿';
            } else {
                lblOpenFolder.textContent = 'Mở thư mục';
                iconOpenFolder.textContent = '📁';
            }
        }
        if (chkVirtualDrive) {
            chkVirtualDrive.checked = state.config?.enable_virtual_drive !== false;
        }

        // Sync mode radio
        const syncMode = state.config?.sync_mode || 'offline';
        if (optModeOffline && optModeOnline) {
            if (syncMode === 'online_only') {
                optModeOnline.checked = true;
            } else {
                optModeOffline.checked = true;
            }
        }

        // Render activities
        if (state.recentActivities && state.recentActivities.length > 0) {
            renderActivities(state.recentActivities);
        }

        // Status update
        if (state.syncStatus) {
            updateStatusUI(state.syncStatus);
        }

        // Load files list
        loadFiles();
    }

    // Render Status UI
    function updateStatusUI(status) {
        if (!status) return;

        statusDot.className = 'status-dot';
        if (status.state === 'syncing') {
            statusDot.classList.add('syncing');
            statusTitle.textContent = 'Đang đồng bộ...';
            statusDesc.textContent = status.message || 'Đang trao đổi dữ liệu';
            statusBadge.textContent = 'Đang chạy';
            statusBadge.style.color = '#1d4ed8';
            statusBadge.style.background = '#eff6ff';
            statusBadge.style.borderColor = '#bfdbfe';
            iconSyncNow.style.animation = 'spin 1s linear infinite';
        } else if (status.state === 'error') {
            statusDot.classList.add('error');
            statusTitle.textContent = 'Lỗi đồng bộ';
            statusDesc.textContent = status.message || 'Kiểm tra lại kết nối';
            statusBadge.textContent = 'Lỗi';
            statusBadge.style.color = '#b91c1c';
            statusBadge.style.background = '#fef2f2';
            statusBadge.style.borderColor = '#fecaca';
            iconSyncNow.style.animation = 'none';
        } else if (status.state === 'paused') {
            statusDot.classList.add('paused');
            statusTitle.textContent = 'Đã tạm dừng';
            statusDesc.textContent = 'Tiến trình đồng bộ đang dừng';
            statusBadge.textContent = 'Tạm dừng';
            iconSyncNow.style.animation = 'none';
        } else {
            statusDot.classList.add('idle');
            statusTitle.textContent = 'Đã cập nhật';
            statusDesc.textContent = status.message || 'Tất cả tệp đã được đồng bộ';
            statusBadge.textContent = 'Hoàn tất';
            statusBadge.style.color = '#047857';
            statusBadge.style.background = '#ecfdf5';
            statusBadge.style.borderColor = '#a7f3d0';
            iconSyncNow.style.animation = 'none';
        }

        if (status.lastSyncTime) {
            const time = new Date(status.lastSyncTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            lastSyncTime.textContent = `Cập nhật lúc ${time}`;
        }
    }

    // Render Recent Activities List
    function renderActivities(activities) {
        if (!activities || activities.length === 0) {
            activityList.innerHTML = `<div class="empty-activity"><span>Chưa có tệp nào được đồng bộ gần đây</span></div>`;
            return;
        }

        activityList.innerHTML = activities.slice(0, 15).map(item => {
            let icon = '📄';
            let color = '#3b82f6';
            if (item.type === 'download') {
                icon = '⬇️';
            } else if (item.type === 'upload') {
                icon = '⬆️';
            } else if (item.type === 'delete') {
                icon = '🗑️';
            }

            return `
                <div class="activity-item">
                    <span class="activity-icon">${icon}</span>
                    <div class="activity-info">
                        <div class="activity-name" title="${item.filename || 'Tệp'}">${item.filename || 'Tệp'}</div>
                        <div class="activity-meta">${item.message || ''} • ${item.time || ''}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Folder Picker
    btnBrowseFolder.addEventListener('click', async () => {
        const folder = await window.kaolaDrive.selectFolder();
        if (folder) {
            inputFolder.value = folder;
        }
    });

    // Login Form Submit
    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        btnSubmitLogin.disabled = true;
        btnSubmitLogin.querySelector('.btn-text').textContent = 'Đang xác thực...';

        try {
            let serverUrl = inputServer ? inputServer.value.trim() : '';
            if (serverUrl && !/^https?:\/\//i.test(serverUrl)) {
                serverUrl = 'https://' + serverUrl;
            }

            const result = await window.kaolaDrive.login({
                email: inputEmail.value.trim(),
                password: inputPassword.value,
                serverUrl: serverUrl,
                syncFolder: inputFolder.value.trim()
            });

            if (result && result.status === 'success') {
                // Refresh state
                const state = await window.kaolaDrive.getState();
                renderState(state);
            } else {
                loginError.textContent = result?.message || 'Đăng nhập không thành công. Vui lòng kiểm tra lại.';
                loginError.classList.remove('hidden');
            }
        } catch (err) {
            loginError.textContent = err.message || 'Lỗi kết nối máy chủ.';
            loginError.classList.remove('hidden');
        } finally {
            btnSubmitLogin.disabled = false;
            btnSubmitLogin.querySelector('.btn-text').textContent = 'Đăng nhập & Bắt đầu đồng bộ';
        }
    });

    // Action Handlers
    btnOpenFolder.addEventListener('click', () => {
        window.kaolaDrive.openFolder();
    });

    btnOpenWeb.addEventListener('click', () => {
        window.kaolaDrive.openWeb();
    });

    btnSyncNow.addEventListener('click', async () => {
        updateStatusUI({ state: 'syncing', message: 'Đang bắt đầu đồng bộ...' });
        await window.kaolaDrive.syncNow();
    });

    // Settings Modal Handlers
    btnOpenSettings.addEventListener('click', () => {
        modalSettings.classList.remove('hidden');
    });

    btnCloseSettings.addEventListener('click', () => {
        modalSettings.classList.add('hidden');
    });

    chkAutoStart.addEventListener('change', async (e) => {
        await window.kaolaDrive.toggleAutoStart(e.target.checked);
    });

    if (chkVirtualDrive) {
        chkVirtualDrive.addEventListener('change', async (e) => {
            const newStatus = await window.kaolaDrive.toggleVirtualDrive(e.target.checked);
            if (lblOpenFolder && iconOpenFolder) {
                if (newStatus && newStatus.isMounted) {
                    lblOpenFolder.textContent = `Mở Ổ đĩa ${newStatus.driveLetter}`;
                    iconOpenFolder.textContent = '💿';
                } else {
                    lblOpenFolder.textContent = 'Mở thư mục';
                    iconOpenFolder.textContent = '📁';
                }
            }
        });
    }

    // Settings Sync Mode radio handlers
    if (optModeOffline && optModeOnline) {
        optModeOffline.addEventListener('change', async (e) => {
            if (e.target.checked) {
                await window.kaolaDrive.setSyncMode('offline');
            }
        });
        optModeOnline.addEventListener('change', async (e) => {
            if (e.target.checked) {
                await window.kaolaDrive.setSyncMode('online_only');
            }
        });
    }

    btnLogout.addEventListener('click', async () => {
        if (confirm('Bạn có chắc chắn muốn đăng xuất tài khoản Kaola Drive? Tiến trình đồng bộ sẽ tạm dừng.')) {
            await window.kaolaDrive.logout();
            modalSettings.classList.add('hidden');
            const state = await window.kaolaDrive.getState();
            renderState(state);
        }
    });

    // --- Version Management & Update Checker Helpers ---
    function displayUpdateInfo(updateInfo) {
        if (!updateInfo) return;
        currentUpdateInfo = updateInfo;

        if (updateInfo.hasUpdate) {
            // Hiển thị chấm đỏ trên nút Cài đặt
            if (badgeSettingsUpdate) {
                badgeSettingsUpdate.classList.remove('hidden');
            }

            // Hiển thị Banner trên Dashboard nếu chưa bị đóng trong phiên làm việc
            const isDismissed = sessionStorage.getItem('dismiss_update_banner') === '1';
            if (bannerUpdateAlert && !isDismissed) {
                if (bannerUpdateVersion) bannerUpdateVersion.textContent = 'v' + updateInfo.latestVersion;
                bannerUpdateAlert.classList.remove('hidden');
            }

            // Hiển thị chi tiết trong Modal Cài đặt
            if (lblVersionCheckStatus) {
                lblVersionCheckStatus.textContent = 'Có bản mới';
                lblVersionCheckStatus.className = 'ver-check-status has-update';
            }
            if (updateNewVersion) updateNewVersion.textContent = 'v' + updateInfo.latestVersion;
            if (updateReleaseNotes) {
                updateReleaseNotes.textContent = updateInfo.releaseNotes || 'Phiên bản cải tiến và ổn định hệ sinh thái Kaola.';
            }
            if (cardUpdateDetails) {
                cardUpdateDetails.classList.remove('hidden');
            }
        } else {
            // Đã là phiên bản mới nhất
            if (badgeSettingsUpdate) {
                badgeSettingsUpdate.classList.add('hidden');
            }
            if (bannerUpdateAlert) {
                bannerUpdateAlert.classList.add('hidden');
            }
            if (lblVersionCheckStatus) {
                lblVersionCheckStatus.textContent = 'Phiên bản mới nhất';
                lblVersionCheckStatus.className = 'ver-check-status up-to-date';
            }
            if (cardUpdateDetails) {
                cardUpdateDetails.classList.add('hidden');
            }
        }
    }

    async function checkUpdates(isManual = false) {
        if (isManual) {
            if (spinnerCheckUpdates) spinnerCheckUpdates.classList.remove('hidden');
            if (textCheckUpdates) textCheckUpdates.textContent = 'Đang kiểm tra...';
            if (btnCheckUpdatesManual) btnCheckUpdatesManual.disabled = true;
        }

        try {
            const res = await window.kaolaDrive.checkForUpdates();
            displayUpdateInfo(res);
            if (isManual && !res.hasUpdate) {
                if (lblVersionCheckStatus) {
                    lblVersionCheckStatus.textContent = 'Đã là bản mới nhất';
                    lblVersionCheckStatus.className = 'ver-check-status up-to-date';
                }
            }
        } catch (e) {
            console.error('Lỗi kiểm tra cập nhật:', e);
            if (isManual && lblVersionCheckStatus) {
                lblVersionCheckStatus.textContent = 'Lỗi kết nối';
                lblVersionCheckStatus.className = 'ver-check-status';
            }
        } finally {
            if (isManual) {
                if (spinnerCheckUpdates) spinnerCheckUpdates.classList.add('hidden');
                if (textCheckUpdates) textCheckUpdates.textContent = '🔄 Kiểm tra bản mới';
                if (btnCheckUpdatesManual) btnCheckUpdatesManual.disabled = false;
            }
        }
    }

    // Banner handlers
    if (btnBannerViewUpdate) {
        btnBannerViewUpdate.addEventListener('click', () => {
            modalSettings.classList.remove('hidden');
            if (cardUpdateDetails) {
                cardUpdateDetails.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }

    if (btnBannerDismissUpdate) {
        btnBannerDismissUpdate.addEventListener('click', () => {
            if (bannerUpdateAlert) bannerUpdateAlert.classList.add('hidden');
            sessionStorage.setItem('dismiss_update_banner', '1');
        });
    }

    // Manual Check Updates Handler
    if (btnCheckUpdatesManual) {
        btnCheckUpdatesManual.addEventListener('click', () => {
            checkUpdates(true);
        });
    }

    // Download Update Handler
    if (btnDownloadUpdate) {
        btnDownloadUpdate.addEventListener('click', async () => {
            const downloadUrl = (currentUpdateInfo && currentUpdateInfo.downloadUrl) 
                ? currentUpdateInfo.downloadUrl 
                : 'https://kaola.vn/download/KaolaDrive_Setup.exe';
            await window.kaolaDrive.openExternalUrl(downloadUrl);
        });
    }

    // Tabs Navigation
    function switchTab(tabName) {
        if (tabName === 'activity') {
            tabBtnActivity.classList.add('active');
            tabBtnFiles.classList.remove('active');
            tabContentActivity.classList.remove('hidden');
            tabContentFiles.classList.add('hidden');
        } else {
            tabBtnActivity.classList.remove('active');
            tabBtnFiles.classList.add('active');
            tabContentActivity.classList.add('hidden');
            tabContentFiles.classList.remove('hidden');
            loadFiles();
        }
    }

    if (tabBtnActivity) tabBtnActivity.addEventListener('click', () => switchTab('activity'));
    if (tabBtnFiles) tabBtnFiles.addEventListener('click', () => switchTab('files'));

    // Files On-Demand helpers
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getFileIcon(ext) {
        const map = {
            pdf: '📑',
            doc: '📝', docx: '📝',
            xls: '📊', xlsx: '📊', csv: '📊',
            ppt: '📽️', pptx: '📽️',
            png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
            zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
            txt: '📄', md: '📄', log: '📄',
            js: '💻', ts: '💻', php: '💻', py: '💻', html: '💻', css: '💻', json: '💻'
        };
        return map[(ext || '').toLowerCase()] || '📄';
    }

    async function loadFiles() {
        if (!filesList) return;
        try {
            cachedFiles = await window.kaolaDrive.listFiles();
            renderFiles();
        } catch (err) {
            filesList.innerHTML = `<div class="empty-activity"><span>Lỗi tải danh sách: ${err.message}</span></div>`;
        }
    }

    function renderFiles() {
        if (!filesList) return;

        const total = cachedFiles.length;
        const onlineCount = cachedFiles.filter(f => f.status === 'online_only').length;
        const offlineCount = cachedFiles.filter(f => f.status === 'offline').length;

        if (badgeFilesCount) badgeFilesCount.textContent = total;
        if (summaryTotalFiles) summaryTotalFiles.textContent = `${total} tệp`;
        if (summaryOnlineFiles) summaryOnlineFiles.textContent = `☁️ ${onlineCount} Online`;
        if (summaryOfflineFiles) summaryOfflineFiles.textContent = `🟢 ${offlineCount} Offline`;

        let filtered = cachedFiles;
        if (activeFilter === 'online') {
            filtered = filtered.filter(f => f.status === 'online_only');
        } else if (activeFilter === 'offline') {
            filtered = filtered.filter(f => f.status === 'offline');
        }

        if (searchKeyword) {
            const kw = searchKeyword.toLowerCase();
            filtered = filtered.filter(f => f.name.toLowerCase().includes(kw));
        }

        if (filtered.length === 0) {
            filesList.innerHTML = `
                <div class="empty-activity">
                    <span>${total === 0 ? 'Thư mục đồng bộ trống. Chưa có tệp nào trên Cloud.' : 'Không có tệp nào khớp với tìm kiếm hoặc bộ lọc'}</span>
                </div>
            `;
            return;
        }

        filesList.innerHTML = filtered.map(f => {
            const isOnline = f.status === 'online_only';
            const sizeStr = formatBytes(f.size);
            const icon = getFileIcon(f.extension);
            const vStr = f.version ? ` • v${f.version}` : '';

            let statusBadge = isOnline
                ? `<span class="badge-status badge-status-online" title="Chỉ lưu trên Cloud, 0 B trên máy">☁️ Cloud (0 B)</span>`
                : `<span class="badge-status badge-status-offline" title="Đã có sẵn trên ổ cứng máy tính">🟢 Offline</span>`;

            let lockBadge = f.isLocked
                ? `<span class="badge-status badge-status-locked" title="Đang bị khóa bởi ${f.lockedByName || 'thành viên khác'}">🔒 Khóa</span>`
                : '';

            let actionButtons = '';
            if (isOnline) {
                actionButtons = `
                    <button class="btn-file-action btn-file-download" data-action="download" data-filename="${f.name}" title="Tải về máy tính để sẵn sàng dùng ngoại tuyến">⬇️ Tải về</button>
                    <button class="btn-file-action btn-file-open" data-action="open" data-filename="${f.name}" title="Tự động tải về và mở ngay">↗️ Mở</button>
                `;
            } else {
                actionButtons = `
                    <button class="btn-file-action btn-file-free" data-action="free" data-filename="${f.name}" title="Giải phóng dung lượng: Xóa bản copy trên máy tính, giữ nguyên 100% trên Cloud">☁️ Giải phóng</button>
                    <button class="btn-file-action btn-file-open" data-action="open" data-filename="${f.name}" title="Mở tệp">↗️ Mở</button>
                `;
            }

            return `
                <div class="file-card">
                    <div class="file-icon">${icon}</div>
                    <div class="file-main">
                        <div class="file-name-row">
                            <span class="file-title" title="${f.name}">${f.name}</span>
                        </div>
                        <div class="file-meta-row">
                            <span>${sizeStr}${vStr}</span>
                            ${statusBadge}
                            ${lockBadge}
                        </div>
                    </div>
                    <div class="file-actions">
                        ${actionButtons}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Filter Buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderFiles();
        });
    });

    // Search input
    if (inputFilesSearch) {
        inputFilesSearch.addEventListener('input', (e) => {
            searchKeyword = e.target.value.trim();
            renderFiles();
        });
    }

    // File card action buttons (Free up space, Download offline, Open)
    if (filesList) {
        filesList.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-file-action');
            if (!btn) return;

            const action = btn.dataset.action;
            const filename = btn.dataset.filename;
            if (!action || !filename) return;

            btn.disabled = true;
            const originalText = btn.innerHTML;

            try {
                if (action === 'free') {
                    btn.innerHTML = '⏳ Đang xóa...';
                    await window.kaolaDrive.freeUpSpace(filename);
                    await loadFiles();
                } else if (action === 'download') {
                    btn.innerHTML = '⬇️ Đang tải...';
                    await window.kaolaDrive.downloadOffline(filename);
                    await loadFiles();
                } else if (action === 'open') {
                    btn.innerHTML = '↗️ Đang mở...';
                    await window.kaolaDrive.openFile(filename);
                    await loadFiles();
                }
            } catch (err) {
                alert(`Lỗi thực hiện [${action}]: ` + err.message);
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }

    // Real-time Event Listeners from Main Process
    window.kaolaDrive.onFilesUpdated(() => {
        loadFiles();
    });
    window.kaolaDrive.onSyncStatus((status) => {
        updateStatusUI(status);
    });

    window.kaolaDrive.onSyncActivity((activity) => {
        if (currentState) {
            currentState.recentActivities = currentState.recentActivities || [];
            currentState.recentActivities.unshift(activity);
            renderActivities(currentState.recentActivities);
        }
    });

    window.kaolaDrive.onStateChange((state) => {
        renderState(state);
    });

    window.kaolaDrive.onUpdateAvailable((info) => {
        displayUpdateInfo(info);
    });

    window.kaolaDrive.onTriggerCheckUpdates(() => {
        modalSettings.classList.remove('hidden');
        checkUpdates(true);
    });

    // Initial Load
    try {
        const state = await window.kaolaDrive.getState();
        renderState(state);

        // Load App Version
        appVersion = await window.kaolaDrive.getAppVersion();
        if (lblAppVersion) {
            lblAppVersion.textContent = 'v' + appVersion;
        }

        // Tự động kiểm tra bản cập nhật mới sau khi app khởi động 2.5s
        setTimeout(() => {
            checkUpdates(false);
        }, 2500);
    } catch (e) {
        console.error('Lỗi khởi tạo:', e);
    }
});
