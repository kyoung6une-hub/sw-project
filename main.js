const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.csv');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.csv');

// Initialize database directories and files
function initializeDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(MEMBERS_FILE)) {
    const headers = 'id,name,birthdate,phone,remaining_days,created_at\n';
    fs.writeFileSync(MEMBERS_FILE, headers, 'utf-8');
  }
  if (!fs.existsSync(ATTENDANCE_FILE)) {
    const headers = 'id,phone,name,type,timestamp\n';
    fs.writeFileSync(ATTENDANCE_FILE, headers, 'utf-8');
  }
}

// Simple CSV Parsing Helpers
function readMembers() {
  if (!fs.existsSync(MEMBERS_FILE)) return [];
  const fileData = fs.readFileSync(MEMBERS_FILE, 'utf-8');
  const lines = fileData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const member = {};
    headers.forEach((header, index) => {
      member[header] = values[index] || '';
    });
    // Convert remaining_days to integer
    member.remaining_days = parseInt(member.remaining_days, 10) || 0;
    return member;
  });
}

function writeMembers(members) {
  const headers = ['id', 'name', 'birthdate', 'phone', 'remaining_days', 'created_at'];
  const csvContent = [
    headers.join(','),
    ...members.map(m => headers.map(h => String(m[h] || '').replace(/,/g, '')).join(','))
  ].join('\n') + '\n';
  fs.writeFileSync(MEMBERS_FILE, csvContent, 'utf-8');
}

function readLogs() {
  if (!fs.existsSync(ATTENDANCE_FILE)) return [];
  const fileData = fs.readFileSync(ATTENDANCE_FILE, 'utf-8');
  const lines = fileData.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const log = {};
    headers.forEach((header, index) => {
      log[header] = values[index] || '';
    });
    return log;
  }).reverse(); // Latest logs first
}

function writeLog(phone, name, type) {
  const id = Date.now().toString();
  const timestamp = new Date().toISOString();
  // Safe formatting to prevent CSV breaking
  const safePhone = String(phone).replace(/,/g, '');
  const safeName = String(name).replace(/,/g, '');
  const logLine = `${id},${safePhone},${safeName},${type},${timestamp}\n`;
  fs.appendFileSync(ATTENDANCE_FILE, logLine, 'utf-8');
}

// Window creation
function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload Path:', preloadPath);

  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    autoHideMenuBar: true
  });

  win.loadFile('index.html');
  win.webContents.openDevTools();
}

app.whenReady().then(() => {
  initializeDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler Registrations
ipcMain.handle('get-members', async () => {
  return readMembers();
});

ipcMain.handle('add-member', async (event, memberData) => {
  try {
    const members = readMembers();
    // Check duplicate phone number
    const exists = members.some(m => m.phone === memberData.phone);
    if (exists) {
      return { success: false, error: '이미 등록된 전화번호입니다.' };
    }

    const newMember = {
      id: Date.now().toString(),
      name: memberData.name,
      birthdate: memberData.birthdate,
      phone: memberData.phone,
      remaining_days: parseInt(memberData.remaining_days, 10) || 0,
      created_at: new Date().toISOString()
    };

    members.push(newMember);
    writeMembers(members);
    return { success: true, member: newMember };
  } catch (err) {
    console.error('Error in add-member IPC:', err);
    return { success: false, error: '서버 에러: ' + err.message };
  }
});

ipcMain.handle('update-member', async (event, updatedData) => {
  const members = readMembers();
  const index = members.findIndex(m => m.id === updatedData.id);
  if (index === -1) {
    return { success: false, error: '회원을 찾을 수 없습니다.' };
  }

  // Check duplicate phone number with other members
  const duplicate = members.some(m => m.phone === updatedData.phone && m.id !== updatedData.id);
  if (duplicate) {
    return { success: false, error: '이미 등록된 전화번호입니다.' };
  }

  members[index] = {
    ...members[index],
    name: updatedData.name,
    birthdate: updatedData.birthdate,
    phone: updatedData.phone,
    remaining_days: parseInt(updatedData.remaining_days, 10) || 0
  };

  writeMembers(members);
  return { success: true, member: members[index] };
});

ipcMain.handle('delete-member', async (event, memberId) => {
  let members = readMembers();
  const exists = members.some(m => m.id === memberId);
  if (!exists) {
    return { success: false, error: '회원을 찾을 수 없습니다.' };
  }

  members = members.filter(m => m.id !== memberId);
  writeMembers(members);
  return { success: true };
});

ipcMain.handle('check-in', async (event, phone) => {
  const members = readMembers();
  const memberIndex = members.findIndex(m => m.phone === phone);

  if (memberIndex === -1) {
    return { success: false, error: '등록되지 않은 전화번호입니다.' };
  }

  const member = members[memberIndex];
  if (member.remaining_days <= 0) {
    return { success: false, error: '남은 이용권이 없습니다. 재등록이 필요합니다.' };
  }

  // Deduct 1 day
  member.remaining_days -= 1;
  writeMembers(members);

  // Write attendance log
  writeLog(member.phone, member.name, 'CHECK_IN');

  return { 
    success: true, 
    member: member,
    message: `${member.name}님, 입실 완료되었습니다. (남은 이용권: ${member.remaining_days}일)`
  };
});

ipcMain.handle('check-out', async (event, phone) => {
  const members = readMembers();
  const member = members.find(m => m.phone === phone);

  if (!member) {
    return { success: false, error: '등록되지 않은 전화번호입니다.' };
  }

  // Write attendance log
  writeLog(member.phone, member.name, 'CHECK_OUT');

  return { 
    success: true, 
    member: member,
    message: `${member.name}님, 퇴실 완료되었습니다. 오늘 하루도 수고하셨습니다!`
  };
});

ipcMain.handle('get-logs', async () => {
  return readLogs();
});

ipcMain.on('log-error', (event, message) => {
  console.error('[RENDERER ERROR]:', message);
});
