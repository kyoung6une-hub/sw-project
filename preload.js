const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getMembers: () => ipcRenderer.invoke('get-members'),
  addMember: (memberData) => ipcRenderer.invoke('add-member', memberData),
  updateMember: (updatedData) => ipcRenderer.invoke('update-member', updatedData),
  deleteMember: (memberId) => ipcRenderer.invoke('delete-member', memberId),
  checkIn: (phone) => ipcRenderer.invoke('check-in', phone),
  checkOut: (phone) => ipcRenderer.invoke('check-out', phone),
  getLogs: () => ipcRenderer.invoke('get-logs'),
  logError: (message) => ipcRenderer.send('log-error', message)
});
