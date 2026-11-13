const fs = require('fs');
const path = require('path');
const DriveSyncApi = require('../engine/api');

const configPath = path.join(__dirname, '..', 'config.json');

const readline = require('readline');

function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans.trim());
    }));
}

async function login() {
    const args = process.argv.slice(2);
    let email = args[0];
    let password = args[1];
    let serverUrl = args[2];

    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

    if (!email || !password) {
        console.log('\x1b[36m=== ĐĂNG NHẬP KAOLA DRIVE DESKTOP ===\x1b[0m\n');
        email = await askQuestion('Nhập Email tài khoản: ');
        password = await askQuestion('Nhập Mật khẩu: ');
        if (!serverUrl) {
            const defaultUrl = config.server_url || 'http://kaolawork.test';
            const inputUrl = await askQuestion(`Địa chỉ máy chủ [Mặc định: ${defaultUrl}]: `);
            serverUrl = inputUrl || defaultUrl;
        }
    }

    if (!email || !password) {
        console.log('\x1b[31mEmail và mật khẩu không được để trống!\x1b[0m');
        process.exit(1);
    }

    serverUrl = serverUrl || config.server_url || 'http://kaolawork.test';

    console.log(`Đang đăng nhập vào: \x1b[34m${serverUrl}\x1b[0m với email: \x1b[1m${email}\x1b[0m...`);

    const api = new DriveSyncApi(serverUrl, '');

    try {
        const res = await api.login(email, password, config.device_name || 'Windows Desktop PC');

        if (res.status === 'success' && res.token) {
            config.server_url = serverUrl;
            config.token = res.token;
            config.sync_folder = config.sync_folder || './KaolaDrive';
            config.sync_interval_seconds = config.sync_interval_seconds || 15;

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

            console.log('\n\x1b[32m✔ Đăng nhập thành công!\x1b[0m');
            console.log(`- Token đã được lưu tự động vào: \x1b[36m${configPath}\x1b[0m`);
            console.log(`- Tài khoản: ${res.user.name} (${res.user.email})`);
            console.log(`- Công ty:   ${res.company.name}`);
            console.log('\nBây giờ bạn có thể khởi động đồng bộ bằng lệnh:');
            console.log('   \x1b[1m\x1b[32mnode index.js\x1b[0m\n');
        } else {
            console.error('\x1b[31mĐăng nhập thất bại:\x1b[0m', res.message || 'Không có token');
        }
    } catch (err) {
        console.error('\x1b[31m✖ Lỗi kết nối:\x1b[0m', err.message);
    }
}

login();
