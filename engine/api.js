const fs = require('fs');
const path = require('path');

class DriveSyncApi {
    constructor(serverUrl, token) {
        this.serverUrl = serverUrl.replace(/\/+$/, '');
        this.token = token;
    }

    setToken(token) {
        this.token = token;
    }

    async request(endpoint, options = {}) {
        const url = `${this.serverUrl}/api/v1/drive/sync${endpoint}`;
        const headers = options.headers || {};

        if (this.token && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        headers['Accept'] = 'application/json';

        const res = await fetch(url, {
            ...options,
            headers
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || `API Error ${res.status}: ${res.statusText}`);
            }
            return data;
        }

        if (!res.ok) {
            throw new Error(`API Error ${res.status}: ${res.statusText}`);
        }

        return res;
    }

    /**
     * Đăng nhập lấy Sync Token
     */
    async login(email, password, deviceName = 'Desktop App') {
        const data = await this.request('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, device_name: deviceName })
        });
        if (data.token) {
            this.setToken(data.token);
        }
        return data;
    }

    /**
     * Lấy thông tin tài khoản và dung lượng
     */
    async getInfo() {
        return this.request('/info');
    }

    /**
     * Lấy toàn bộ cây thư mục và danh sách file
     */
    async getTree() {
        return this.request('/tree');
    }

    /**
     * Lấy thay đổi vi sai kể từ mốc thời gian since
     */
    async getChanges(sinceIsoString) {
        const query = sinceIsoString ? `?since=${encodeURIComponent(sinceIsoString)}` : '';
        return this.request(`/changes${query}`);
    }

    /**
     * Tạo thư mục trên Cloud
     */
    async createFolder(name, parentUuid = null) {
        return this.request('/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parent_uuid: parentUuid })
        });
    }

    /**
     * Tải tệp lên Cloud
     */
    async uploadFile(localFilePath, parentUuid = null, fileUuid = null) {
        const filename = path.basename(localFilePath);
        const fileBuffer = fs.readFileSync(localFilePath);
        const blob = new Blob([fileBuffer]);

        const formData = new FormData();
        formData.append('file', blob, filename);
        if (parentUuid) formData.append('parent_uuid', parentUuid);
        if (fileUuid) formData.append('file_uuid', fileUuid);

        return this.request('/upload', {
            method: 'POST',
            body: formData
        });
    }

    /**
     * Tải tệp về từ Cloud và ghi ra đĩa cục bộ
     */
    async downloadFile(uuid, destLocalPath) {
        const url = `${this.serverUrl}/api/v1/drive/sync/download/${uuid}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });

        if (!res.ok) {
            throw new Error(`Download failed with status ${res.status}`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const dir = path.dirname(destLocalPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(destLocalPath, buffer);
        return true;
    }

    /**
     * Thông báo Cloud đưa tệp vào thùng rác
     */
    async deleteFile(uuid) {
        return this.request('/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid })
        });
    }

    /**
     * Lấy danh sách lịch sử phiên bản của tệp
     */
    async getVersions(uuid) {
        return this.request(`/items/${uuid}/versions`);
    }

    /**
     * Khôi phục một phiên bản lịch sử
     */
    async restoreVersion(versionId) {
        return this.request(`/versions/${versionId}/restore`, {
            method: 'POST'
        });
    }

    /**
     * Khóa tệp cho việc chỉnh sửa độc quyền
     */
    async lockFile(uuid, durationMinutes = 60) {
        return this.request(`/items/${uuid}/lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duration: durationMinutes })
        });
    }

    /**
     * Mở khóa tệp
     */
    async unlockFile(uuid) {
        return this.request(`/items/${uuid}/unlock`, {
            method: 'POST'
        });
    }
}

module.exports = DriveSyncApi;
