const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('jeremiasDesktop', { isDesktop: true });
