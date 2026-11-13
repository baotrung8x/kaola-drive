const EventEmitter = require('events');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const os = require('os');

class UpdateChecker extends EventEmitter {
    constructor(currentVersion = '1.0.0', serverBaseUrl = '') {
        super();
        this.currentVersion = currentVersion;
        this.serverBaseUrl = serverBaseUrl;
        this.lastCheckResult = null;
        this.timer = null;
        this.deviceId = this.getOrGenerateDeviceId();
    }

    /**
     * Lấy hoặc tạo mã định danh máy ẩn danh
     */
    getOrGenerateDeviceId() {
        try {
            const networkInterfaces = os.networkInterfaces();
            for (const name of Object.keys(networkInterfaces)) {
                for (const net of networkInterfaces[name]) {
                    if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                        return 'dev_' + Buffer.from(net.mac).toString('hex').substring(0, 16);
                    }
                }
            }
        } catch (e) {}
        return 'dev_' + os.hostname().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    /**
     * So sánh 2 chuỗi phiên bản dạng semver (vd: 1.0.1 so với 1.0.0)
     * Trả về:
     *  1 nếu v1 > v2 (có bản mới)
     * -1 nếu v1 < v2
     *  0 nếu v1 == v2
     */
    compareVersion(v1, v2) {
        if (!v1 || !v2) return 0;
        const p1 = String(v1).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
        const p2 = String(v2).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
        const len = Math.max(p1.length, p2.length);
        for (let i = 0; i < len; i++) {
            const n1 = p1[i] || 0;
            const n2 = p2[i] || 0;
            if (n1 > n2) return 1;
            if (n1 < n2) return -1;
        }
        return 0;
    }

    /**
     * Danh sách các endpoint kiểm tra phiên bản (ưu tiên máy chủ đang đăng nhập)
     */
    getEndpoints() {
        const list = [];
        if (this.serverBaseUrl) {
            try {
                const u = new URL(this.serverBaseUrl);
                list.push(`${u.origin}/api/v1/drive/init`);
            } catch (e) {}
        }
        list.push('http://kaolawork.test/api/v1/drive/init');
        list.push('https://work.kaola.vn/api/v1/drive/init');
        list.push('https://kaola.vn/api/v1/drive/init');
        list.push('https://kaola.vn/wp-json/kaola-rm/v1/releases/kaola-drive/latest');
        return Array.from(new Set(list));
    }

    /**
     * Gửi HTTP/HTTPS GET request hỗ trợ Timeout & Follow Redirects
     */
    fetchJson(urlStr, timeoutMs = 3500) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(urlStr);
            const lib = urlObj.protocol === 'https:' ? https : http;
            
            const req = lib.get(urlStr, {
                headers: {
                    'User-Agent': `KaolaDrive/${this.currentVersion} (Windows; ${os.release()})`,
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                timeout: timeoutMs
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    return resolve(this.fetchJson(res.headers.location, timeoutMs));
                }

                if (res.statusCode !== 200) {
                    res.resume();
                    return reject(new Error(`HTTP status ${res.statusCode}`));
                }

                let data = '';
                res.setEncoding('utf8');
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json);
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy(new Error('Request timed out'));
            });

            req.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Thực hiện kiểm tra cập nhật trên các endpoints
     */
    async checkForUpdates() {
        const queryParams = `?app=drive&v=${encodeURIComponent(this.currentVersion)}&device_id=${encodeURIComponent(this.deviceId)}&os=Windows&_t=${Date.now()}`;
        const endpoints = this.getEndpoints();

        let remoteData = null;

        for (const ep of endpoints) {
            try {
                const targetUrl = ep.includes('?') ? `${ep}&${queryParams.substring(1)}` : `${ep}${queryParams}`;
                const data = await this.fetchJson(targetUrl);
                if (data && (data.update || data.status === 'success' || data.release)) {
                    remoteData = data;
                    break;
                }
            } catch (err) {
                // Thử endpoint tiếp theo
            }
        }

        if (!remoteData) {
            return {
                checked: true,
                hasUpdate: false,
                currentVersion: this.currentVersion,
                latestVersion: this.currentVersion,
                message: 'Không thể kết nối máy chủ kiểm tra cập nhật'
            };
        }

        // Chuẩn hóa định dạng từ các API khác nhau
        let latestVersion = this.currentVersion;
        let downloadUrl = 'https://kaola.vn/download/KaolaDrive_Setup.exe';
        let releaseNotes = '';
        let forceUpdate = false;

        if (remoteData.update) {
            latestVersion = remoteData.update.latest_version || remoteData.update.version || this.currentVersion;
            downloadUrl = remoteData.update.download_url || downloadUrl;
            releaseNotes = remoteData.update.release_notes || '';
            forceUpdate = !!remoteData.update.force_update;
        } else if (remoteData.release && remoteData.release.version) {
            latestVersion = remoteData.release.version;
            downloadUrl = remoteData.release.download_url || downloadUrl;
            releaseNotes = remoteData.release.changelog || '';
        }

        const hasUpdate = this.compareVersion(latestVersion, this.currentVersion) > 0;

        const result = {
            checked: true,
            hasUpdate,
            currentVersion: this.currentVersion,
            latestVersion,
            downloadUrl,
            releaseNotes,
            forceUpdate
        };

        this.lastCheckResult = result;

        if (hasUpdate) {
            this.emit('update-available', result);
        }

        return result;
    }

    /**
     * Bắt đầu tiến trình kiểm tra định kỳ (mặc định mỗi 30 phút)
     */
    startPeriodicCheck(intervalMs = 30 * 60 * 1000) {
        this.stopPeriodicCheck();
        
        // Kiểm tra lần đầu sau 6 giây kể từ khi mở ứng dụng
        setTimeout(() => {
            this.checkForUpdates().catch(() => {});
        }, 6000);

        // Chu kỳ định kỳ
        this.timer = setInterval(() => {
            this.checkForUpdates().catch(() => {});
        }, intervalMs);
    }

    /**
     * Dừng tiến trình kiểm tra định kỳ
     */
    stopPeriodicCheck() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}

module.exports = UpdateChecker;
