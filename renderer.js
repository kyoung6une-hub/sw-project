// Global Error Handler to Main Process
window.onerror = function (message, source, lineno, colno, error) {
  const errMsg = `${message} at ${source}:${lineno}:${colno}`;
  if (window.api && window.api.logError) {
    window.api.logError(errMsg);
  } else {
    console.error(errMsg);
  }
};
window.onunhandledrejection = function (event) {
  const errMsg = `Unhandled Rejection: ${event.reason}`;
  if (window.api && window.api.logError) {
    window.api.logError(errMsg);
  } else {
    console.error(errMsg);
  }
};

// Browser/GitHub Pages fallback Mock API (Dual-Mode Hybrid Support)
if (!window.api) {
  console.log('Running in Web Browser mode. Exposing localStorage Mock API.');
  window.api = {
    getMembers: async () => {
      const data = localStorage.getItem('gym_members');
      return data ? JSON.parse(data) : [];
    },
    addMember: async (memberData) => {
      const data = localStorage.getItem('gym_members');
      const members = data ? JSON.parse(data) : [];
      const exists = members.some(m => m.phone === memberData.phone);
      if (exists) return { success: false, error: '이미 등록된 전화번호입니다.' };
      
      const newMember = {
        id: Date.now().toString(),
        name: memberData.name,
        birthdate: memberData.birthdate,
        phone: memberData.phone,
        remaining_days: parseInt(memberData.remaining_days, 10) || 0,
        created_at: new Date().toISOString()
      };
      members.push(newMember);
      localStorage.setItem('gym_members', JSON.stringify(members));
      return { success: true, member: newMember };
    },
    updateMember: async (updatedData) => {
      const data = localStorage.getItem('gym_members');
      const members = data ? JSON.parse(data) : [];
      const index = members.findIndex(m => m.id === updatedData.id);
      if (index === -1) return { success: false, error: '회원을 찾을 수 없습니다.' };
      
      const duplicate = members.some(m => m.phone === updatedData.phone && m.id !== updatedData.id);
      if (duplicate) return { success: false, error: '이미 등록된 전화번호입니다.' };
      
      members[index] = {
        ...members[index],
        name: updatedData.name,
        birthdate: updatedData.birthdate,
        phone: updatedData.phone,
        remaining_days: parseInt(updatedData.remaining_days, 10) || 0
      };
      localStorage.setItem('gym_members', JSON.stringify(members));
      return { success: true, member: members[index] };
    },
    deleteMember: async (memberId) => {
      const data = localStorage.getItem('gym_members');
      let members = data ? JSON.parse(data) : [];
      members = members.filter(m => m.id !== memberId);
      localStorage.setItem('gym_members', JSON.stringify(members));
      return { success: true };
    },
    checkIn: async (phone) => {
      const data = localStorage.getItem('gym_members');
      const members = data ? JSON.parse(data) : [];
      const index = members.findIndex(m => m.phone === phone);
      if (index === -1) return { success: false, error: '등록되지 않은 전화번호입니다.' };
      
      const member = members[index];
      if (member.remaining_days <= 0) return { success: false, error: '남은 이용권이 없습니다. 재등록이 필요합니다.' };
      
      member.remaining_days -= 1;
      localStorage.setItem('gym_members', JSON.stringify(members));
      
      const logsData = localStorage.getItem('gym_logs');
      const logs = logsData ? JSON.parse(logsData) : [];
      const log = {
        id: Date.now().toString(),
        phone: member.phone,
        name: member.name,
        type: 'CHECK_IN',
        timestamp: new Date().toISOString()
      };
      logs.push(log);
      localStorage.setItem('gym_logs', JSON.stringify(logs));
      
      return { 
        success: true, 
        member, 
        message: `${member.name}님, 입실 완료되었습니다. (남은 이용권: ${member.remaining_days}일)` 
      };
    },
    checkOut: async (phone) => {
      const data = localStorage.getItem('gym_members');
      const members = data ? JSON.parse(data) : [];
      const member = members.find(m => m.phone === phone);
      if (!member) return { success: false, error: '등록되지 않은 전화번호입니다.' };
      
      const logsData = localStorage.getItem('gym_logs');
      const logs = logsData ? JSON.parse(logsData) : [];
      const log = {
        id: Date.now().toString(),
        phone: member.phone,
        name: member.name,
        type: 'CHECK_OUT',
        timestamp: new Date().toISOString()
      };
      logs.push(log);
      localStorage.setItem('gym_logs', JSON.stringify(logs));
      
      return { 
        success: true, 
        member, 
        message: `${member.name}님, 퇴실 완료되었습니다. 오늘 하루도 수고하셨습니다!` 
      };
    },
    getLogs: async () => {
      const data = localStorage.getItem('gym_logs');
      const logs = data ? JSON.parse(data) : [];
      return logs.reverse();
    },
    logError: (message) => {
      console.error('[BROWSER ERROR]:', message);
    }
  };
}

