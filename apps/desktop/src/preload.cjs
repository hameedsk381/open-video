// The only thing the studio page can reach from the desktop shell. The page stays sandboxed and offline from Node: these
// four calls are the whole surface, and every one of them is handled in the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('motionrender', {
  desktop: {
    version: 1,
    getState: () => ipcRenderer.invoke('desktop:state'),
    openProjectFolder: () => ipcRenderer.invoke('desktop:open-project'),
    revealProjectFolder: () => ipcRenderer.send('desktop:reveal'),
    openLogFolder: () => ipcRenderer.send('desktop:open-logs'),
    newVideo: () => ipcRenderer.send('desktop:new-video'),
    onState: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('desktop:state-changed', listener);
      return () => ipcRenderer.removeListener('desktop:state-changed', listener);
    },
  },
});
