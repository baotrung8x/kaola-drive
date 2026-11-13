const fs = require('fs');
const path = require('path');
const DriveSyncApi = require('./engine/api');
const SyncWorker = require('./engine/sync-worker');

const configPath = path.join(__dirname, 'config.json');

function printBanner() {
    console.log('\x1b[36m====================================================\x1b[0m');
    console.log('\x1b[1m\x1b[34m   KAOLA DRIVE DESKTOP SYNC CLIENT v1.0.0\x1b[0m');
    console.log('\x1b[32m   Tự động đồng bộ tệp hai chiều giữa PC và Cloud\x1b[0m');
    console.log('\x1b[36m====================================================\x1b[0m\n');
}

async function main() {
    printBanner();

    if (!fs.existsSync(configPath)) {
        console.error('Không tìm thấy tệp config.json!');
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (!config.token) {
        console.log('\x1b[33m[CHƯA ĐĂNG NHẬP] Bạn chưa cấu hình Token trong config.json.\x1b[0m');
        console.log('Chạy lệnh sau để đăng nhập và lấy Token tự động:\n');
        console.log('   \x1b[1mnode scripts/login.js <email> <password>\x1b[0m\n');
        console.log('Hoặc dán trực tiếp token vào file config.json.');
        process.exit(0);
    }

    const api = new DriveSyncApi(config.server_url, config.token);

    try {
        console.log(`Đang kết nối máy chủ: \x1b[34m${config.server_url}\x1b[0m...`);
        const info = await api.getInfo();

        console.log(`\x1b[32m✔ Xác thực thành công!\x1b[0m`);
        console.log(`- Tài khoản: \x1b[1m${info.user.name}\x1b[0m (${info.user.email})`);
        console.log(`- Tổ chức:   \x1b[1m${info.company.name}\x1b[0m`);
        console.log(`- Dung lượng: Đã dùng \x1b[33m${info.storage.formatted || '0 B'}\x1b[0m / ${info.storage.max_storage_mb >= 1024 ? Math.round(info.storage.max_storage_mb / 1024) + ' GB' : (info.storage.max_storage_mb || 10) + ' GB'}`);
        console.log(`- Thư mục đồng bộ: \x1b[35m${path.resolve(config.sync_folder)}\x1b[0m\n`);

        const worker = new SyncWorker(api, config.sync_folder, config.sync_interval_seconds || 15);
        worker.start();

        process.on('SIGINT', () => {
            console.log('\nĐang ngắt kết nối an toàn...');
            worker.stop();
            process.exit(0);
        });
    } catch (err) {
        console.error(`\x1b[31m✖ Lỗi kết nối hoặc Token không hợp lệ:\x1b[0m ${err.message}`);
        console.log('Vui lòng kiểm tra lại địa chỉ máy chủ và Token trong config.json.');
    }
}

main();
