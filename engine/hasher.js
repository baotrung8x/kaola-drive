const fs = require('fs');
const crypto = require('crypto');

/**
 * Tính mã băm SHA256 của tệp cục bộ
 */
function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            return resolve(null);
        }
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
}

module.exports = {
    calculateFileHash
};
