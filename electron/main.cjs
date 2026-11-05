// Janela desktop do Jeremias A.S.O.
// Sobe o servidor interno numa porta aleatória (só 127.0.0.1) protegido por um token
// novo a cada abertura, e mostra a interface numa janela própria.
const { app, BrowserWindow, Menu, session, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

app.setName('jeremias-aso');

const ENV_TEMPLATE = `# Configurações do Jeremias A.S.O. (salve o arquivo e use Arquivo > Reiniciar)
# Modelo: gemini (nuvem do Google) ou ollama (local, o texto não sai do computador)
LLM_PROVIDER=gemini

# Cole sua chave do Gemini logo depois do =, sem aspas nem espaços
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.8-flash
GEMINI_THINKING_LEVEL=auto

# Se usar Ollama (LLM_PROVIDER=ollama):
# OLLAMA_URL=http://127.0.0.1:11434
# OLLAMA_MODEL=llama3.2:3b

# Imagem do sandbox (rode uma vez: docker pull alpine:3)
SANDBOX_IMAGE=alpine:3
`;

let win = null;
let activityWin = null;
let browserWin = null;
let envFile = '';
let dataDir = '';
let authCodeFile = '';

function isPublicSiteUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || !host || url.username || url.password) return false;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (host === '::1' || host.startsWith('[')) return false;
    const octets = host.split('.').map(Number);
    if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      if (
        octets[0] === 0 || octets[0] === 10 || octets[0] === 127 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
      ) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitReady(origin, token) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${origin}/api/auth/status`, { headers: { 'X-Jeremias-Token': token } });
      if (r.ok) return;
    } catch {
      /* servidor ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('O servidor interno não respondeu em 30 segundos.');
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Configurações (chave e modelo)…', click: () => shell.openPath(envFile) },
        { label: 'Abrir pasta de dados (ledger)', click: () => shell.openPath(dataDir) },
        { label: 'Abrir código de autorização da senha', click: () => shell.openPath(authCodeFile) },
        { type: 'separator' },
        { label: 'Reiniciar o Jeremias', click: () => { app.relaunch(); app.exit(0); } },
        { role: 'quit', label: 'Sair' },
      ],
    },
    { label: 'Exibir', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'togglefullscreen', label: 'Tela cheia' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function boot() {
  dataDir = app.getPath('userData');
  fs.mkdirSync(dataDir, { recursive: true });
  authCodeFile = app.isPackaged
    ? path.join(dataDir, 'codigo-autorizacao.txt')
    : path.join(app.getAppPath(), 'codigo-autorizacao.txt');
  envFile = path.join(dataDir, '.env.local');
  const firstRun = !fs.existsSync(envFile);
  if (firstRun) fs.writeFileSync(envFile, ENV_TEMPLATE);

  const port = await freePort();
  const token = crypto.randomBytes(24).toString('hex');
  const appRoot = app.getAppPath();
  const origin = `http://127.0.0.1:${port}`;

  Object.assign(process.env, {
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    JEREMIAS_TOKEN: token,
    ENV_DIR: dataDir,
    DIST_DIR: path.join(appRoot, 'dist'),
    LEDGER_FILE: path.join(dataDir, 'audit.jsonl'),
    JEREMIAS_AUTH_FILE: path.join(dataDir, 'auth.json'),
    JEREMIAS_AUTH_CODE_FILE: authCodeFile,
    JEREMIAS_ENABLE_DEV_ACTIVITY: app.isPackaged ? '' : '1',
  });

  await import(pathToFileURL(path.join(appRoot, 'dist-server', 'server.mjs')).href);
  await waitReady(origin, token);

  // A janela anexa o token em todo pedido à API; nada mais na máquina o conhece.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${origin}/*`] }, (details, cb) => {
    details.requestHeaders['X-Jeremias-Token'] = token;
    cb({ requestHeaders: details.requestHeaders });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  buildMenu();
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#050811',
    title: 'Jeremias A.S.O.',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      return { action: 'deny' };
    }
    if (target.origin !== origin) return { action: 'deny' };

    if (target.pathname === '/browser') {
      const requestedSiteUrl = target.searchParams.get('url');
      if (requestedSiteUrl && !isPublicSiteUrl(requestedSiteUrl)) return { action: 'deny' };
      const browserRoute = requestedSiteUrl
        ? `${origin}/browser?url=${encodeURIComponent(requestedSiteUrl)}`
        : `${origin}/browser`;
      if (browserWin && !browserWin.isDestroyed()) {
        if (browserWin.isMinimized()) browserWin.restore();
        browserWin.focus();
        void browserWin.loadURL(browserRoute);
        return { action: 'deny' };
      }

      browserWin = new BrowserWindow({
        width: 1440,
        height: 920,
        minWidth: 1050,
        minHeight: 650,
        backgroundColor: '#050811',
        title: 'Jeremias — Assistente de sites',
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: true,
        },
      });
      browserWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      browserWin.webContents.on('will-navigate', (event, nextUrl) => {
        if (!nextUrl.startsWith(origin)) event.preventDefault();
      });
      browserWin.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        if (params.src !== 'about:blank' && !isPublicSiteUrl(params.src)) {
          event.preventDefault();
          return;
        }
        params.partition = 'persist:jeremias-websites';
        params.allowpopups = false;
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        delete webPreferences.preload;
      });
      browserWin.webContents.on('did-attach-webview', (_event, contents) => {
        contents.setWindowOpenHandler(() => ({ action: 'deny' }));
        contents.on('will-navigate', (event, nextUrl) => {
          if (nextUrl !== 'about:blank' && !isPublicSiteUrl(nextUrl)) event.preventDefault();
        });
        const websiteSession = session.fromPartition('persist:jeremias-websites');
        websiteSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        websiteSession.setPermissionCheckHandler(() => false);
      });
      browserWin.once('closed', () => { browserWin = null; });
      void browserWin.loadURL(browserRoute);
      return { action: 'deny' };
    }

    if (target.pathname !== '/developer-activity' || process.env.JEREMIAS_ENABLE_DEV_ACTIVITY !== '1') {
      return { action: 'deny' };
    }

    if (activityWin && !activityWin.isDestroyed()) {
      if (activityWin.isMinimized()) activityWin.restore();
      activityWin.focus();
      return { action: 'deny' };
    }

    activityWin = new BrowserWindow({
      width: 1120,
      height: 820,
      minWidth: 800,
      minHeight: 600,
      backgroundColor: '#050811',
      title: 'Jeremias — Monitor de Atividade Dev',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    activityWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    activityWin.webContents.on('will-navigate', (event, nextUrl) => {
      if (!nextUrl.startsWith(origin)) event.preventDefault();
    });
    activityWin.once('closed', () => { activityWin = null; });
    void activityWin.loadURL(`${origin}/developer-activity`);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin)) e.preventDefault();
  });
  await win.loadURL(origin);

  if (firstRun) {
    const r = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Primeira abertura',
      message: 'Para usar o Gemini, cole sua chave no arquivo de configurações.',
      detail: 'Depois de salvar, use Arquivo > Reiniciar o Jeremias.',
      buttons: ['Abrir configurações', 'Depois'],
      defaultId: 0,
    });
    if (r.response === 0) shell.openPath(envFile);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() =>
    boot().catch((err) => {
      dialog.showErrorBox('Jeremias A.S.O. não iniciou', String((err && err.message) || err));
      app.quit();
    })
  );
  app.on('window-all-closed', () => app.quit());
}
