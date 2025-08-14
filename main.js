const { app, BrowserWindow, ipcMain } = require('electron'); // 'dialog' não é mais necessário aqui
const path = require('path');
const fs = require('fs');

function createWindow() {
    const win = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // Necessário para usar 'require' no renderer
        },
    });

    win.loadFile('index.html');
    // Para abrir as ferramentas de desenvolvedor (útil para depuração)
    // win.webContents.openDevTools();
}

app.whenReady().then(createWindow);

// Lida com o fechamento de todas as janelas
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Manipulador IPC para carregar dados do arquivo JSON
ipcMain.handle('load-data', async (event, username) => {
    const file = path.join(__dirname, `${username}.json`);
    if (!fs.existsSync(file)) {
        // Cria o arquivo com estrutura inicial se não existir
        fs.writeFileSync(file, JSON.stringify({ renda: 0, pastas: {} }, null, 2));
    }
    // Retorna o conteúdo do arquivo
    return JSON.parse(fs.readFileSync(file, 'utf8'));
});

// Manipulador IPC para salvar dados no arquivo JSON
ipcMain.handle('save-data', async (event, username, data) => {
    const file = path.join(__dirname, `${username}.json`);
    // Salva o objeto de dados completo, que agora inclui a propriedade 'color'
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
});