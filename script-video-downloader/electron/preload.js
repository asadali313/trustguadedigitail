import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  detectIdm: () => ipcRenderer.invoke('detect-idm'),
  saveProject: (project) => ipcRenderer.invoke('save-project', project),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  runDownload: (payload) => ipcRenderer.invoke('run-download', payload),
})
