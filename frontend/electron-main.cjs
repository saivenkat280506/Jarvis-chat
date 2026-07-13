const { app, BrowserWindow, ipcMain, Menu, MenuItem } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess = null;

function startBackend() {
  if (app.isPackaged) {
    // If packaged, launch the executable
    const backendPath = path.join(process.resourcesPath, 'JarvisBackend', 'JarvisBackend.exe');
    const backendCwd = path.join(process.resourcesPath, 'JarvisBackend');
    console.log('[System] Launching Packaged Backend:', backendPath, 'in', backendCwd);
    backendProcess = spawn(backendPath, [], { cwd: backendCwd, detached: false });
  } else {
    // Development fallback
    const backendDir = path.join(__dirname, '..', 'backend');
    console.log('[System] Launching Dev Backend:', backendDir);
    backendProcess = spawn('cmd', ['/c', '.venv\\Scripts\\python.exe', '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'], {
      cwd: backendDir,
      detached: false
    });
  }

  backendProcess.stdout.on('data', (data) => console.log(`[Backend] ${data}`));
  backendProcess.stderr.on('data', (data) => console.error(`[Backend Error] ${data}`));
  backendProcess.on('close', (code) => console.log(`[Backend] Exited with code ${code}`));
}

app.on('web-contents-created', (e, contents) => {
  contents.on('context-menu', (event, params) => {
    const menu = new Menu();
    
    // Add simple basic text editing options if applicable
    if (params.isEditable) {
      menu.append(new MenuItem({ label: 'Undo', role: 'undo' }));
      menu.append(new MenuItem({ label: 'Redo', role: 'redo' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ label: 'Select All', role: 'selectAll' }));
      
      // If spellchecker has suggestions
      if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
        for (const suggestion of params.dictionarySuggestions) {
          menu.append(
            new MenuItem({
              label: suggestion,
              click: () => contents.replaceMisspelling(suggestion)
            })
          );
        }
      }
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    }

    // fallback debug config
    menu.append(new MenuItem({ type: 'separator' }));
    menu.append(new MenuItem({ label: 'Inspect Element', click: () => { contents.inspectElement(params.x, params.y); } }));

    menu.popup();
  });
  
  contents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Frontend Console]: ${message} (line ${line})`);
  });
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true,
    backgroundColor: '#050505',
    title: "Jarvis AI",
    // Premium border styling
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#101010',
      symbolColor: '#ffffff',
      height: 35
    }
  });

  // Load the built production file
  mainWindow.loadFile('dist/index.html');

  // Smooth appearance
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // ── Inject electronAPI into renderer (contextIsolation is false) ─────────
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      window.electronAPI = {
        minimize: () => require('electron').ipcRenderer.invoke('minimize'),
        maximize: () => require('electron').ipcRenderer.invoke('maximize'),
        close:    () => require('electron').ipcRenderer.invoke('close'),
        focus:    () => require('electron').ipcRenderer.invoke('focus'),
      };
    `);
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  // ── IPC: Window Controls ────────────────────────────────────────────────
  ipcMain.handle('minimize', () => mainWindow?.minimize());
  ipcMain.handle('maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('close', () => mainWindow?.close());

  // ── IPC: Focus window (called after external actions) ───────────────────
  ipcMain.handle('focus', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(false);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Kill the backend if electron closes
app.on('will-quit', () => {
  if (backendProcess) {
    if (process.platform === 'win32') {
      spawn("taskkill", ["/pid", backendProcess.pid, '/f', '/t']);
    } else {
      backendProcess.kill();
    }
  }
});
