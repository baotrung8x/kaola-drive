const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
    const win = new BrowserWindow({
        width: 512,
        height: 512,
        show: false,
        frame: false,
        transparent: true,
        webPreferences: {
            offscreen: true
        }
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 512px;
        height: 512px;
        background: transparent;
        overflow: hidden;
      }
      .container {
        width: 512px;
        height: 512px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .squircle {
        width: 450px;
        height: 450px;
        background: #eef4ff;
        border-radius: 112px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      svg {
        width: 250px;
        height: 250px;
        fill: #20498b;
      }
    </style>
    </head>
    <body>
      <div class="container">
        <div class="squircle">
          <svg viewBox="0 0 24 24">
            <path fill-rule="evenodd" d="M4.5 9.75a6 6 0 0 1 11.573-2.226 3.75 3.75 0 0 1 4.133 4.303A4.5 4.5 0 0 1 18 20.25H6.75a5.25 5.25 0 0 1-2.23-10.004 6.072 6.072 0 0 1-.02-.496Z" clip-rule="evenodd"/>
          </svg>
        </div>
      </div>
    </body>
    </html>
    `;

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    // Wait a brief moment for fonts/rendering
    await new Promise(r => setTimeout(r, 300));

    const image = await win.capturePage();
    const png512 = image.toPNG();
    const pngPath = path.join(__dirname, '..', 'assets', 'icon.png');
    fs.writeFileSync(pngPath, png512);
    console.log('Saved assets/icon.png (512x512):', png512.length, 'bytes');

    // Create 256x256 image for ICO
    const resizedImage = image.resize({ width: 256, height: 256, quality: 'best' });
    const png256 = resizedImage.toPNG();

    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // icon
    header.writeUInt16LE(1, 4); // 1 image

    const entry = Buffer.alloc(16);
    entry.writeUInt8(0, 0); // width 256
    entry.writeUInt8(0, 1); // height 256
    entry.writeUInt8(0, 2); // 0 colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png256.length, 8); // size of image data
    entry.writeUInt32LE(22, 12); // offset 22

    const icoBuffer = Buffer.concat([header, entry, png256]);
    const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    console.log('Saved assets/icon.ico (256x256):', icoBuffer.length, 'bytes');

    app.quit();
});