// Global State
let activeTab = 'kiosk';
let rawPhoneInput = '';
let currentMembers = [];
let currentLogs = [];
let logFilterType = 'all';

// DOM Elements
const navButtons = document.querySelectorAll('.nav-btn');
const tabPanels = document.querySelectorAll('.tab-panel');
const currentTabTitle = document.getElementById('current-tab-title');
const systemTimeEl = document.getElementById('system-time');

// Kiosk Elements
const phoneDisplay = document.getElementById('phone-display');
const keypadButtons = document.querySelectorAll('.keypad-btn:not(.text-btn)');
const btnClear = document.getElementById('btn-clear');
const btnBackspace = document.getElementById('btn-backspace');
const btnCheckIn = document.getElementById('btn-checkin');
const btnCheckOut = document.getElementById('btn-checkout');
const kioskResultCard = document.getElementById('kiosk-result-card');
const miniLogsList = document.getElementById('mini-logs-list');
const todayCheckinsCount = document.getElementById('today-checkins-count');

// Members Table Elements
const memberTableBody = document.getElementById('member-table-body');
const totalMembersCount = document.getElementById('total-members-count');
const memberSearchInput = document.getElementById('member-search-input');

// Registration Form Elements
const memberRegisterForm = document.getElementById('member-register-form');
const regPhone = document.getElementById('reg-phone');
const regBirth = document.getElementById('reg-birth');

// Logs Elements
const logsTableBody = document.getElementById('logs-table-body');
const logSearchInput = document.getElementById('log-search-input');
const logFilterButtons = document.querySelectorAll('.filter-btn');

// Modal Elements
const editModal = document.getElementById('edit-member-modal');
const editForm = document.getElementById('member-edit-form');
const btnCloseModal = document.getElementById('close-modal');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const editPhone = document.getElementById('edit-phone');
const editBirth = document.getElementById('edit-birth');

// Toast Elements
const toast = document.getElementById('toast-notification');
const toastMessage = document.getElementById('toast-message');
const toastIcon = document.getElementById('toast-icon');

// 1. Clock Initialization
function updateTime() {
  const now = new Date();
  const options = { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    weekday: 'short', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  };
  systemTimeEl.textContent = now.toLocaleString('ko-KR', options);
}
setInterval(updateTime, 1000);
updateTime();

// 2. Tab Navigation Router
navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    switchTab(tabId);
  });
});

function switchTab(tabId) {
  activeTab = tabId;
  
  // Update nav state
  navButtons.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update panels
  tabPanels.forEach(panel => {
    if (panel.id === `tab-${tabId}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Title Update
  const titles = {
    kiosk: '출입 키오스크',
    members: '회원 정보 관리',
    register: '신규 회원 등록',
    logs: '출입 기록 조회'
  };
  currentTabTitle.textContent = titles[tabId];

  // Refresh tab data
  if (tabId === 'members') {
    loadMembersData();
  } else if (tabId === 'logs') {
    loadLogsData();
  } else if (tabId === 'kiosk') {
    loadMiniLogs();
  }
}

// 3. Kiosk Keypad Logic
keypadButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (rawPhoneInput.length < 11) {
      rawPhoneInput += btn.textContent.trim();
      updatePhoneDisplay();
    }
  });
});

btnClear.addEventListener('click', () => {
  rawPhoneInput = '';
  updatePhoneDisplay();
});

btnBackspace.addEventListener('click', () => {
  rawPhoneInput = rawPhoneInput.slice(0, -1);
  updatePhoneDisplay();
});

// Format raw number (e.g. 01012345678) into standard Korean phone string 010-1234-5678
function formatPhone(numStr) {
  if (!numStr) return '';
  const cleaned = numStr.replace(/\D/g, '');
  if (cleaned.length <= 3) return cleaned;
  if (cleaned.length <= 7) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7, 11)}`;
}

function updatePhoneDisplay() {
  phoneDisplay.value = formatPhone(rawPhoneInput);
}

// Keyboard input support for Keypad
document.addEventListener('keydown', (e) => {
  if (activeTab !== 'kiosk') return;
  // Ignore inputs when modals or other focused elements are active
  if (document.activeElement.tagName === 'INPUT' && document.activeElement !== phoneDisplay) return;
  
  if (e.key >= '0' && e.key <= '9') {
    if (rawPhoneInput.length < 11) {
      rawPhoneInput += e.key;
      updatePhoneDisplay();
    }
  } else if (e.key === 'Backspace') {
    rawPhoneInput = rawPhoneInput.slice(0, -1);
    updatePhoneDisplay();
  } else if (e.key === 'Escape') {
    rawPhoneInput = '';
    updatePhoneDisplay();
  } else if (e.key === 'Enter') {
    // Default to Check-In on Enter
    handleCheckIn();
  }
});

// Auto-format phone input fields during typing
[regPhone, editPhone].forEach(inputEl => {
  inputEl.addEventListener('input', (e) => {
    const cursorPosition = e.target.selectionStart;
    const previousLength = e.target.value.length;
    
    const digitsOnly = e.target.value.replace(/\D/g, '');
    e.target.value = formatPhone(digitsOnly);
    
    // Adjust cursor position if auto-hyphen added
    const currentLength = e.target.value.length;
    const diff = currentLength - previousLength;
    if (diff > 0) {
      e.target.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
    }
  });
});

// Auto-format birthdate input fields during typing
function formatBirthdate(value) {
  if (!value) return '';
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 4) return cleaned;
  if (cleaned.length <= 6) return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 10)}`;
}

[regBirth, editBirth].forEach(inputEl => {
  inputEl.addEventListener('input', (e) => {
    const cursorPosition = e.target.selectionStart;
    const previousLength = e.target.value.length;
    
    const digitsOnly = e.target.value.replace(/\D/g, '');
    e.target.value = formatBirthdate(digitsOnly);
    
    const currentLength = e.target.value.length;
    const diff = currentLength - previousLength;
    if (diff > 0) {
      e.target.setSelectionRange(cursorPosition + diff, cursorPosition + diff);
    }
  });
});

function isValidBirthdate(val) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(val)) return false;
  
  const parts = val.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return false;
  if (month < 1 || month > 12) return false;
  
  const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) {
    daysInMonths[1] = 29;
  }
  if (day < 1 || day > daysInMonths[month - 1]) return false;
  
  return true;
}

// 4. Kiosk Action handlers
async function handleCheckIn() {
  const formattedPhone = formatPhone(rawPhoneInput);
  if (!formattedPhone || rawPhoneInput.length < 9) {
    showToast('올바른 전화번호를 입력하세요.', true);
    return;
  }

  const result = await window.api.checkIn(formattedPhone);
  displayKioskResult(result);
  
  if (result.success) {
    rawPhoneInput = '';
    updatePhoneDisplay();
    loadMiniLogs();
    updateTodayCount();
  }
}

async function handleCheckOut() {
  const formattedPhone = formatPhone(rawPhoneInput);
  if (!formattedPhone || rawPhoneInput.length < 9) {
    showToast('올바른 전화번호를 입력하세요.', true);
    return;
  }

  const result = await window.api.checkOut(formattedPhone);
  displayKioskResult(result);

  if (result.success) {
    rawPhoneInput = '';
    updatePhoneDisplay();
    loadMiniLogs();
  }
}

btnCheckIn.addEventListener('click', handleCheckIn);
btnCheckOut.addEventListener('click', handleCheckOut);

function displayKioskResult(result) {
  if (result.success) {
    kioskResultCard.innerHTML = `
      <div class="result-card success">
        <i class="ri-checkbox-circle-fill"></i>
        <h4>${result.member.name} 회원님</h4>
        <p>${result.message}</p>
        <div class="result-days-badge">남은 이용권: <span>${result.member.remaining_days}</span>일</div>
      </div>
    `;
    showToast(result.message, false);
  } else {
    kioskResultCard.innerHTML = `
      <div class="result-card error">
        <i class="ri-error-warning-fill"></i>
        <h4>출입 제한</h4>
        <p>${result.error}</p>
      </div>
    `;
    showToast(result.error, true);
  }
}

// 5. Mini Logs and Statistics (Kiosk Tab Sidepanel)
async function loadMiniLogs() {
  if (!window.api || !window.api.getLogs) return;
  try {
    const logs = await window.api.getLogs();
    miniLogsList.innerHTML = '';
    
    // Display only top 5 recent logs
    const recentLogs = logs.slice(0, 5);
    if (recentLogs.length === 0) {
      miniLogsList.innerHTML = `<li class="status-placeholder" style="text-align:center; padding: 1rem 0;">최근 입퇴실 기록이 없습니다.</li>`;
      return;
    }

    recentLogs.forEach(log => {
      const date = new Date(log.timestamp);
      const timeStr = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const isCheckIn = log.type === 'CHECK_IN';
      
      const li = document.createElement('li');
      li.className = 'mini-log-item';
      li.innerHTML = `
        <div class="mini-log-info">
          <span class="mini-log-name">${log.name}</span>
          <span class="mini-log-badge ${isCheckIn ? 'in' : 'out'}">${isCheckIn ? '입실' : '퇴실'}</span>
        </div>
        <span class="mini-log-time">${timeStr}</span>
      `;
      miniLogsList.appendChild(li);
    });
  } catch (err) {
    console.error('Failed to load mini logs:', err);
  }
}

async function updateTodayCount() {
  if (!window.api || !window.api.getLogs) return;
  try {
    const logs = await window.api.getLogs();
    const today = new Date().toDateString();
    const todayCheckIns = logs.filter(log => {
      const logDate = new Date(log.timestamp).toDateString();
      return logDate === today && log.type === 'CHECK_IN';
    });
    todayCheckinsCount.textContent = todayCheckIns.length;
  } catch (err) {
    console.error('Failed to update today checkins count:', err);
  }
}

// Initialize Kiosk Tab components safely after DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  try {
    loadMiniLogs();
    updateTodayCount();
  } catch (err) {
    console.error('Initial components loading failed:', err);
  }
});

// 6. Member Directory Tab
async function loadMembersData() {
  if (!window.api || !window.api.getMembers) return;
  try {
    currentMembers = await window.api.getMembers();
    renderMembersTable(currentMembers);
  } catch (err) {
    console.error('Failed to load members data:', err);
  }
}

function renderMembersTable(members) {
  memberTableBody.innerHTML = '';
  totalMembersCount.textContent = members.length;

  if (members.length === 0) {
    memberTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">
          등록된 회원이 없거나 검색 결과가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  members.forEach(member => {
    const tr = document.createElement('tr');
    
    // Membership status badge mapping
    let statusBadge = '';
    const days = member.remaining_days;
    if (days <= 0) {
      statusBadge = `<span class="badge badge-danger">만료 (0일)</span>`;
    } else if (days <= 7) {
      statusBadge = `<span class="badge badge-warning">경고 (${days}일 남음)</span>`;
    } else {
      statusBadge = `<span class="badge badge-success">정상 (${days}일)</span>`;
    }

    const regDate = new Date(member.created_at).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    tr.innerHTML = `
      <td><strong>${member.name}</strong></td>
      <td>${member.birthdate}</td>
      <td>${member.phone}</td>
      <td>${statusBadge}</td>
      <td>${regDate}</td>
      <td class="actions-cell">
        <button class="action-icon-btn edit" onclick="openEditModal('${member.id}', '${member.name}', '${member.birthdate}', '${member.phone}', ${days})" title="수정">
          <i class="ri-edit-line"></i>
        </button>
        <button class="action-icon-btn delete" onclick="deleteMember('${member.id}', '${member.name}')" title="삭제">
          <i class="ri-delete-bin-line"></i>
        </button>
      </td>
    `;
    memberTableBody.appendChild(tr);
  });
}

// Search matching
memberSearchInput.addEventListener('input', () => {
  const query = memberSearchInput.value.toLowerCase().trim();
  const filtered = currentMembers.filter(m => 
    m.name.toLowerCase().includes(query) || 
    m.phone.includes(query)
  );
  renderMembersTable(filtered);
});

// Edit & Delete Window binding helpers (globally exposed to allow inline onclick handlers)
window.openEditModal = (id, name, birthdate, phone, days) => {
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-name').value = name;
  document.getElementById('edit-birth').value = birthdate;
  document.getElementById('edit-phone').value = phone;
  document.getElementById('edit-days').value = days;
  
  editModal.classList.add('active');
};

window.deleteMember = async (id, name) => {
  const confirmDelete = confirm(`정말로 ${name} 회원을 삭제하시겠습니까?\n삭제 후 복구가 불가능합니다.`);
  if (!confirmDelete) return;

  const result = await window.api.deleteMember(id);
  if (result.success) {
    showToast(`${name} 회원이 정상적으로 삭제되었습니다.`, false);
    loadMembersData();
    updateTodayCount();
  } else {
    showToast(result.error || '삭제 도중 에러가 발생했습니다.', true);
  }
};

// Edit Modal Form Submissions
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const updatedData = {
      id: document.getElementById('edit-id').value,
      name: document.getElementById('edit-name').value.trim(),
      birthdate: document.getElementById('edit-birth').value,
      phone: document.getElementById('edit-phone').value,
      remaining_days: parseInt(document.getElementById('edit-days').value, 10) || 0
    };

    // Safe checks
    if (!isValidBirthdate(updatedData.birthdate)) {
      showToast('올바른 생년월일을 입력해 주세요. (예: 1995-03-15)', true);
      return;
    }

    if (updatedData.name.includes(',') || updatedData.phone.includes(',') || updatedData.birthdate.includes(',')) {
      showToast('입력 정보에 쉼표(,)를 사용할 수 없습니다.', true);
      return;
    }

    const result = await window.api.updateMember(updatedData);
    if (result.success) {
      showToast('회원 정보가 성공적으로 수정되었습니다.', false);
      closeEditModal();
      loadMembersData();
    } else {
      showToast(result.error || '수정 중 에러가 발생했습니다.', true);
    }
  } catch (error) {
    console.error(error);
    showToast('수정 실패: ' + error.message, true);
  }
});

function closeEditModal() {
  editModal.classList.remove('active');
  editForm.reset();
}

btnCloseModal.addEventListener('click', closeEditModal);
btnCancelEdit.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => {
  if (e.target === editModal) closeEditModal();
});

// 7. Member Registration Tab
memberRegisterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const name = document.getElementById('reg-name').value.trim();
    const birthdate = document.getElementById('reg-birth').value;
    const phone = document.getElementById('reg-phone').value;
    const remaining_days = parseInt(document.getElementById('reg-days').value, 10) || 0;

    if (!isValidBirthdate(birthdate)) {
      showToast('올바른 생년월일을 입력해 주세요. (예: 1995-03-15)', true);
      return;
    }

    if (name.includes(',') || phone.includes(',') || birthdate.includes(',')) {
      showToast('입력 정보에 쉼표(,)를 사용할 수 없습니다.', true);
      return;
    }

    const result = await window.api.addMember({ name, birthdate, phone, remaining_days });
    if (result.success) {
      showToast(`${name} 회원이 등록되었습니다.`, false);
      memberRegisterForm.reset();
      switchTab('members'); // Automatically go to members directory
    } else {
      showToast(result.error || '회원 등록에 실패하였습니다.', true);
    }
  } catch (error) {
    console.error(error);
    showToast('등록 실패: ' + error.message, true);
  }
});

// 8. Logs Directory Tab
async function loadLogsData() {
  if (!window.api || !window.api.getLogs) return;
  try {
    currentLogs = await window.api.getLogs();
    renderLogsTable();
  } catch (err) {
    console.error('Failed to load logs data:', err);
  }
}

function renderLogsTable() {
  logsTableBody.innerHTML = '';
  const searchVal = logSearchInput.value.toLowerCase().trim();

  // Filter logs by search term and filter type
  const filtered = currentLogs.filter(log => {
    const matchesSearch = log.phone.includes(searchVal) || log.name.toLowerCase().includes(searchVal);
    const matchesType = logFilterType === 'all' || log.type === logFilterType;
    return matchesSearch && matchesType;
  });

  if (filtered.length === 0) {
    logsTableBody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 3rem;">
          출입 기록이 존재하지 않습니다.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(log => {
    const date = new Date(log.timestamp);
    const dateTimeStr = date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const isCheckIn = log.type === 'CHECK_IN';
    const typeBadge = isCheckIn 
      ? `<span class="badge badge-success">입실 (Check-in)</span>`
      : `<span class="badge badge-info">퇴실 (Check-out)</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${dateTimeStr}</td>
      <td><strong>${log.name}</strong></td>
      <td>${log.phone}</td>
      <td>${typeBadge}</td>
      <td style="font-family: 'Outfit', monospace; font-size: 0.75rem; color: var(--text-muted);">${log.id}</td>
    `;
    logsTableBody.appendChild(tr);
  });
}

logSearchInput.addEventListener('input', renderLogsTable);

logFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    logFilterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    logFilterType = btn.getAttribute('data-filter');
    renderLogsTable();
  });
});

// 9. Toast Notification System
let toastTimer;
function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  toastMessage.textContent = message;
  
  if (isError) {
    toast.classList.add('error');
    toastIcon.className = 'ri-error-warning-fill toast-icon';
  } else {
    toast.classList.remove('error');
    toastIcon.className = 'ri-checkbox-circle-fill toast-icon';
  }

  toast.classList.add('active');

  toastTimer = setTimeout(() => {
    toast.classList.remove('active');
  }, 3500);
}
