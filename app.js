/**
 * 公務車使用紀錄簽到系統 - 主程式邏輯 (app.js)
 * 包含：月曆渲染、數位簽名板、車輛管理、出還車里程計算、LocalStorage 儲存與 CSV 匯出
 */

// ==========================================================================
// 1. 初始化資料與狀態 Store
// ==========================================================================
const STORAGE_KEY_RECORDS = 'car_records_db_v10';
const STORAGE_KEY_VEHICLES = 'car_vehicles_db_v10';
const STORAGE_KEY_MAINTENANCE = 'car_maintenance_db_v10';
const STORAGE_KEY_FUEL_TX = 'car_fuel_transactions_db_v10';
const STORAGE_KEY_PERSONNEL = 'car_personnel_db_v10';
const STORAGE_KEY_FUEL_CARDS = 'car_use_fuel_cards_v10';

const DEFAULT_FUEL_CARDS = [
  {
    id: 'fc-1',
    cardNo: '中油捷利卡 #8839-2041',
    boundCarId: 'v1',
    balance: 2900,
    note: '總務課經辦保管'
  }
];

const DEFAULT_PERSONNEL = [
  { id: 'p1', name: '林大為' },
  { id: 'p2', name: '陳靜宜' },
  { id: 'p3', name: '張明哲' },
  { id: 'p4', name: '袁' },
  { id: 'p5', name: '波' },
  { id: 'p6', name: 'G' },
  { id: 'p7', name: '治' },
  { id: 'p8', name: '祿' },
  { id: 'p9', name: '明' },
  { id: 'p10', name: '放' },
  { id: 'p11', name: '祥' },
  { id: 'p12', name: '升' }
];

const state = {
  currentDate: new Date(), // 當前月曆檢視的基準日期
  selectedCarId: 'ALL',
  searchQuery: '',
  maintSearchQuery: '',
  maintCategoryFilter: 'ALL',
  activeView: 'calendarView',
  tempSignature: '',
  records: [],
  vehicles: [],
  maintenanceRecords: [],
  fuelTransactions: [],
  fuelCards: [],
  personnel: []
};

// 來自「公務車事件紀錄.xlsx」之歷史保養與事件數據 (含待處理任務)
const EXCEL_IMPORTED_MAINTENANCE_RECORDS = [
  { id: "maint-pending-1", date: "2026-08-14 10:00", category: "維修", title: "ALZ-3759 前輪胎磨損估價中", content: "已請原廠開立估價單，待主管批示後安排進場更換", status: "PENDING" },
  { id: "maint-pending-2", date: "2026-08-15 14:00", category: "驗車", title: "公務車定期安全檢驗 (8/25 到期)", content: "請攜帶行車執照與保險卡至特約代檢廠辦理驗車", status: "PENDING" },
  { id: "maint-1", date: "2026-06-24 12:26", category: "維修", title: "公務車開去李依師檢查", content: "清潔空氣幫 在觀察", status: "COMPLETED" },
  { id: "maint-2", date: "2026-03-06 16:27", category: "保養", title: "9:30 公務車保養", content: "已保養完成", status: "COMPLETED" },
  { id: "maint-3", date: "2025-12-02 01:28", category: "維修", title: "公務車多媒體面板無反應，倒車小心!!", content: "12/2 A 已修復OK\n1、旭益檢查源頭有電源但接上主機沒電源判斷為主機問題，報價主機13000，倒車鏡頭可延用\n2、到另一家勁聲汽車音響拆下主機去店內測試是好的，裝回車上後就都好了，檢修費200，另報價主機13800", status: "COMPLETED" },
  { id: "maint-4", date: "2025-05-06 09:36", category: "驗車", title: "公務車驗車", content: "5/6 a  done.", status: "COMPLETED" },
  { id: "maint-5", date: "2025-03-19 09:45", category: "保養", title: "早上10:30 公務車保養", content: "", status: "COMPLETED" },
  { id: "maint-6", date: "2025-03-12 14:51", category: "維修", title: "公務車右大燈壞掉", content: "3/10 a 已去原廠更換", status: "COMPLETED" },
  { id: "maint-7", date: "2025-02-17 20:05", category: "狀況備註", title: "P1 公務車 車位在 B1  3  10", content: "", status: "COMPLETED" },
  { id: "maint-8", date: "2024-12-05 17:14", category: "驗車", title: "公務車alz-3759  驗車完成，下次驗114年5月", content: "12/5 a done", status: "COMPLETED" },
  { id: "maint-9", date: "2024-04-13 08:46", category: "保養", title: "公務車保養", content: "已預約2024/4/15 09:30進場", status: "COMPLETED" },
  { id: "maint-10", date: "2023-05-09 17:28", category: "驗車", title: "公務車3759 驗車  5/28 到期", content: "5/9 a  已驗。", status: "COMPLETED" },
  { id: "maint-11", date: "2023-05-09 17:22", category: "維修", title: "已約公務車  13:00  進廠更換 1.後輪煞車皮及骨  2.引擎蓋防漏油墊片   費用: 13972", content: "", status: "COMPLETED" },
  { id: "maint-12", date: "2023-04-23 08:02", category: "保養", title: "公務車172500左右可以準備進場保養 (現在172590)", content: "4/24 已約4/25 15:00 黃先生", status: "COMPLETED" },
  { id: "maint-13", date: "2023-02-17 18:48", category: "維修", title: "公務車左後輪插到釘子 已補胎完成", content: "", status: "COMPLETED" }
];

// 預設示範油卡儲值與加油紀錄 (含里程照片佐證)
const EXCEL_IMPORTED_FUEL_TRANSACTIONS = [
  { id: 'ft-101', carId: 'v1', type: 'TOPUP', amount: 5000, date: '2026-08-01 09:00', balanceAfter: 5000, note: '總務處統一油卡預付儲值', photos: [] },
  { id: 'ft-102', carId: 'v1', type: 'EXPENSE', amount: 1500, mileage: 42850, date: '2026-08-10 17:30', balanceAfter: 3500, note: '台灣中油西屯站 / 發票：AB88921021', photos: [generateSamplePhotoDataUrl('儀表板加油里程 42,850 km 照片佐證', '#059669', '⛽')] }
];

// 預設固定公務車輛
const DEFAULT_VEHICLES = [
  { id: 'v1', plate: 'ALZ-3759', model: '公務車 (Toyota Altis)', type: '轎車', mileage: 42850, maintMileage: 50000, status: 'AVAILABLE', fuelCardNo: '中油捷利卡 #8839-2041', fuelCardBalance: 3500 }
];

// 產生預設簽名 Data URL 示範圖片 (簡單 Canvas 產生文字樣式簽名)
function generateMockSignature(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 300;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'italic bold 32px cursive, "Noto Sans TC", sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 150, 50);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(30, 75);
  ctx.bezierCurveTo(80, 85, 220, 60, 270, 75);
  ctx.stroke();
  return canvas.toDataURL('image/png');
}

// 駕駛人員字串與陣列安全轉化輔助函式
function formatDrivers(driver) {
  if (!driver) return '';
  if (Array.isArray(driver)) {
    return driver.filter(d => d && String(d).trim() !== '').join(', ');
  }
  if (typeof driver === 'string') {
    return driver.trim();
  }
  return String(driver);
}

// 乘客字串與陣列安全轉化輔助函式 (避免字串 .join 報錯)
function formatPassengers(passengers) {
  if (!passengers) return '';
  if (Array.isArray(passengers)) {
    return passengers.filter(p => p && String(p).trim() !== '').join(', ');
  }
  if (typeof passengers === 'string') {
    return passengers.trim();
  }
  return String(passengers);
}

// 預設示範簽到紀錄 (若 LocalStorage 為空時注入)
function getMockRecords() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  
  const formatDate = (dayOffset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return [
    {
      id: 'rec-101',
      carId: 'v1',
      plate: 'ALZ-3759',
      date: formatDate(-2),
      driver: '林大為',
      department: '總務課',
      destination: '台中市議會 / 簡報會場',
      purpose: '參加年度公務會議',
      startTime: '08:30',
      endTime: '12:00',
      startMileage: 42680,
      endMileage: 42770,
      totalKm: 90,
      status: 'COMPLETED', // 已歸還
      fuelStatus: '滿油/滿電 (100%)',
      passengers: ['張課長', '陳專員'],
      signature: generateMockSignature('林大為'),
      notes: '車輛正常，油箱已加滿'
    },
    {
      id: 'rec-102',
      carId: 'v2',
      plate: 'XYZ-5678',
      date: formatDate(0),
      driver: '陳靜宜',
      department: '業務二組',
      destination: '竹科聯絡處',
      purpose: '重要客戶拜訪與合約簽署',
      startTime: '09:00',
      endTime: '17:00',
      startMileage: 68120,
      endMileage: null,
      totalKm: 0,
      status: 'ACTIVE', // 出勤中
      fuelStatus: '',
      passengers: ['李經理'],
      signature: generateMockSignature('陳靜宜'),
      notes: ''
    },
    {
      id: 'rec-103',
      carId: 'v3',
      plate: 'EV-8888',
      date: formatDate(1),
      driver: '張明哲',
      department: '資訊處',
      destination: '板橋機房中心',
      purpose: '伺服器硬體維護巡檢',
      startTime: '13:30',
      endTime: '18:00',
      startMileage: 18300,
      endMileage: null,
      totalKm: 0,
      status: 'RESERVED', // 預約中
      fuelStatus: '',
      passengers: ['王工程師'],
      signature: generateMockSignature('張明哲'),
      notes: '需使用行車紀錄器'
    }
  ];
}

// ==========================================================================
// 2. 資料載入與持久化 (LocalStorage)
// ==========================================================================
function loadData() {
  const localVehicles = localStorage.getItem(STORAGE_KEY_VEHICLES);
  if (localVehicles) {
    state.vehicles = JSON.parse(localVehicles);
    // 自動修復補齊舊快取的車輛欄位
    state.vehicles.forEach(v => {
      if (v.maintMileage === undefined) v.maintMileage = 50000;
      if (v.fuelCardBalance === undefined) v.fuelCardBalance = 3500;
    });
  } else {
    state.vehicles = DEFAULT_VEHICLES;
    saveVehicles();
  }

  const localRecords = localStorage.getItem(STORAGE_KEY_RECORDS);
  if (localRecords) {
    state.records = JSON.parse(localRecords);
  } else {
    state.records = getMockRecords();
    saveRecords();
  }

  const localMaint = localStorage.getItem(STORAGE_KEY_MAINTENANCE);
  if (localMaint) {
    state.maintenanceRecords = JSON.parse(localMaint);
    // 確保預設示範照片存在 (若原本 LocalStorage 未包含照片)
    const m3 = state.maintenanceRecords.find(m => m.id === 'maint-3');
    if (m3 && (!m3.photos || m3.photos.length === 0)) {
      m3.photos = [
        generateSamplePhotoDataUrl('汽車音響多媒體面板維修收據', '#2563eb', '🧾'),
        generateSamplePhotoDataUrl('主機檢修實景照片', '#6366f1', '📷')
      ];
    }
    const m13 = state.maintenanceRecords.find(m => m.id === 'maint-13');
    if (m13 && (!m13.photos || m13.photos.length === 0)) {
      m13.photos = [
        generateSamplePhotoDataUrl('左後輪中釘補胎現場照片', '#ef4444', '🛠️')
      ];
    }
  } else {
    state.maintenanceRecords = EXCEL_IMPORTED_MAINTENANCE_RECORDS;
    // 注入示範照片附件
    const m3 = state.maintenanceRecords.find(m => m.id === 'maint-3');
    if (m3) {
      m3.photos = [
        generateSamplePhotoDataUrl('汽車音響多媒體面板維修收據', '#2563eb', '🧾'),
        generateSamplePhotoDataUrl('主機檢修實景照片', '#6366f1', '📷')
      ];
    }
    const m13 = state.maintenanceRecords.find(m => m.id === 'maint-13');
    if (m13) {
      m13.photos = [
        generateSamplePhotoDataUrl('左後輪中釘補胎現場照片', '#ef4444', '🛠️')
      ];
    }
    saveMaintenance();
  }

  const localFuelTx = localStorage.getItem(STORAGE_KEY_FUEL_TX);
  if (localFuelTx) {
    state.fuelTransactions = JSON.parse(localFuelTx);
  } else {
    state.fuelTransactions = EXCEL_IMPORTED_FUEL_TRANSACTIONS;
    saveFuelTransactions();
  }

  const localFuelCards = localStorage.getItem(STORAGE_KEY_FUEL_CARDS);
  if (localFuelCards) {
    state.fuelCards = JSON.parse(localFuelCards);
  } else {
    state.fuelCards = DEFAULT_FUEL_CARDS;
    saveFuelCards();
  }

  const localPersonnel = localStorage.getItem(STORAGE_KEY_PERSONNEL);
  if (localPersonnel) {
    state.personnel = JSON.parse(localPersonnel);
  } else {
    state.personnel = DEFAULT_PERSONNEL;
    savePersonnel();
  }
}

function saveFuelCards() {
  localStorage.setItem(STORAGE_KEY_FUEL_CARDS, JSON.stringify(state.fuelCards));
  if (typeof triggerCloudSyncPush === 'function') triggerCloudSyncPush();
}

function savePersonnel() {
  localStorage.setItem(STORAGE_KEY_PERSONNEL, JSON.stringify(state.personnel));
  if (typeof triggerCloudSyncPush === 'function') triggerCloudSyncPush();
}

function saveFuelTransactions() {
  localStorage.setItem(STORAGE_KEY_FUEL_TX, JSON.stringify(state.fuelTransactions));
  if (typeof triggerCloudSyncPush === 'function') triggerCloudSyncPush();
}

// 產生範例事件照片 Data URL
function generateSamplePhotoDataUrl(text, color = '#2563eb', icon = '📷') {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 400, 260);
  
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(10, 10, 380, 240);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 380, 240);

  ctx.fillStyle = color;
  ctx.font = 'bold 20px "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${icon} ${text}`, 200, 120);

  ctx.fillStyle = '#64748b';
  ctx.font = '14px sans-serif';
  ctx.fillText('現場照片 / 估價收據單附件', 200, 160);
  ctx.fillText('🔍 點擊可開啟全螢幕大圖', 200, 190);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(state.records));
  if (typeof triggerCloudSyncPush === 'function') triggerCloudSyncPush();
}

function saveVehicles() {
  localStorage.setItem(STORAGE_KEY_VEHICLES, JSON.stringify(state.vehicles));
  if (typeof triggerCloudSyncPush === 'function') triggerCloudSyncPush();
}

function saveMaintenance() {
  localStorage.setItem(STORAGE_KEY_MAINTENANCE, JSON.stringify(state.maintenanceRecords));
  if (typeof triggerCloudSyncPush === 'function') triggerCloudSyncPush();
}

// ==========================================================================
// 3. UI 視圖渲染 (Calendar Grid / Table / Vehicles / Metrics)
// ==========================================================================

// (A) 指標數據更新
function updateMetrics() {
  const currentY = state.currentDate.getFullYear();
  const currentM = state.currentDate.getMonth();

  // 本月出車數
  const monthRecords = state.records.filter(r => {
    const rd = new Date(r.date);
    return rd.getFullYear() === currentY && rd.getMonth() === currentM;
  });
  const elMonth = document.getElementById('metricMonthCount');
  if (elMonth) elMonth.innerText = `${monthRecords.length} 次`;

  // 目前出勤中車輛
  const elActive = document.getElementById('metricActiveCount');
  if (elActive) {
    const activeRecords = state.records.filter(r => r.status === 'ACTIVE');
    elActive.innerText = `${activeRecords.length} 輛`;
  }

  // 本月累積里程
  const elTotalKm = document.getElementById('metricTotalMileage');
  if (elTotalKm) {
    const totalKm = monthRecords.reduce((acc, r) => acc + (r.totalKm || 0), 0);
    elTotalKm.innerText = `${totalKm.toLocaleString()} km`;
  }

  // 可使用車輛數
  const elCars = document.getElementById('metricAvailableCars');
  if (elCars) {
    const totalCars = state.vehicles.length;
    const availableCars = state.vehicles.filter(v => v.status === 'AVAILABLE').length;
    elCars.innerText = `${availableCars} / ${totalCars}`;
  }
}

// (B) 渲染月曆視圖 (Calendar Grid)
function renderCalendar() {
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();

  // 更新顯示標題 "2026 年 08 月"
  const monthNames = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const titleText = `${year} 年 ${monthNames[month]} 月`;
  document.getElementById('currentMonthDisplay').innerText = titleText;
  document.getElementById('printMonthText').innerText = `月份：${titleText}`;

  const daysGrid = document.getElementById('calendarDaysGrid');
  daysGrid.innerHTML = '';

  // 計算月曆天數
  const firstDayIndex = new Date(year, month, 1).getDay(); // 第一天是星期幾 (0~6)
  const daysInMonth = new Date(year, month + 1, 0).getDate(); // 當月總天數
  const prevMonthDays = new Date(year, month, 0).getDate(); // 上個月總天數

  // 今天日期比較字串 YYYY-MM-DD
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 1. 上個月餘日 (Trailing Days)
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell other-month';
    cell.innerHTML = `
      <div class="calendar-cell-top">
        <span class="date-number">${dayNum}</span>
      </div>
    `;
    daysGrid.appendChild(cell);
  }

  // 2. 當月日期 (Current Month Days)
  for (let day = 1; day <= daysInMonth; day++) {
    const monthStr = String(month + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateFormatted = `${year}-${monthStr}-${dayStr}`;

    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    if (dateFormatted === todayStr) {
      cell.classList.add('today');
    }

    // 取得當天對應紀錄
    const dayRecords = state.records.filter(r => {
      const recDate = r.date || (r.startDate ? r.startDate.split(' ')[0] : '');
      if (recDate !== dateFormatted) return false;
      if (state.selectedCarId !== 'ALL' && r.carId !== state.selectedCarId) return false;
      return true;
    });

    let badgesHtml = '';
    dayRecords.forEach(rec => {
      let shiftClass = 'shift-morning';
      let shiftIcon = '☀️';
      const shiftName = rec.shift || '早班';

      if (shiftName === '晚班') {
        shiftClass = 'shift-evening';
        shiftIcon = '🌙';
      }

      const dStr = formatDrivers(rec.driver);
      const driverText = dStr ? `<div style="font-size:0.75rem; color:#334155; font-weight:600;"><i class="fa-solid fa-id-card" style="color:var(--primary-color);"></i> ${dStr}</div>` : '';
      const pStr = formatPassengers(rec.passengers);
      const passengersText = pStr ? `<div style="font-size:0.72rem; color:#64748b;"><i class="fa-solid fa-users"></i> 乘客: ${pStr}</div>` : '';

      badgesHtml += `
        <div class="record-tag ${shiftClass}" data-record-id="${rec.id}">
          <div class="record-tag-header">
            <span class="record-tag-car">${rec.plate} (${shiftIcon} ${shiftName})</span>
          </div>
          ${driverText}
          ${passengersText}
          ${rec.notes ? `<div class="record-note-badge" title="${rec.notes}"><i class="fa-solid fa-note-sticky"></i> ${rec.notes}</div>` : ''}
        </div>
      `;
    });

    cell.innerHTML = `
      <div class="calendar-cell-top">
        <span class="date-number">${day}</span>
        <button class="btn-add-quick" data-date="${dateFormatted}" title="點擊簽名">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>
      <div class="record-badges-container">
        ${badgesHtml}
      </div>
    `;

    daysGrid.appendChild(cell);
  }

  // 3. 下個月補足日 (Leading Days)
  const totalCells = firstDayIndex + daysInMonth;
  const nextDaysNeeded = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
  for (let j = 1; j <= nextDaysNeeded; j++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell other-month';
    cell.innerHTML = `
      <div class="calendar-cell-top">
        <span class="date-number">${j}</span>
      </div>
    `;
    daysGrid.appendChild(cell);
  }
}

// (C) 渲染表格清單視圖 (Table View)
function renderTable() {
  const tbody = document.getElementById('recordTableBody');
  tbody.innerHTML = '';

  const q = state.searchQuery.trim().toLowerCase();

  const filtered = state.records.filter(r => {
    if (state.selectedCarId !== 'ALL' && r.carId !== state.selectedCarId) return false;
    if (!q) return true;
    return (
      r.date.includes(q) ||
      (r.notes || '').toLowerCase().includes(q) ||
      (r.shift || '').toLowerCase().includes(q)
    );
  });

  document.getElementById('tableRecordCount').innerText = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
          尚無符合條件的簽到紀錄
        </td>
      </tr>
    `;
    return;
  }

  // 依日期倒序 (最新的在上面)
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered.forEach(rec => {
    const tr = document.createElement('tr');

    const shiftName = rec.shift || '早班';
    const shiftBadge = shiftName === '晚班'
      ? `<span class="status-badge" style="background:#f5f3ff; color:#6366f1; border:1px solid #ddd6fe;">🌙 晚班</span>`
      : `<span class="status-badge" style="background:#fffbeb; color:#d97706; border:1px solid #fef3c7;">☀️ 早班</span>`;

    tr.innerHTML = `
      <td>
        <div style="font-weight: 700;">${rec.date}</div>
      </td>
      <td>${shiftBadge}</td>
      <td>
        <div style="font-weight: 600; color: var(--text-main);">${rec.notes || rec.destination || '無備註'}</div>
      </td>
      <td style="text-align: right; white-space: nowrap;">
        <button class="btn btn-secondary btn-return-car" data-id="${rec.id}" style="padding: 0.3rem 0.65rem; font-size: 0.8rem;">
          <i class="fa-solid fa-eye"></i> 查看
        </button>
        <button class="btn btn-icon btn-delete-record" data-id="${rec.id}" title="刪除紀錄">
          <i class="fa-solid fa-trash" style="color: var(--danger-color);"></i>
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// (D) 渲染車輛管理視圖 (Vehicle View)
function renderVehicles() {
  const container = document.getElementById('vehicleGrid');
  container.innerHTML = '';

  // 更新車輛下拉選擇選單
  const filterSelect = document.getElementById('selectCarFilter');
  const formCarSelect = document.getElementById('formCarId');

  filterSelect.innerHTML = `<option value="ALL">🚗 全部公務車輛 (${state.vehicles.length})</option>`;
  formCarSelect.innerHTML = '';

  state.vehicles.forEach(v => {
    // 下拉選單更新
    filterSelect.innerHTML += `<option value="${v.id}" ${state.selectedCarId === v.id ? 'selected' : ''}>${v.plate} - ${v.model}</option>`;
    formCarSelect.innerHTML += `<option value="${v.id}">${v.plate} (${v.type} - ${v.model})</option>`;

    // 尋找綁定之實體油卡
    const boundCard = state.fuelCards.find(c => c.id === v.fuelCardId || c.boundCarId === v.id || c.cardNo === v.fuelCardNo);
    const cardNoDisplay = boundCard ? boundCard.cardNo : (v.fuelCardNo || '未綁定油卡');
    const cardBalDisplay = boundCard ? (boundCard.balance || 0) : (v.fuelCardBalance || 0);

    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.innerHTML = `
      <div class="vehicle-card-header">
        <span class="vehicle-plate">${v.plate}</span>
        <span class="vehicle-status-tag available">🟢 可正常出勤</span>
      </div>
      <div>
        <div style="font-weight: 700; font-size: 1.05rem;">${v.model}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">類別：${v.type}</div>
      </div>
      <div style="background: var(--bg-main); padding: 0.6rem; border-radius: var(--radius-sm); font-size: 0.85rem;">
        <i class="fa-solid fa-gauge"></i> 當前儀表里程：<strong>${(v.mileage || 0).toLocaleString()} km</strong>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.65rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; color: #166534; display: flex; justify-content: space-between; align-items: center; margin-top: 0.2rem;">
        <div>
          <i class="fa-solid fa-credit-card" style="color: #059669;"></i> <strong>${cardNoDisplay}</strong>
        </div>
        <div style="font-size: 0.95rem; font-weight: 700; color: #047857;">
          NT$ ${cardBalDisplay.toLocaleString()}
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-edit-vehicle" data-id="${v.id}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem;">
          <i class="fa-solid fa-pen"></i> 編輯
        </button>
        <button class="btn btn-secondary btn-delete-vehicle" data-id="${v.id}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--danger-color);">
          <i class="fa-solid fa-trash"></i> 刪除
        </button>
      </div>
    `;
    container.appendChild(card);
  });

  // 渲染實體油卡清單卡片 (#fuelCardsGrid)
  renderFuelCards();
}

// (D.15) 渲染實體油卡清單卡片 (#fuelCardsGrid)
function renderFuelCards() {
  const grid = document.getElementById('fuelCardsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!state.fuelCards || state.fuelCards.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1rem;">
        目前尚無登記的實體油卡，請點擊【新增實體油卡】建置油卡資料
      </div>
    `;
    return;
  }

  state.fuelCards.forEach(c => {
    const boundVehicle = state.vehicles.find(v => v.id === c.boundCarId);
    const boundText = boundVehicle ? `${boundVehicle.plate} (${boundVehicle.model})` : '無綁定 (通用油卡)';

    const cardEl = document.createElement('div');
    cardEl.style.cssText = 'background: #f0fdf4; border: 1px solid #a7f3d0; border-radius: 8px; padding: 0.85rem; display: flex; flex-direction: column; justify-content: space-between; gap: 0.6rem;';
    cardEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: #065f46;"><i class="fa-solid fa-credit-card" style="color: #059669;"></i> ${c.cardNo}</div>
          <div style="font-size: 0.78rem; color: #047857; margin-top: 0.2rem;">綁定：${boundText}</div>
          ${c.note ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem;">備註：${c.note}</div>` : ''}
        </div>
        <div style="font-size: 1.15rem; font-weight: 800; color: #059669; white-space: nowrap;">NT$ ${(c.balance || 0).toLocaleString()}</div>
      </div>

      <div style="display: flex; gap: 0.4rem; justify-content: flex-end; align-items: center; border-top: 1px dashed #bbf7d0; padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-quick-topup-card" data-id="${c.id}" style="padding: 0.25rem 0.6rem; font-size: 0.76rem; background: #d1fae5; color: #047857; border: none; font-weight:700;"><i class="fa-solid fa-plus"></i> 儲值</button>
        <button class="btn btn-secondary btn-quick-expense-card" data-id="${c.id}" style="padding: 0.25rem 0.6rem; font-size: 0.76rem; background: #fee2e2; color: #b91c1c; border: none; font-weight:700;"><i class="fa-solid fa-gas-pump"></i> 加油扣款</button>
        <button class="btn btn-icon btn-edit-fuel-card" data-id="${c.id}" title="編輯油卡"><i class="fa-solid fa-pen" style="font-size: 0.8rem;"></i></button>
        <button class="btn btn-icon btn-delete-fuel-card" data-id="${c.id}" title="刪除油卡"><i class="fa-solid fa-trash" style="color: var(--danger-color); font-size: 0.8rem;"></i></button>
      </div>
    `;
    grid.appendChild(cardEl);
  });
}

// (D.2) 渲染油卡餘額與交易明細管理 (Fuel Card Management)
function renderFuelCardManagement() {
  const tbody = document.getElementById('fuelTransactionTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // 油卡與月份篩選元件初始化與動態同步
  const selectCardEl = document.getElementById('fuelCardFilterSelect');
  const monthPickerEl = document.getElementById('fuelMonthPicker');

  if (selectCardEl) {
    const currentVal = selectCardEl.value || 'ALL';
    selectCardEl.innerHTML = `<option value="ALL">💳 全部油卡 (${state.fuelCards.length})</option>`;
    state.fuelCards.forEach(c => {
      const boundV = state.vehicles.find(v => v.id === c.boundCarId);
      const boundText = boundV ? ` [綁定 ${boundV.plate}]` : '';
      selectCardEl.innerHTML += `<option value="${c.id}" ${currentVal === c.id ? 'selected' : ''}>${c.cardNo}${boundText}</option>`;
    });
    selectCardEl.onchange = renderFuelCardManagement;
  }

  if (monthPickerEl && !monthPickerEl.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    monthPickerEl.value = `${y}-${m}`;
    monthPickerEl.onchange = renderFuelCardManagement;
  }

  const selectedCardId = selectCardEl ? selectCardEl.value : 'ALL';
  const selectedMonth = monthPickerEl ? monthPickerEl.value : '';

  // 更新紙本抬頭預覽卡片資訊
  const previewPlate = document.getElementById('previewFuelPlate');

  let selectedCard = state.fuelCards.find(c => c.id === selectedCardId);
  if (previewPlate) {
    previewPlate.innerText = selectedCard ? selectedCard.cardNo : (selectedCardId === 'ALL' ? '全部實體油卡' : '未選擇');
  }

  // 渲染實體油卡清單卡片 (#fuelCardsGrid)
  renderFuelCards();

  // 1. 計算車隊總油卡餘額
  const totalBalance = state.fuelCards.reduce((acc, c) => acc + (c.balance || 0), 0);
  const elTotalBal = document.getElementById('statTotalFuelBalance');
  if (elTotalBal) elTotalBal.innerText = `NT$ ${totalBalance.toLocaleString()}`;

  // 2. 計算登記油卡張數
  const cardCount = state.fuelCards.length;
  const elCardCount = document.getElementById('statFuelCardCount');
  if (elCardCount) elCardCount.innerText = `${cardCount} 張`;

  // 3. 計算本月加油總花費
  const now = new Date();
  const monthExpenses = state.fuelTransactions.filter(tx => {
    if (tx.type !== 'EXPENSE') return false;
    if (selectedMonth && !tx.date.startsWith(selectedMonth)) return false;
    return true;
  }).reduce((acc, tx) => acc + (tx.amount || 0), 0);
  const elMonthExp = document.getElementById('statMonthFuelExpense');
  if (elMonthExp) elMonthExp.innerText = `NT$ ${monthExpenses.toLocaleString()}`;

  // 4. 依選擇的「實體油卡」與「月份」篩選加油/儲值明細
  let filteredTx = state.fuelTransactions.filter(tx => {
    if (selectedCardId !== 'ALL') {
      const matchId = tx.cardId && tx.cardId === selectedCardId;
      const matchNo = selectedCard && tx.cardNo && tx.cardNo === selectedCard.cardNo;
      if (!matchId && !matchNo) return false;
    }
    if (selectedMonth && !tx.date.startsWith(selectedMonth)) return false;
    return true;
  });

  if (filteredTx.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          <i class="fa-solid fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-light); display: block;"></i>
          目前條件下尚無加油或儲值異動紀錄
        </td>
      </tr>
    `;
    return;
  }

  // 排序：最新交易在最上面
  const sortedTx = [...filteredTx].sort((a, b) => new Date(b.date) - new Date(a.date));

  sortedTx.forEach(tx => {
    const card = state.fuelCards.find(c => c.id === tx.cardId);
    const vehicle = state.vehicles.find(v => v.id === tx.carId);

    const cardDisplay = card ? `<div style="font-weight:700; color:#065f46;"><i class="fa-solid fa-credit-card"></i> ${card.cardNo}</div>` : `<div style="font-weight:700; color:#065f46;"><i class="fa-solid fa-credit-card"></i> ${tx.cardNo || '中油捷利卡'}</div>`;
    const carDisplay = vehicle ? `<div style="font-weight:700; color:#1e293b;"><i class="fa-solid fa-car-side" style="color:var(--primary-color);"></i> ${vehicle.plate} (${vehicle.model})</div>` : '未指定車輛';
    
    const isTopUp = tx.type === 'TOPUP';
    const typeBadge = isTopUp 
      ? `<span style="background:#d1fae5; color:#059669; padding:0.2rem 0.55rem; border-radius:4px; font-size:0.8rem; font-weight:700;">🟢 儲值</span>`
      : `<span style="background:#fee2e2; color:#dc2626; padding:0.2rem 0.55rem; border-radius:4px; font-size:0.8rem; font-weight:700;">⛽ 加油</span>`;

    const amtStr = isTopUp ? `+ NT$ ${tx.amount.toLocaleString()}` : `- NT$ ${tx.amount.toLocaleString()}`;
    const amtColor = isTopUp ? '#059669' : '#dc2626';

    const mileageDisplay = tx.mileage ? `${Number(tx.mileage).toLocaleString()} km` : '-';

    let photosHtml = '';
    if (tx.photos && tx.photos.length > 0) {
      photosHtml = `<div style="display: flex; gap: 0.35rem; align-items: center; margin-top: 0.35rem; flex-wrap: wrap;">`;
      tx.photos.forEach(pUrl => {
        photosHtml += `<img src="${pUrl}" class="btn-preview-photo" src-photo="${pUrl}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid #a7f3d0; cursor: pointer;" title="點擊全螢幕放大檢視儀表板/發票佐證照片">`;
      });
      photosHtml += `<span style="font-size:0.75rem; color:#059669; font-weight:700;"><i class="fa-solid fa-camera"></i> 里程照片 (${tx.photos.length})</span></div>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div style="font-weight:700;">${tx.date}</div></td>
      <td>${cardDisplay}</td>
      <td>${carDisplay}</td>
      <td>${typeBadge}</td>
      <td><span style="font-weight:600; color:#334155;">${mileageDisplay}</span></td>
      <td><span style="font-weight:700; color:${amtColor};">${amtStr}</span></td>
      <td><strong>NT$ ${(tx.balanceAfter || 0).toLocaleString()}</strong></td>
      <td><div style="font-weight:700; color:#1e293b;"><i class="fa-solid fa-user-circle" style="color:var(--primary-color);"></i> ${tx.person || '未紀錄'}</div></td>
      <td><div style="font-size:0.85rem; color:#475569;">${tx.note || '-'}</div>${photosHtml}</td>
      <td style="text-align: right;">
        <button class="btn btn-icon btn-delete-fuel-tx" data-id="${tx.id}" title="刪除此筆交易">
          <i class="fa-solid fa-trash" style="color: var(--danger-color);"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// (D.3) 渲染出勤同仁與常用人員名單 (Personnel Management)
function renderPersonnel() {
  const container = document.getElementById('personnelGrid');
  const textCount = document.getElementById('personnelCountText');
  if (textCount) textCount.innerText = state.personnel.length;
  if (!container) return;

  container.innerHTML = '';
  if (state.personnel.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1.5rem;">
        <i class="fa-solid fa-users-slash" style="font-size: 1.8rem; margin-bottom: 0.5rem; color: var(--text-light); display: block;"></i>
        尚無登錄常用人員，請點擊上方按鈕新增同仁名單
      </div>
    `;
    return;
  }

  state.personnel.forEach(p => {
    const card = document.createElement('div');
    card.className = 'personnel-card';
    card.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); display: flex; align-items: center; gap: 0.35rem;">
          <i class="fa-solid fa-user-circle" style="color: var(--primary-color);"></i> ${p.name}
        </div>
      </div>
      <div style="display: flex; gap: 0.25rem;">
        <button class="btn btn-icon btn-edit-personnel" data-id="${p.id}" title="編輯資料">
          <i class="fa-solid fa-pen" style="font-size: 0.8rem;"></i>
        </button>
        <button class="btn btn-icon btn-delete-personnel" data-id="${p.id}" title="刪除此同仁">
          <i class="fa-solid fa-trash" style="color: var(--danger-color); font-size: 0.8rem;"></i>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// 填入簽到 Modal 中的主駕駛與同行乘客多選晶片
function populateDriverAndPassengerOptions(selectedDrivers = [], selectedPassengers = []) {
  const driverContainer = document.getElementById('driverChipsContainer');
  const passengerContainer = document.getElementById('passengerChipsContainer');

  // 駕駛名單純化
  let driverList = [];
  if (Array.isArray(selectedDrivers)) {
    driverList = selectedDrivers;
  } else if (typeof selectedDrivers === 'string' && selectedDrivers.trim() !== '') {
    driverList = [selectedDrivers.trim()];
  }

  // 乘客名單純化
  let passengerList = [];
  if (Array.isArray(selectedPassengers)) {
    passengerList = selectedPassengers;
  } else if (typeof selectedPassengers === 'string' && selectedPassengers.trim() !== '') {
    passengerList = [selectedPassengers.trim()];
  }

  // 1. 渲染主駕駛多選晶片
  if (driverContainer) {
    driverContainer.innerHTML = '';
    state.personnel.forEach((p, idx) => {
      const isSelected = (driverList.length > 0) ? driverList.includes(p.name) : (idx === 0);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `passenger-chip driver-chip ${isSelected ? 'selected' : ''}`;
      chip.setAttribute('data-name', p.name);
      chip.innerHTML = `<i class="fa-solid ${isSelected ? 'fa-square-check' : 'fa-square'}"></i> ${p.name}`;
      
      chip.addEventListener('click', () => {
        const currentlySelected = chip.classList.contains('selected');
        chip.classList.toggle('selected', !currentlySelected);
        const icon = chip.querySelector('i');
        if (icon) {
          icon.className = `fa-solid ${!currentlySelected ? 'fa-square-check' : 'fa-square'}`;
        }
      });

      driverContainer.appendChild(chip);
    });
  }

  // 2. 渲染同行乘客多選晶片
  if (passengerContainer) {
    passengerContainer.innerHTML = '';
    state.personnel.forEach(p => {
      const isSelected = passengerList.includes(p.name);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `passenger-chip ${isSelected ? 'selected' : ''}`;
      chip.setAttribute('data-name', p.name);
      chip.innerHTML = `<i class="fa-solid ${isSelected ? 'fa-square-check' : 'fa-square'}"></i> ${p.name}`;
      
      chip.addEventListener('click', () => {
        const currentlySelected = chip.classList.contains('selected');
        chip.classList.toggle('selected', !currentlySelected);
        const icon = chip.querySelector('i');
        if (icon) {
          icon.className = `fa-solid ${!currentlySelected ? 'fa-square-check' : 'fa-square'}`;
        }
      });

      passengerContainer.appendChild(chip);
    });
  }
}

// 刷新全系統介面
function refreshApp() {
  updateMetrics();
  renderCalendar();
  renderTable();
  renderVehicles();
  renderFuelCardManagement();
  renderPersonnel();
  renderMaintenance();
}

// (E) 渲染公務車保養及狀況紀錄視圖 (Maintenance & Incident View)
function renderMaintenance() {
  const container = document.getElementById('maintCardList');
  if (!container) return;
  container.innerHTML = '';

  const q = (state.maintSearchQuery || '').trim().toLowerCase();
  const cat = state.maintCategoryFilter || 'ALL';

  // 1. 計算待處理筆數並更新晶片徽章 (Pending Badge)
  const pendingCount = state.maintenanceRecords.filter(m => m.status === 'PENDING').length;
  const pendingBadge = document.getElementById('pendingCountBadge');
  if (pendingBadge) {
    pendingBadge.innerText = pendingCount;
    if (pendingCount > 0) {
      pendingBadge.classList.add('has-pending');
    } else {
      pendingBadge.classList.remove('has-pending');
    }
  }

  // 2. 篩選資料
  const filtered = state.maintenanceRecords.filter(m => {
    const itemStatus = m.status || 'COMPLETED';

    if (cat === '待處理') {
      if (itemStatus !== 'PENDING') return false;
    } else if (cat !== 'ALL') {
      if (m.category !== cat) return false;
    }

    if (!q) return true;
    return (
      m.title.toLowerCase().includes(q) ||
      (m.content || '').toLowerCase().includes(q) ||
      m.date.includes(q)
    );
  });

  const countBadge = document.getElementById('maintCountBadge');
  if (countBadge) countBadge.innerText = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 3rem; background: var(--bg-main); border-radius: var(--radius-md);">
        <i class="fa-solid fa-clipboard-check" style="font-size: 2.5rem; margin-bottom: 0.5rem; color: var(--text-light); display: block;"></i>
        ${cat === '待處理' ? '目前尚無待處理的事件與任務 🎉' : '尚無符合條件的保養及狀況紀錄'}
      </div>
    `;
    return;
  }

  // 依日期倒序 (最新的在最上面)
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered.forEach(m => {
    const card = document.createElement('div');
    const itemStatus = m.status || 'COMPLETED';
    const isPending = itemStatus === 'PENDING';
    const catClass = isPending ? 'status-pending' : `cat-${m.category || '保養'}`;
    
    let catBadge = `<span style="background:#eff6ff; color:#2563eb; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.78rem; font-weight:700;">⚙️ 保養</span>`;
    if (m.category === '維修') {
      catBadge = `<span style="background:#fee2e2; color:#ef4444; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.78rem; font-weight:700;">🔧 維修</span>`;
    } else if (m.category === '驗車') {
      catBadge = `<span style="background:#d1fae5; color:#059669; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.78rem; font-weight:700;">📋 驗車</span>`;
    } else if (m.category === '狀況備註') {
      catBadge = `<span style="background:#f3e8ff; color:#7c3aed; padding:0.15rem 0.5rem; border-radius:4px; font-size:0.78rem; font-weight:700;">🅿️ 車況備註</span>`;
    }

    const pendingBadgeHtml = isPending 
      ? `<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:0.15rem 0.55rem; border-radius:4px; font-size:0.78rem; font-weight:700;"><i class="fa-solid fa-clock-rotate-left"></i> ⏳ 待處理中</span>` 
      : '';

    const completeBtnHtml = isPending
      ? `<button class="btn btn-complete-maint" data-id="${m.id}" title="點擊將此事件標記為處理完成並歸庫">
          <i class="fa-solid fa-check"></i> 完成處理
         </button>`
      : '';

    let photosHtml = '';
    if (m.photos && Array.isArray(m.photos) && m.photos.length > 0) {
      photosHtml = `<div class="maint-photo-gallery">` + 
        m.photos.map(p => `<img src="${p}" class="maint-photo-thumb btn-preview-photo" src-photo="${p}" alt="照片附件" title="點擊放大預覽">`).join('') + 
        `</div>`;
    }

    card.className = `maint-card ${catClass}`;
    card.innerHTML = `
      <div class="maint-card-header">
        <div class="maint-title-text" style="flex-wrap: wrap;">
          ${pendingBadgeHtml}
          ${catBadge}
          <span>${m.title}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          ${completeBtnHtml}
          <span class="maint-date-badge"><i class="fa-regular fa-clock"></i> ${m.date}</span>
          <button class="btn btn-icon btn-edit-maint" data-id="${m.id}" title="編輯">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-icon btn-delete-maint" data-id="${m.id}" title="刪除紀錄">
            <i class="fa-solid fa-trash" style="color: var(--danger-color);"></i>
          </button>
        </div>
      </div>
      ${m.content ? `<div class="maint-content-box">${m.content}</div>` : ''}
      ${photosHtml}
    `;

    container.appendChild(card);
  });
}

// ==========================================================================
// 4. 手寫簽名板 Engine (HTML5 Canvas Signature Pad)
// ==========================================================================
class SignaturePadEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;
    this.isDrawing = false;
    this.strokeColor = '#0f172a';
    this.lineWidth = 3;
    this.hasDrawn = false;

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    if (!this.canvas || !this.ctx) return;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setStrokeColor(color) {
    if (!this.ctx) return;
    this.strokeColor = color;
    this.ctx.strokeStyle = color;
  }

  clear() {
    if (!this.canvas || !this.ctx) return;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasDrawn = false;
  }

  getPos(e) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    let clientX = e.clientX;
    let clientY = e.clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  bindEvents() {
    if (!this.canvas || !this.ctx) return;

    const start = (e) => {
      e.preventDefault();
      this.isDrawing = true;
      this.hasDrawn = true;
      const pos = this.getPos(e);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      this.ctx.arc(pos.x, pos.y, this.lineWidth / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this.isDrawing) return;
      e.preventDefault();
      const pos = this.getPos(e);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
      this.hasDrawn = true;
    };

    const stop = () => {
      this.isDrawing = false;
    };

    // Mouse Events
    this.canvas.addEventListener('mousedown', start);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mouseup', stop);
    this.canvas.addEventListener('mouseleave', stop);

    // Touch Events
    this.canvas.addEventListener('touchstart', start);
    this.canvas.addEventListener('touchmove', move);
    this.canvas.addEventListener('touchend', stop);
  }

  toDataURL() {
    if (!this.canvas) return '';
    // 若未手寫劃線，預設產生優雅提示簽名
    if (!this.hasDrawn) {
      return generateMockSignature('公務使用人');
    }
    return this.canvas.toDataURL('image/png');
  }
}

let sigEngine = null;

// ==========================================================================
// 5. 事件監聽與 Modal 互動控制器
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. 初始化資料
  loadData();

  // 2. 首次全系統渲染
  refreshApp();

  // 3. 安全初始化簽名 Engine (若元素存在才創建)
  if (document.getElementById('signatureCanvas')) {
    sigEngine = new SignaturePadEngine('signatureCanvas');
  }

  // ------------------------------------------------------------------------
  // A. 分頁切換 (Tabs) 與預設開啟頁面控制
  // ------------------------------------------------------------------------
  const switchView = (targetId) => {
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-target') === targetId);
    });
    document.querySelectorAll('.view-section').forEach(v => {
      if (v.id === targetId) {
        v.classList.remove('hidden');
      } else {
        v.classList.add('hidden');
      }
    });
    state.activeView = targetId;

    // 頂部控制列 (toolbar) 僅在「月曆簽到視圖」及「使用紀錄清單」頁面顯示，切換到其他頁面自動隱藏
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) {
      if (targetId === 'calendarView' || targetId === 'tableView') {
        toolbar.classList.remove('hidden');
      } else {
        toolbar.classList.add('hidden');
      }
    }
  };

  // 強制確保無論透過電腦或手機開啟連結，均預設載入「月曆簽到視圖」
  switchView('calendarView');

  // 點擊頂部 Logo / 標題時自動返回「月曆簽到視圖」
  const navBrand = document.querySelector('.navbar-brand');
  if (navBrand) {
    navBrand.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('calendarView');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // 監聽導覽列 Tab 按鈕點擊切換
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      switchView(targetId);
    });
  });

  // ------------------------------------------------------------------------
  // A.1 手機精簡模式 (Mobile Mode) 切換控制
  // ------------------------------------------------------------------------
  const btnToggleMobileMode = document.getElementById('btnToggleMobileMode');
  const mobileModeBtnText = document.getElementById('mobileModeBtnText');

  const setMobileMode = (isMobile) => {
    if (isMobile) {
      document.body.classList.add('mobile-mode');
      if (mobileModeBtnText) mobileModeBtnText.innerText = '📱 手機模式 (簡化版)';
      if (state.activeView !== 'calendarView' && state.activeView !== 'fuelView') {
        switchView('calendarView');
      }
    } else {
      document.body.classList.remove('mobile-mode');
      if (mobileModeBtnText) mobileModeBtnText.innerText = '💻 切換手機模式';
    }
    localStorage.setItem('user_mobile_mode_pref', isMobile ? 'true' : 'false');
  };

  const savedMobilePref = localStorage.getItem('user_mobile_mode_pref');
  if (savedMobilePref === 'true') {
    setMobileMode(true);
  } else if (savedMobilePref === 'false') {
    setMobileMode(false);
  } else {
    setMobileMode(window.innerWidth <= 768);
  }

  if (btnToggleMobileMode) {
    btnToggleMobileMode.addEventListener('click', () => {
      const isMobileNow = document.body.classList.contains('mobile-mode');
      setMobileMode(!isMobileNow);
    });
  }

  // ------------------------------------------------------------------------
  // A.2 跨裝置雲端資料即時同步引擎 (Cloud Auto Sync Engine)
  // ------------------------------------------------------------------------
  const SYNC_API_URL = '/api/sync';
  let isSyncing = false;
  let lastLocalUpdateTime = parseInt(localStorage.getItem('last_local_update_time') || '0');

  const updateCloudSyncStatusUI = (statusText, statusColor = '#34d399') => {
    const el = document.getElementById('cloudSyncStatus');
    if (el) {
      el.innerHTML = `<i class="fa-solid fa-cloud" style="color: ${statusColor};"></i> <span>${statusText}</span>`;
    }
  };

  window.triggerCloudSyncPush = async () => {
    try {
      lastLocalUpdateTime = Date.now();
      localStorage.setItem('last_local_update_time', String(lastLocalUpdateTime));

      const payloadState = {
        records: state.records,
        vehicles: state.vehicles,
        fuelTransactions: state.fuelTransactions,
        fuelCards: state.fuelCards,
        personnel: state.personnel,
        maintenanceRecords: state.maintenanceRecords
      };

      updateCloudSyncStatusUI('雲端同步中...', '#60a5fa');

      const res = await fetch(SYNC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: payloadState,
          timestamp: lastLocalUpdateTime
        })
      });

      if (res.ok) {
        updateCloudSyncStatusUI('雲端已同步', '#34d399');
      } else {
        updateCloudSyncStatusUI('雲端同步重試中', '#fbbf24');
      }
    } catch (err) {
      console.warn('雲端上傳同步暫時離線:', err);
      updateCloudSyncStatusUI('本機儲存 (離線)', '#94a3b8');
    }
  };

  const mergeStateData = (cloudState) => {
    if (!cloudState) return false;

    // 接通 Supabase 雲端資料庫：以雲端資料為 100% 權威主導，防止手機舊快取倒灌
    state.records = cloudState.records || [];
    state.records.forEach(r => {
      if (r) {
        if (!r.date && r.startDate) r.date = r.startDate.split(' ')[0];
        if (!r.plate && r.carId) {
          const v = (cloudState.vehicles || []).find(veh => veh.id === r.carId);
          if (v) r.plate = v.plate;
        }
      }
    });

    state.fuelTransactions = cloudState.fuelTransactions || [];
    state.vehicles = (cloudState.vehicles && cloudState.vehicles.length > 0) ? cloudState.vehicles : state.vehicles;
    state.fuelCards = (cloudState.fuelCards && cloudState.fuelCards.length > 0) ? cloudState.fuelCards : state.fuelCards;
    state.personnel = (cloudState.personnel && cloudState.personnel.length > 0) ? cloudState.personnel : state.personnel;
    state.maintenanceRecords = cloudState.maintenanceRecords || [];

    return true;
  };

  const triggerCloudSyncPull = async (isBackground = false) => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      if (!isBackground) updateCloudSyncStatusUI('檢查雲端更新...', '#60a5fa');

      const res = await fetch(SYNC_API_URL);
      if (res.ok) {
        const json = await res.json();
        if (json && json.state) {
          const hasNewData = mergeStateData(json.state);
          const isNewer = json.timestamp && (json.timestamp > lastLocalUpdateTime);

          if (hasNewData || isNewer) {
            if (json.timestamp) {
              lastLocalUpdateTime = Math.max(lastLocalUpdateTime, json.timestamp);
              localStorage.setItem('last_local_update_time', String(lastLocalUpdateTime));
            }

            localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(state.records));
            localStorage.setItem(STORAGE_KEY_VEHICLES, JSON.stringify(state.vehicles));
            localStorage.setItem(STORAGE_KEY_FUEL_TX, JSON.stringify(state.fuelTransactions));
            localStorage.setItem(STORAGE_KEY_FUEL_CARDS, JSON.stringify(state.fuelCards));
            localStorage.setItem(STORAGE_KEY_PERSONNEL, JSON.stringify(state.personnel));
            localStorage.setItem(STORAGE_KEY_MAINTENANCE, JSON.stringify(state.maintenanceRecords));

            refreshApp();
            updateCloudSyncStatusUI('雲端已同步', '#34d399');
          } else {
            if (!isBackground) updateCloudSyncStatusUI('已是最新資料', '#34d399');
          }
        }
      }
    } catch (err) {
      if (!isBackground) updateCloudSyncStatusUI('本機快取模式', '#94a3b8');
    } finally {
      isSyncing = false;
    }
  };

  // 手動點擊「雲端同步」按鈕：先 PULL 下載並智慧合併 Telegram 異動，再 PUSH 本機狀態
  const btnManualCloudSync = document.getElementById('btnManualCloudSync');
  if (btnManualCloudSync) {
    btnManualCloudSync.addEventListener('click', () => {
      triggerCloudSyncPull(false).then(() => triggerCloudSyncPush());
    });
  }

  // 初始載入與頁面返回前景時自動抓取雲端最新資料
  triggerCloudSyncPull(false);

  // 定時背景自動比對同步 (每 4 秒自動輪詢雲端，確保 Telegram Bot 紀錄即時呈現)
  setInterval(() => {
    triggerCloudSyncPull(true);
  }, 4000);

  // 切換回分頁時自動同步
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      triggerCloudSyncPull(false);
    }
  });

  // ------------------------------------------------------------------------
  // B. 月曆控制列 (Prev/Next Month, Today, Vehicle Filter)
  // ------------------------------------------------------------------------
  document.getElementById('btnPrevMonth').addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    refreshApp();
  });

  document.getElementById('btnNextMonth').addEventListener('click', () => {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    refreshApp();
  });

  document.getElementById('btnToday').addEventListener('click', () => {
    state.currentDate = new Date();
    refreshApp();
  });

  document.getElementById('selectCarFilter').addEventListener('change', (e) => {
    state.selectedCarId = e.target.value;
    refreshApp();
  });

  // 搜尋關鍵字
  document.getElementById('searchTableInput').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    renderTable();
  });

  // ------------------------------------------------------------------------
  // C. 支援「早班 / 晚班」與「特別備註」之手寫簽到 Modal 控制
  // ------------------------------------------------------------------------
  const modalRecord = document.getElementById('modalRecord');
  const formRecord = document.getElementById('formRecord');

  // 班別晶片選擇監聽
  document.querySelectorAll('.shift-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.shift-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const shiftVal = chip.getAttribute('data-shift');
      document.getElementById('formShift').value = shiftVal;
    });
  });

  // 依當前時間計算跨日晚班與預設日期/班別 (20:00~隔天08:00 歸屬當日晚班)
  const getDefaultSignInfo = (presetDate = '') => {
    if (presetDate) {
      return { date: presetDate, shift: '早班' };
    }

    const now = new Date();
    const hours = now.getHours();

    let signDateObj = new Date(now);
    let defaultShift = '早班';

    // 晚班跨日視窗：20:00 至 隔天 08:00
    if (hours >= 20) {
      // 20:00 ~ 23:59: 當天日期，自動切換為「晚班」
      defaultShift = '晚班';
    } else if (hours < 8) {
      // 00:00 ~ 07:59 (隔天凌晨): 歸屬前一日(yesterday)之晚班
      signDateObj.setDate(signDateObj.getDate() - 1);
      defaultShift = '晚班';
    } else {
      // 08:00 ~ 19:59: 當天日期，自動選擇「早班」
      defaultShift = '早班';
    }

    const y = signDateObj.getFullYear();
    const m = String(signDateObj.getMonth() + 1).padStart(2, '0');
    const d = String(signDateObj.getDate()).padStart(2, '0');

    return {
      date: `${y}-${m}-${d}`,
      shift: defaultShift
    };
  };

  const openRecordModal = (presetDate = '') => {
    formRecord.reset();
    document.getElementById('recordId').value = '';

    const signInfo = getDefaultSignInfo(presetDate);
    const signDate = signInfo.date;
    const defaultShift = signInfo.shift;

    document.getElementById('formDate').value = signDate;
    document.getElementById('displaySignDate').innerHTML = `<i class="fa-regular fa-calendar"></i> 簽到日期：${signDate}`;
    
    // 依時間自動切換為「早班」或「晚班」
    document.getElementById('formShift').value = defaultShift;
    document.querySelectorAll('.shift-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-shift') === defaultShift);
    });

    // 取得當前選擇或預設的公務車資訊
    const currentCar = state.vehicles.find(v => v.id === (state.selectedCarId !== 'ALL' ? state.selectedCarId : (state.vehicles[0] ? state.vehicles[0].id : 'v1'))) || state.vehicles[0];
    const carId = currentCar ? currentCar.id : 'v1';
    const carPlate = currentCar ? currentCar.plate : 'ALZ-3759';

    document.getElementById('formCarId').value = carId;
    const elSignCar = document.getElementById('displaySignCar');
    if (elSignCar) {
      elSignCar.innerHTML = `<i class="fa-solid fa-car-side"></i> 公務車 (${carPlate})`;
    }

    // 填入駕駛與同行乘客選單
    populateDriverAndPassengerOptions();

    modalRecord.classList.add('active');
  };

  document.getElementById('btnOpenNewRecord').addEventListener('click', () => openRecordModal());

  // 手機專用右下角懸浮按鈕點擊觸發簽到
  const mobileFloatingBtn = document.getElementById('mobileFloatingAddBtn');
  if (mobileFloatingBtn) {
    mobileFloatingBtn.addEventListener('click', () => openRecordModal());
  }

  // 手機/電腦重置與同步預設資料按鈕
  const btnResetData = document.getElementById('btnResetData');
  if (btnResetData) {
    btnResetData.addEventListener('click', () => {
      if (confirm('確定要清理這台裝置上的舊快取，並同步重置為最新系統預設數據嗎？')) {
        localStorage.clear();
        loadData();
        refreshApp();
        alert('✅ 裝置資料已成功重置與同步！');
      }
    });
  }

  // 點擊日曆格任何位置或 "+" 號皆觸發手寫簽名彈窗
  document.addEventListener('click', (e) => {
    const addBtn = e.target.closest('.btn-add-quick');
    const cellTop = e.target.closest('.calendar-cell-top');

    if (addBtn) {
      openRecordModal(addBtn.getAttribute('data-date'));
    } else if (cellTop && !e.target.closest('.record-tag')) {
      const btn = cellTop.querySelector('.btn-add-quick');
      if (btn) openRecordModal(btn.getAttribute('data-date'));
    }
  });

  // 關閉 Record Modal
  document.querySelectorAll('.btnCloseRecordModal').forEach(b => {
    b.addEventListener('click', () => modalRecord.classList.remove('active'));
  });

  // 提交簽到表單 (包含早/晚班、駕駛、乘客與備註)
  formRecord.addEventListener('submit', (e) => {
    e.preventDefault();

    const carId = document.getElementById('formCarId').value;
    const vehicle = state.vehicles.find(v => v.id === carId);

    const noteInput = document.getElementById('formNoteQuick');
    const noteText = noteInput ? noteInput.value.trim() : '';
    const shiftVal = document.getElementById('formShift').value || '早班';

    const selectedDriverChips = document.querySelectorAll('#driverChipsContainer .driver-chip.selected');
    const driversArr = Array.from(selectedDriverChips).map(c => c.getAttribute('data-name'));
    const driverVal = driversArr.length > 0 ? driversArr : (state.personnel[0] ? [state.personnel[0].name] : ['未填駕駛']);

    const selectedPassengerChips = document.querySelectorAll('#passengerChipsContainer .passenger-chip.selected');
    const passengersArr = Array.from(selectedPassengerChips).map(c => c.getAttribute('data-name'));

    const newRecord = {
      id: 'rec-' + Date.now(),
      carId: carId,
      plate: vehicle ? vehicle.plate : 'ALZ-3759',
      date: document.getElementById('formDate').value,
      shift: shiftVal,
      driver: driverVal,
      passengers: passengersArr,
      department: '',
      noteQuick: noteText,
      startTime: shiftVal === '早班' ? '08:00' : '17:00',
      endTime: '',
      destination: noteText || '公務使用',
      purpose: '',
      startMileage: vehicle ? (vehicle.mileage || 0) : 0,
      endMileage: null,
      totalKm: 0,
      status: 'ACTIVE',
      signature: '',
      notes: noteText
    };

    state.records.unshift(newRecord);
    saveRecords();
    refreshApp();

    modalRecord.classList.remove('active');
  });

  // ------------------------------------------------------------------------
  // D. 獨立手寫簽名板 Modal 控制 (相容性保留)
  // ------------------------------------------------------------------------
  const modalSignature = document.getElementById('modalSignature');
  const btnCloseSig = document.getElementById('btnCloseSignatureModal');
  if (btnCloseSig && modalSignature) btnCloseSig.addEventListener('click', () => modalSignature.classList.remove('active'));

  const btnCancelSig = document.getElementById('btnCancelSignature');
  if (btnCancelSig && modalSignature) btnCancelSig.addEventListener('click', () => modalSignature.classList.remove('active'));

  // 筆頭顏色選擇
  document.querySelectorAll('.btn-color-pick').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const color = e.target.getAttribute('data-color');
      if (sigEngine) sigEngine.setStrokeColor(color);
    });
  });

  const btnClearSig = document.getElementById('btnClearSignature');
  if (btnClearSig && sigEngine) btnClearSig.addEventListener('click', () => sigEngine.clear());

  // ------------------------------------------------------------------------
  // E. 簽名與備註詳情 Modal 控制
  // ------------------------------------------------------------------------
  const modalDetail = document.getElementById('modalReturnCar');

  const openDetailModal = (recordId) => {
    const rec = state.records.find(r => r.id === recordId);
    if (!rec) return;

    document.getElementById('returnRecordId').value = rec.id;
    
    const shiftIcon = (rec.shift === '晚班') ? '🌙' : '☀️';
    const shiftText = rec.shift || '早班';

    document.getElementById('detailHeaderBox').innerHTML = `
      <span><i class="fa-solid fa-car-side" style="color: var(--primary-color);"></i> 公務車 (${rec.plate || 'ALZ-3759'})</span>
      <span style="color: var(--primary-color);">${rec.date} ${shiftIcon} ${shiftText}</span>
    `;

    const detailSigImg = document.getElementById('detailSignatureImg');
    if (detailSigImg) detailSigImg.src = rec.signature || '';
    const driversStr = formatDrivers(rec.driver) || '未指定駕駛';
    const passengersStr = formatPassengers(rec.passengers) || '無同行乘客';
    document.getElementById('detailNoteBox').innerHTML = `
      <div style="margin-bottom: 0.4rem;"><strong>🚘 駕駛人員：</strong> <span style="color: var(--primary-color); font-weight: 700;">${driversStr}</span></div>
      <div style="margin-bottom: 0.4rem;"><strong>👥 同行乘客：</strong> <span style="color: #475569;">${passengersStr}</span></div>
      <div style="margin-top: 0.5rem; padding-top: 0.4rem; border-top: 1px dashed var(--border-color);"><strong>📝 特別備註：</strong> ${rec.notes || rec.destination || '無特別備註'}</div>
    `;

    modalDetail.classList.add('active');
  };

  // 點擊日曆格內簽到卡片或清單【查看】開啟詳情
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-return-car');
    if (btn) {
      openDetailModal(btn.getAttribute('data-id'));
    }

    const tag = e.target.closest('.record-tag');
    if (tag) {
      openDetailModal(tag.getAttribute('data-record-id'));
    }
  });

  const btnCloseReturn = document.getElementById('btnCloseReturnModal');
  if (btnCloseReturn) btnCloseReturn.addEventListener('click', () => modalDetail.classList.remove('active'));

  const btnCancelReturn = document.getElementById('btnCancelReturn');
  if (btnCancelReturn) btnCancelReturn.addEventListener('click', () => modalDetail.classList.remove('active'));

  // 詳情彈窗內的【刪除紀錄】按鈕
  const btnDeleteDetail = document.getElementById('btnDeleteDetailRecord');
  if (btnDeleteDetail) {
    btnDeleteDetail.addEventListener('click', () => {
      const recId = document.getElementById('returnRecordId').value;
      if (recId && confirm('確定要刪除這筆簽名紀錄嗎？')) {
        state.records = state.records.filter(r => r.id !== recId);
        saveRecords();
        refreshApp();
        modalDetail.classList.remove('active');
      }
    });
  }

  // 刪除單筆紀錄
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-delete-record');
    if (btn) {
      const id = btn.getAttribute('data-id');
      if (confirm('確定要刪除這筆簽到紀錄嗎？')) {
        state.records = state.records.filter(r => r.id !== id);
        saveRecords();
        refreshApp();
      }
    }
  });

  // ------------------------------------------------------------------------
  // F. 車輛管理 Modal 控制
  // ------------------------------------------------------------------------
  const modalVehicle = document.getElementById('modalVehicle');
  const formVehicle = document.getElementById('formVehicle');

  const populateVehicleFuelCardDropdown = (selectedCardId = '', vehicleId = '') => {
    const select = document.getElementById('vehicleFuelCardSelect');
    if (!select) return;
    select.innerHTML = '<option value="">無綁定實體油卡</option>';

    state.fuelCards.forEach(c => {
      const boundV = state.vehicles.find(v => v.id === c.boundCarId);
      const isThisVehicleBound = boundV && vehicleId && boundV.id === vehicleId;
      const boundInfo = boundV ? (isThisVehicleBound ? ' [目前綁定]' : ` [已被 ${boundV.plate} 綁定]`) : '';
      const isSelected = (selectedCardId && c.id === selectedCardId) || (selectedCardId && c.cardNo === selectedCardId);
      select.innerHTML += `<option value="${c.id}" ${isSelected ? 'selected' : ''}>${c.cardNo}${boundInfo} (餘額 NT$ ${c.balance.toLocaleString()})</option>`;
    });
  };

  const btnOpenVeh = document.getElementById('btnOpenAddVehicle');
  if (btnOpenVeh && formVehicle) {
    btnOpenVeh.addEventListener('click', () => {
      formVehicle.reset();
      document.getElementById('vehicleEditId').value = '';
      populateVehicleFuelCardDropdown();
      document.getElementById('modalVehicleTitle').innerText = '新增公務車資料';
      modalVehicle.classList.add('active');
    });
  }

  const btnCloseVeh = document.getElementById('btnCloseVehicleModal');
  if (btnCloseVeh && modalVehicle) btnCloseVeh.addEventListener('click', () => modalVehicle.classList.remove('active'));

  const btnCancelVeh = document.getElementById('btnCancelVehicle');
  if (btnCancelVeh && modalVehicle) btnCancelVeh.addEventListener('click', () => modalVehicle.classList.remove('active'));

  if (formVehicle) {
    formVehicle.addEventListener('submit', (e) => {
      e.preventDefault();

      const editId = document.getElementById('vehicleEditId').value;
      const plate = document.getElementById('vehiclePlate').value.trim().toUpperCase();
      const model = document.getElementById('vehicleModel').value.trim();
      const type = document.getElementById('vehicleType').value;
      const mileage = parseInt(document.getElementById('vehicleCurrentMileage').value) || 0;
      const selectedCardId = document.getElementById('vehicleFuelCardSelect').value;

      const selectedCard = state.fuelCards.find(c => c.id === selectedCardId);
      const fuelCardNo = selectedCard ? selectedCard.cardNo : '';
      const fuelCardBalance = selectedCard ? selectedCard.balance : 0;

      let targetVehicleId = editId;

      if (editId) {
        const v = state.vehicles.find(item => item.id === editId);
        if (v) {
          v.plate = plate;
          v.model = model;
          v.type = type;
          v.mileage = mileage;
          v.fuelCardId = selectedCardId;
          v.fuelCardNo = fuelCardNo;
          v.fuelCardBalance = fuelCardBalance;
        }
      } else {
        targetVehicleId = 'v-' + Date.now();
        const newV = {
          id: targetVehicleId,
          plate: plate,
          model: model,
          type: type,
          mileage: mileage,
          fuelCardId: selectedCardId,
          fuelCardNo: fuelCardNo,
          fuelCardBalance: fuelCardBalance,
          status: 'AVAILABLE'
        };
        state.vehicles.push(newV);
      }

      // 雙向同步更新實體油卡 boundCarId 關係
      state.fuelCards.forEach(c => {
        if (selectedCardId && c.id === selectedCardId) {
          c.boundCarId = targetVehicleId;
        } else if (c.boundCarId === targetVehicleId) {
          c.boundCarId = '';
        }
      });

      saveFuelCards();
      saveVehicles();
      refreshApp();
      modalVehicle.classList.remove('active');
    });
  }

  // 編輯與刪除車輛
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit-vehicle');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const v = state.vehicles.find(item => item.id === id);
      if (v) {
        document.getElementById('vehicleEditId').value = v.id;
        document.getElementById('vehiclePlate').value = v.plate;
        document.getElementById('vehicleModel').value = v.model;
        document.getElementById('vehicleType').value = v.type;
        document.getElementById('vehicleCurrentMileage').value = v.mileage;

        // 下拉選單填入並選取對應油卡
        const boundCard = state.fuelCards.find(c => c.id === v.fuelCardId || c.boundCarId === v.id || c.cardNo === v.fuelCardNo);
        populateVehicleFuelCardDropdown(boundCard ? boundCard.id : '', v.id);

        document.getElementById('modalVehicleTitle').innerText = '編輯公務車資料';
        modalVehicle.classList.add('active');
      }
    }

    const delBtn = e.target.closest('.btn-delete-vehicle');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (confirm('確定要移除此車輛嗎？')) {
        state.vehicles = state.vehicles.filter(v => v.id !== id);
        saveVehicles();
        refreshApp();
      }
    }
  });

  // ------------------------------------------------------------------------
  // F.2 油卡與加油交易紀錄 Modal 控制與照片拍照佐證
  // ------------------------------------------------------------------------
  const modalFuelTx = document.getElementById('modalFuelTx');
  const formFuelTx = document.getElementById('formFuelTx');
  let currentFuelPhotos = [];

  function renderFuelPhotoPreviews() {
    const container = document.getElementById('fuelPhotoPreviewGallery');
    if (!container) return;
    container.innerHTML = '';

    currentFuelPhotos.forEach((photoUrl, idx) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';

      wrapper.innerHTML = `
        <img src="${photoUrl}" class="btn-preview-photo" src-photo="${photoUrl}" style="width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid #a7f3d0; cursor: pointer;" title="點擊全螢幕放大檢視儀表板/發票照片">
        <button type="button" class="btn-remove-fuel-photo" data-index="${idx}" style="position: absolute; top: -6px; right: -6px; background: #ef4444; color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.25);" title="刪除此照片">✕</button>
      `;
      container.appendChild(wrapper);
    });
  }

  document.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.btn-remove-fuel-photo');
    if (removeBtn) {
      const idx = parseInt(removeBtn.getAttribute('data-index'));
      currentFuelPhotos.splice(idx, 1);
      renderFuelPhotoPreviews();
    }
  });

  const btnTriggerFuelCamera = document.getElementById('btnTriggerFuelCamera');
  const btnTriggerFuelFileSelect = document.getElementById('btnTriggerFuelFileSelect');
  const fuelPhotoInput = document.getElementById('fuelPhotoInput');
  const fuelCameraInput = document.getElementById('fuelCameraInput');
  const fuelPhotoDropzone = document.getElementById('fuelPhotoDropzone');

  const handleFuelFilesUpload = async (files) => {
    if (!files || !files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const compressedData = await compressImageFile(file, 800, 0.75);
        currentFuelPhotos.push(compressedData);
      } catch (err) {
        console.error('加油照片讀取壓縮失敗:', err);
      }
    }
    renderFuelPhotoPreviews();
  };

  if (btnTriggerFuelCamera && fuelCameraInput) {
    btnTriggerFuelCamera.addEventListener('click', (e) => {
      e.preventDefault();
      fuelCameraInput.click();
    });
  }

  if (btnTriggerFuelFileSelect && fuelPhotoInput) {
    btnTriggerFuelFileSelect.addEventListener('click', (e) => {
      e.preventDefault();
      fuelPhotoInput.click();
    });
  }

  if (fuelPhotoInput) {
    fuelPhotoInput.addEventListener('change', (e) => handleFuelFilesUpload(e.target.files));
  }
  if (fuelCameraInput) {
    fuelCameraInput.addEventListener('change', (e) => handleFuelFilesUpload(e.target.files));
  }

  if (fuelPhotoDropzone) {
    fuelPhotoDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      fuelPhotoDropzone.style.background = '#d1fae5';
    });
    fuelPhotoDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      fuelPhotoDropzone.style.background = '#f0fdf4';
    });
    fuelPhotoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      fuelPhotoDropzone.style.background = '#f0fdf4';
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFuelFilesUpload(e.dataTransfer.files);
      }
    });
  }

  const openFuelTxModal = (txId = '', presetCarId = '', presetCardId = '', presetType = 'EXPENSE') => {
    if (!formFuelTx || !modalFuelTx) return;
    formFuelTx.reset();
    document.getElementById('fuelTxEditId').value = txId;
    currentFuelPhotos = [];

    if (txId) {
      const tx = state.fuelTransactions.find(t => t.id === txId);
      if (tx && tx.photos) {
        currentFuelPhotos = [...tx.photos];
      }
    }

    renderFuelPhotoPreviews();

    // 填入油卡選單
    const selectCard = document.getElementById('fuelTxCardId');
    selectCard.innerHTML = '';
    state.fuelCards.forEach(c => {
      const boundV = state.vehicles.find(v => v.id === c.boundCarId);
      const boundText = boundV ? ` [綁定 ${boundV.plate}]` : '';
      selectCard.innerHTML += `<option value="${c.id}" ${presetCardId === c.id ? 'selected' : ''}>${c.cardNo}${boundText} (餘額 NT$ ${c.balance.toLocaleString()})</option>`;
    });

    // 填入車輛選單
    const selectCar = document.getElementById('fuelTxCarId');
    selectCar.innerHTML = '';
    state.vehicles.forEach(v => {
      selectCar.innerHTML += `<option value="${v.id}" ${presetCarId === v.id ? 'selected' : ''}>${v.plate} - ${v.model}</option>`;
    });

    // 填入加油人員下拉選單
    const personSelect = document.getElementById('fuelTxPersonSelect');
    if (personSelect) {
      personSelect.innerHTML = '';
      if (!state.personnel || state.personnel.length === 0) {
        personSelect.innerHTML = '<option value="駕駛同仁">駕駛同仁</option>';
      } else {
        state.personnel.forEach(p => {
          personSelect.innerHTML += `<option value="${p.name}">${p.name}</option>`;
        });
      }
    }

    document.getElementById('fuelTxType').value = presetType;

    const updateCardDefaults = () => {
      const selectedCard = state.fuelCards.find(c => c.id === selectCard.value);
      if (selectedCard) {
        if (selectedCard.boundCarId) {
          selectCar.value = selectedCard.boundCarId;
        }
        const selectedCar = state.vehicles.find(v => v.id === selectCar.value);
        if (selectedCar) {
          document.getElementById('fuelTxMileage').value = selectedCar.mileage || '';
        }
        calculateBalance();
      }
    };

    const calculateBalance = () => {
      const selectedCard = state.fuelCards.find(c => c.id === selectCard.value);
      const currentBal = selectedCard ? (selectedCard.balance || 0) : 0;
      const type = document.getElementById('fuelTxType').value;
      const amount = parseInt(document.getElementById('fuelTxAmount').value) || 0;

      let estBalance = currentBal;
      if (type === 'TOPUP') {
        estBalance = currentBal + amount;
      } else {
        estBalance = currentBal - amount;
      }
      document.getElementById('fuelTxBalanceAfter').value = estBalance;
    };

    updateCardDefaults();

    selectCard.onchange = updateCardDefaults;
    selectCar.onchange = () => {
      const selectedCar = state.vehicles.find(v => v.id === selectCar.value);
      if (selectedCar) {
        document.getElementById('fuelTxMileage').value = selectedCar.mileage || '';
      }
    };
    document.getElementById('fuelTxType').onchange = calculateBalance;
    document.getElementById('fuelTxAmount').oninput = calculateBalance;

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('fuelTxDate').value = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

    modalFuelTx.classList.add('active');
  };

  const btnOpenFuelTx = document.getElementById('btnOpenAddFuelTx');
  if (btnOpenFuelTx) btnOpenFuelTx.addEventListener('click', () => openFuelTxModal());

  const btnCloseFuelTx = document.getElementById('btnCloseFuelTxModal');
  if (btnCloseFuelTx) btnCloseFuelTx.addEventListener('click', () => modalFuelTx.classList.remove('active'));

  const btnCancelFuelTx = document.getElementById('btnCancelFuelTx');
  if (btnCancelFuelTx) btnCancelFuelTx.addEventListener('click', () => modalFuelTx.classList.remove('active'));

  // 提交加油/儲值紀錄表單
  if (formFuelTx) {
    formFuelTx.addEventListener('submit', (e) => {
      e.preventDefault();

      const cardId = document.getElementById('fuelTxCardId').value;
      const carId = document.getElementById('fuelTxCarId').value;
      const type = document.getElementById('fuelTxType').value;
      const amount = parseInt(document.getElementById('fuelTxAmount').value) || 0;
      const mileage = parseInt(document.getElementById('fuelTxMileage').value) || 0;
      const balanceAfter = parseInt(document.getElementById('fuelTxBalanceAfter').value) || 0;
      const person = document.getElementById('fuelTxPersonSelect').value || (state.personnel[0] ? state.personnel[0].name : '駕駛同仁');
      const rawDate = document.getElementById('fuelTxDate').value;
      const date = rawDate.replace('T', ' ');
      const note = document.getElementById('fuelTxNote').value.trim();

      const fuelCard = state.fuelCards.find(c => c.id === cardId);
      if (!fuelCard) {
        alert('請選擇有效的實體油卡');
        return;
      }

      // 直接扣款/儲值至選擇的實體油卡
      fuelCard.balance = balanceAfter;

      // 如果該油卡有預設綁定車輛，同步更新車輛上顯示的油卡餘額
      if (fuelCard.boundCarId) {
        const boundV = state.vehicles.find(v => v.id === fuelCard.boundCarId);
        if (boundV) boundV.fuelCardBalance = balanceAfter;
      }

      const vehicle = state.vehicles.find(v => v.id === carId);
      if (vehicle && mileage > (vehicle.mileage || 0)) {
        vehicle.mileage = mileage;
      }

      const newTx = {
        id: 'ft-' + Date.now(),
        cardId: cardId,
        cardNo: fuelCard.cardNo,
        carId: carId,
        type: type,
        amount: amount,
        mileage: mileage,
        balanceAfter: balanceAfter,
        person: person,
        date: date,
        note: note,
        photos: [...currentFuelPhotos]
      };

      state.fuelTransactions.unshift(newTx);

      saveFuelCards();
      saveVehicles();
      saveFuelTransactions();
      refreshApp();
      modalFuelTx.classList.remove('active');
    });
  }

  // ------------------------------------------------------------------------
  // F.3 實體油卡管理 Modal 與點擊事件處理
  // ------------------------------------------------------------------------

  const modalFuelCard = document.getElementById('modalFuelCard');
  const formFuelCard = document.getElementById('formFuelCard');

  const openFuelCardModal = (cardId = '') => {
    if (!formFuelCard || !modalFuelCard) return;
    formFuelCard.reset();
    document.getElementById('fuelCardEditId').value = cardId;

    const selectBoundCar = document.getElementById('fuelCardBoundCarId');
    selectBoundCar.innerHTML = '<option value="">無綁定 (通用油卡)</option>';
    state.vehicles.forEach(v => {
      selectBoundCar.innerHTML += `<option value="${v.id}">${v.plate} - ${v.model}</option>`;
    });

    if (cardId) {
      const card = state.fuelCards.find(c => c.id === cardId);
      if (card) {
        document.getElementById('fuelCardNameNo').value = card.cardNo;
        selectBoundCar.value = card.boundCarId || '';
        document.getElementById('fuelCardBalance').value = card.balance;
        document.getElementById('fuelCardNote').value = card.note || '';
        document.getElementById('modalFuelCardTitle').innerText = '編輯實體油卡資料';
      }
    } else {
      document.getElementById('modalFuelCardTitle').innerText = '新增實體油卡資料';
    }

    modalFuelCard.classList.add('active');
  };

  document.querySelectorAll('.btnOpenAddFuelCard').forEach(btn => {
    btn.addEventListener('click', () => openFuelCardModal());
  });

  const btnCloseFuelCard = document.getElementById('btnCloseFuelCardModal');
  if (btnCloseFuelCard) btnCloseFuelCard.addEventListener('click', () => modalFuelCard.classList.remove('active'));

  const btnCancelFuelCard = document.getElementById('btnCancelFuelCard');
  if (btnCancelFuelCard) btnCancelFuelCard.addEventListener('click', () => modalFuelCard.classList.remove('active'));

  if (formFuelCard) {
    formFuelCard.addEventListener('submit', (e) => {
      e.preventDefault();

      const editId = document.getElementById('fuelCardEditId').value;
      const cardNo = document.getElementById('fuelCardNameNo').value.trim();
      const boundCarId = document.getElementById('fuelCardBoundCarId').value;
      const balance = parseInt(document.getElementById('fuelCardBalance').value) || 0;
      const note = document.getElementById('fuelCardNote').value.trim();

      if (editId) {
        const card = state.fuelCards.find(c => c.id === editId);
        if (card) {
          card.cardNo = cardNo;
          card.boundCarId = boundCarId;
          card.balance = balance;
          card.note = note;
        }
      } else {
        const newCard = {
          id: 'fc-' + Date.now(),
          cardNo: cardNo,
          boundCarId: boundCarId,
          balance: balance,
          note: note
        };
        state.fuelCards.push(newCard);
      }

      if (boundCarId) {
        const v = state.vehicles.find(v => v.id === boundCarId);
        if (v) {
          v.fuelCardNo = cardNo;
          v.fuelCardBalance = balance;
        }
      }

      saveFuelCards();
      saveVehicles();
      refreshApp();
      modalFuelCard.classList.remove('active');
    });
  }

  document.addEventListener('click', (e) => {
    const editCardBtn = e.target.closest('.btn-edit-fuel-card');
    if (editCardBtn) {
      const id = editCardBtn.getAttribute('data-id');
      openFuelCardModal(id);
    }

    const deleteCardBtn = e.target.closest('.btn-delete-fuel-card');
    if (deleteCardBtn) {
      const id = deleteCardBtn.getAttribute('data-id');
      if (confirm('確定要刪除此實體油卡資料嗎？')) {
        state.fuelCards = state.fuelCards.filter(c => c.id !== id);
        saveFuelCards();
        refreshApp();
      }
    }

    const topupCardBtn = e.target.closest('.btn-quick-topup-card');
    if (topupCardBtn) {
      const cardId = topupCardBtn.getAttribute('data-id');
      const card = state.fuelCards.find(c => c.id === cardId);
      openFuelTxModal('', card ? card.boundCarId : '', cardId, 'TOPUP');
    }

    const expenseCardBtn = e.target.closest('.btn-quick-expense-card');
    if (expenseCardBtn) {
      const cardId = expenseCardBtn.getAttribute('data-id');
      const card = state.fuelCards.find(c => c.id === cardId);
      openFuelTxModal('', card ? card.boundCarId : '', cardId, 'EXPENSE');
    }
  });

  // 刪除單筆油卡異動紀錄
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-delete-fuel-tx');
    if (btn) {
      const id = btn.getAttribute('data-id');
      if (confirm('確定要刪除這筆油卡交易紀錄嗎？')) {
        state.fuelTransactions = state.fuelTransactions.filter(tx => tx.id !== id);
        saveFuelTransactions();
        refreshApp();
      }
    }
  });

  // ------------------------------------------------------------------------
  // F.3 出勤同仁與常用人員名單 Modal 控制
  // ------------------------------------------------------------------------
  const modalPersonnel = document.getElementById('modalPersonnel');
  const formPersonnel = document.getElementById('formPersonnel');

  const btnOpenPersonnel = document.getElementById('btnOpenAddPersonnel');
  if (btnOpenPersonnel && formPersonnel) {
    btnOpenPersonnel.addEventListener('click', () => {
      formPersonnel.reset();
      document.getElementById('personnelEditId').value = '';
      document.getElementById('modalPersonnelTitle').innerText = '新增常用同仁資料';
      modalPersonnel.classList.add('active');
    });
  }

  const btnClosePersonnel = document.getElementById('btnClosePersonnelModal');
  if (btnClosePersonnel && modalPersonnel) btnClosePersonnel.addEventListener('click', () => modalPersonnel.classList.remove('active'));

  const btnCancelPersonnel = document.getElementById('btnCancelPersonnel');
  if (btnCancelPersonnel && modalPersonnel) btnCancelPersonnel.addEventListener('click', () => modalPersonnel.classList.remove('active'));

  if (formPersonnel) {
    formPersonnel.addEventListener('submit', (e) => {
      e.preventDefault();

      const editId = document.getElementById('personnelEditId').value;
      const name = document.getElementById('personnelName').value.trim();

      if (!name) {
        alert('請輸入同仁姓名或簡稱');
        return;
      }

      if (editId) {
        const p = state.personnel.find(item => item.id === editId);
        if (p) {
          p.name = name;
        }
      } else {
        const newP = {
          id: 'p-' + Date.now(),
          name: name
        };
        state.personnel.push(newP);
      }

      savePersonnel();
      refreshApp();
      modalPersonnel.classList.remove('active');
    });
  }

  // 編輯與刪除人員按鈕點擊監聽
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit-personnel');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      const p = state.personnel.find(item => item.id === id);
      if (p) {
        document.getElementById('personnelEditId').value = p.id;
        document.getElementById('personnelName').value = p.name;
        document.getElementById('modalPersonnelTitle').innerText = '編輯常用同仁資料';
        modalPersonnel.classList.add('active');
      }
    }

    const delBtn = e.target.closest('.btn-delete-personnel');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (confirm('確定要移除這位同仁嗎？移除後將不影響過去已簽到的歷史紀錄。')) {
        state.personnel = state.personnel.filter(p => p.id !== id);
        savePersonnel();
        refreshApp();
      }
    }
  });

  // ------------------------------------------------------------------------
  // H. 車輛保養與狀況紀錄 (Maintenance Records View) 控制與照片上傳
  // ------------------------------------------------------------------------
  const modalMaint = document.getElementById('modalMaintenance');
  const formMaint = document.getElementById('formMaint');
  let currentMaintPhotos = [];

  // 圖片壓縮輔助工具 (限制最大寬度與畫質，節省 LocalStorage 空間)
  function compressImageFile(file, maxWidth = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (err) => reject(err);
        img.src = e.target.result;
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // 渲染彈窗內暫存照片縮圖
  function renderMaintPhotoPreviews() {
    const container = document.getElementById('maintPhotoPreviewGallery');
    if (!container) return;
    container.innerHTML = '';

    currentMaintPhotos.forEach((photoUrl, idx) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-block';

      wrapper.innerHTML = `
        <img src="${photoUrl}" class="btn-preview-photo" src-photo="${photoUrl}" style="width: 72px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer;" title="點擊放大全螢幕預覽">
        <button type="button" class="btn-remove-photo" data-index="${idx}" style="position: absolute; top: -6px; right: -6px; background: #ef4444; color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.25);" title="刪除此照片">✕</button>
      `;
      container.appendChild(wrapper);
    });
  }

  // 處理上傳檔案串（支援多檔與壓縮）
  const handleFilesUpload = async (files) => {
    if (!files || !files.length) return;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const compressedData = await compressImageFile(file);
        currentMaintPhotos.push(compressedData);
      } catch (err) {
        console.error('圖片讀取壓縮失敗:', err);
      }
    }
    renderMaintPhotoPreviews();
  };

  // 彈窗開啟處理 (支援 defaultStatus: 'COMPLETED' 或 'PENDING')
  const openMaintModal = (maintId = '', defaultStatus = 'COMPLETED') => {
    formMaint.reset();
    document.getElementById('maintEditId').value = '';
    currentMaintPhotos = [];
    renderMaintPhotoPreviews();

    if (maintId) {
      const item = state.maintenanceRecords.find(m => m.id === maintId);
      if (item) {
        document.getElementById('maintEditId').value = item.id;
        document.getElementById('maintDate').value = item.date.replace(' ', 'T');
        document.getElementById('maintCategory').value = item.category || '保養';
        document.getElementById('maintStatus').value = item.status || 'COMPLETED';
        document.getElementById('maintTitle').value = item.title;
        document.getElementById('maintContent').value = item.content || '';
        currentMaintPhotos = item.photos ? [...item.photos] : [];
        renderMaintPhotoPreviews();
        document.getElementById('modalMaintTitle').innerHTML = '<i class="fa-solid fa-pen"></i> 編輯事件紀錄';
      }
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const localNowStr = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

      document.getElementById('maintDate').value = localNowStr;
      document.getElementById('maintStatus').value = defaultStatus;
      if (defaultStatus === 'PENDING') {
        document.getElementById('modalMaintTitle').innerHTML = '<i class="fa-solid fa-clock-rotate-left" style="color:#f59e0b;"></i> 新增待處理事件';
      } else {
        document.getElementById('modalMaintTitle').innerHTML = '<i class="fa-solid fa-wrench"></i> 新增保養/事件紀錄';
      }
    }

    modalMaint.classList.add('active');
  };

  // 監聽照片檔案選取 input
  const photoInput = document.getElementById('maintPhotoInput');
  const cameraInput = document.getElementById('maintCameraInput');
  const btnTriggerFileSelect = document.getElementById('btnTriggerFileSelect');
  const btnTriggerCamera = document.getElementById('btnTriggerCamera');
  const photoDropzone = document.getElementById('photoDropzone');

  if (btnTriggerFileSelect && photoInput) {
    btnTriggerFileSelect.addEventListener('click', (e) => {
      e.stopPropagation();
      photoInput.click();
    });
  }

  if (btnTriggerCamera && cameraInput) {
    btnTriggerCamera.addEventListener('click', (e) => {
      e.stopPropagation();
      cameraInput.click();
    });
  }

  if (photoDropzone) {
    photoDropzone.addEventListener('click', (e) => {
      // 避免點擊子按鈕時觸發兩次
      if (e.target.closest('#btnTriggerFileSelect') || e.target.closest('#btnTriggerCamera')) return;
      if (photoInput) photoInput.click();
    });

    // 拖曳（Drag & Drop）處理
    photoDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      photoDropzone.style.borderColor = 'var(--primary-color)';
      photoDropzone.style.background = 'var(--primary-light)';
    });

    photoDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      photoDropzone.style.borderColor = 'var(--border-color)';
      photoDropzone.style.background = 'var(--bg-main)';
    });

    photoDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      photoDropzone.style.borderColor = 'var(--border-color)';
      photoDropzone.style.background = 'var(--bg-main)';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFilesUpload(Array.from(e.dataTransfer.files));
      }
    });
  }

  if (photoInput) {
    photoInput.addEventListener('change', async (e) => {
      await handleFilesUpload(Array.from(e.target.files));
      photoInput.value = '';
    });
  }

  if (cameraInput) {
    cameraInput.addEventListener('change', async (e) => {
      await handleFilesUpload(Array.from(e.target.files));
      cameraInput.value = '';
    });
  }

  // 剪貼簿直接貼上截圖 (Ctrl+V)
  window.addEventListener('paste', async (e) => {
    if (!modalMaint.classList.contains('active')) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;

    const imageFiles = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) imageFiles.push(blob);
      }
    }

    if (imageFiles.length > 0) {
      await handleFilesUpload(imageFiles);
    }
  });

  // 移除單張暫存照片
  document.addEventListener('click', (e) => {
    const btnRemove = e.target.closest('.btn-remove-photo');
    if (btnRemove) {
      e.stopPropagation();
      const idx = parseInt(btnRemove.getAttribute('data-index'));
      if (!isNaN(idx)) {
        currentMaintPhotos.splice(idx, 1);
        renderMaintPhotoPreviews();
      }
    }
  });

  const btnOpenMaint = document.getElementById('btnOpenAddMaint');
  if (btnOpenMaint) btnOpenMaint.addEventListener('click', () => openMaintModal('', 'COMPLETED'));

  const btnCloseMaint = document.getElementById('btnCloseMaintModal');
  if (btnCloseMaint) btnCloseMaint.addEventListener('click', () => modalMaint.classList.remove('active'));

  const btnCancelMaint = document.getElementById('btnCancelMaint');
  if (btnCancelMaint) btnCancelMaint.addEventListener('click', () => modalMaint.classList.remove('active'));

  // 點擊【完成處理】按鈕標記事件已完成並自動歸庫
  document.addEventListener('click', (e) => {
    const btnComplete = e.target.closest('.btn-complete-maint');
    if (btnComplete) {
      const id = btnComplete.getAttribute('data-id');
      const item = state.maintenanceRecords.find(m => m.id === id);
      if (item) {
        item.status = 'COMPLETED';
        saveMaintenance();
        renderMaintenance();
        alert(`✅ 「${item.title}」已處理完成！已自動歸類至【${item.category}】歷史紀錄中。`);
      }
    }
  });

  // 搜尋關鍵字過濾
  const searchMaintInput = document.getElementById('searchMaintInput');
  if (searchMaintInput) {
    searchMaintInput.addEventListener('input', (e) => {
      state.maintSearchQuery = e.target.value;
      renderMaintenance();
    });
  }

  // 類別晶片切換
  document.querySelectorAll('.btn-maint-filter').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-maint-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.maintCategoryFilter = btn.getAttribute('data-cat');
      renderMaintenance();
    });
  });

  // 提交新增/編輯保養表單
  if (formMaint) {
    formMaint.addEventListener('submit', (e) => {
      e.preventDefault();

      const editId = document.getElementById('maintEditId').value;
      const rawDate = document.getElementById('maintDate').value;
      const formattedDate = rawDate.replace('T', ' ');
      const catVal = document.getElementById('maintCategory').value;
      const statusVal = document.getElementById('maintStatus').value || 'COMPLETED';
      const titleVal = document.getElementById('maintTitle').value.trim();
      const contentVal = document.getElementById('maintContent').value.trim();

      if (editId) {
        const item = state.maintenanceRecords.find(m => m.id === editId);
        if (item) {
          item.date = formattedDate;
          item.category = catVal;
          item.status = statusVal;
          item.title = titleVal;
          item.content = contentVal;
          item.photos = [...currentMaintPhotos];
        }
      } else {
        const newMaint = {
          id: 'maint-' + Date.now(),
          date: formattedDate,
          category: catVal,
          status: statusVal,
          title: titleVal,
          content: contentVal,
          photos: [...currentMaintPhotos]
        };
        state.maintenanceRecords.unshift(newMaint);
      }

      saveMaintenance();
      renderMaintenance();
      modalMaint.classList.remove('active');
    });
  }

  // 大圖 Lightbox 預覽控制
  const modalPhotoPreview = document.getElementById('modalPhotoPreview');
  const lightboxImg = document.getElementById('lightboxImg');

  document.addEventListener('click', (e) => {
    const previewImg = e.target.closest('.btn-preview-photo');
    if (previewImg) {
      const src = previewImg.getAttribute('src-photo') || previewImg.src;
      if (lightboxImg && modalPhotoPreview) {
        lightboxImg.src = src;
        modalPhotoPreview.classList.add('active');
      }
    }
  });

  const btnClosePhotoPreview = document.getElementById('btnClosePhotoPreview');
  if (btnClosePhotoPreview && modalPhotoPreview) {
    btnClosePhotoPreview.addEventListener('click', () => modalPhotoPreview.classList.remove('active'));
  }

  if (modalPhotoPreview) {
    modalPhotoPreview.addEventListener('click', (e) => {
      if (e.target === modalPhotoPreview) modalPhotoPreview.classList.remove('active');
    });
  }

  // 卡片按鈕 (編輯 / 刪除)
  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.btn-edit-maint');
    if (editBtn) {
      openMaintModal(editBtn.getAttribute('data-id'));
    }

    const delBtn = e.target.closest('.btn-delete-maint');
    if (delBtn) {
      const id = delBtn.getAttribute('data-id');
      if (confirm('確定要刪除這筆保養/狀況紀錄嗎？')) {
        state.maintenanceRecords = state.maintenanceRecords.filter(m => m.id !== id);
        saveMaintenance();
        renderMaintenance();
      }
    }
  });

  // ------------------------------------------------------------------------
  // G. 報表 Excel / CSV 匯出與整月日曆列印
  // ------------------------------------------------------------------------

  // 1. 依照紙本格式匯出「加油紀錄 Excel 表 (.xls)」
  function exportFuelExcelTable(cardIdFilter = '', monthFilter = '') {
    const selectCardEl = document.getElementById('fuelCardFilterSelect');
    const monthPickerEl = document.getElementById('fuelMonthPicker');

    const selectedCardId = cardIdFilter || (selectCardEl ? selectCardEl.value : 'ALL');
    const selectedMonth = monthFilter || (monthPickerEl ? monthPickerEl.value : '');

    const selectedCard = state.fuelCards ? state.fuelCards.find(c => c.id === selectedCardId) : null;

    let boundCarPlateStr = '';
    let cardNoStr = '全部實體油卡';

    if (selectedCard) {
      cardNoStr = selectedCard.cardNo || '未知油卡';
      const boundV = state.vehicles.find(v => v.id === selectedCard.boundCarId || v.fuelCardId === selectedCard.id);
      if (boundV) {
        boundCarPlateStr = `${boundV.plate} (${boundV.model || '公務車'})`;
      } else {
        boundCarPlateStr = '全部公務車';
      }
    } else if (selectedCardId === 'ALL') {
      cardNoStr = '全部實體油卡';
      boundCarPlateStr = '全部車隊公務車';
    } else {
      cardNoStr = selectedCardId;
      boundCarPlateStr = '公務車';
    }

    const cardHeaderStr = `車牌號碼：${boundCarPlateStr}　｜　油卡卡號：${cardNoStr}`;
    const plate = selectedCard ? (boundCarPlateStr.split(' ')[0] + '_' + selectedCard.cardNo) : '全部油卡';

    let targetYearStr = '';
    let targetMonthStr = '';
    let rocYearStr = '';

    if (selectedMonth) {
      const [y, m] = selectedMonth.split('-');
      targetYearStr = y;
      targetMonthStr = m;
      rocYearStr = `${parseInt(y) - 1911}`;
    } else {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      targetYearStr = `${y}`;
      targetMonthStr = m;
      rocYearStr = `${y - 1911}`;
    }

    // 篩選加油交易（僅包含選擇油卡之加油扣款紀錄，排除儲值）
    let filteredTx = state.fuelTransactions.filter(tx => {
      if (tx.type !== 'EXPENSE') return false; // 只顯示加油扣款，不顯示儲值
      if (selectedCardId !== 'ALL') {
        const matchId = tx.cardId && tx.cardId === selectedCardId;
        const matchNo = selectedCard && tx.cardNo && tx.cardNo === selectedCard.cardNo;
        if (!matchId && !matchNo) return false;
      }
      if (selectedMonth && !tx.date.startsWith(selectedMonth)) return false;
      return true;
    });

    // 依時間由舊到新排序 (符合紙本填寫順序)
    filteredTx.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 產生表格 Data 行 (欄位完全對應圖片紙本格式：日期, 里程數, 加油金額, 剩餘金額, 記錄者, 車況)
    let dataRowsHtml = '';
    filteredTx.forEach(tx => {
      const dateShort = tx.date ? tx.date.split(' ')[0] : '';
      const mileageVal = tx.mileage ? Number(tx.mileage).toLocaleString() : '';
      const amountVal = tx.amount ? Number(tx.amount).toLocaleString() : '';
      const balanceVal = (tx.balanceAfter !== undefined && tx.balanceAfter !== null) ? Number(tx.balanceAfter).toLocaleString() : '';
      const personVal = tx.person || '';
      const noteVal = tx.note || '';

      dataRowsHtml += `
        <tr>
          <td style="border: 1pt solid #000000; padding: 6px; text-align: center; height: 32px; font-size: 11pt;">${dateShort}</td>
          <td style="border: 1pt solid #000000; padding: 6px; text-align: right; height: 32px; font-size: 11pt;">${mileageVal}</td>
          <td style="border: 1pt solid #000000; padding: 6px; text-align: right; height: 32px; font-size: 11pt;">${amountVal}</td>
          <td style="border: 1pt solid #000000; padding: 6px; text-align: right; height: 32px; font-size: 11pt;">${balanceVal}</td>
          <td style="border: 1pt solid #000000; padding: 6px; text-align: center; height: 32px; font-size: 11pt;">${personVal}</td>
          <td style="border: 1pt solid #000000; padding: 6px; text-align: left; height: 32px; font-size: 11pt;">${noteVal}</td>
        </tr>
      `;
    });

    // 補齊紙本空白列至至少 20 列 (方便印出列印紙本填寫)
    const minRows = Math.max(20, filteredTx.length);
    for (let i = filteredTx.length; i < minRows; i++) {
      dataRowsHtml += `
        <tr>
          <td style="border: 1pt solid #000000; padding: 6px; height: 32px;"></td>
          <td style="border: 1pt solid #000000; padding: 6px; height: 32px;"></td>
          <td style="border: 1pt solid #000000; padding: 6px; height: 32px;"></td>
          <td style="border: 1pt solid #000000; padding: 6px; height: 32px;"></td>
          <td style="border: 1pt solid #000000; padding: 6px; height: 32px;"></td>
          <td style="border: 1pt solid #000000; padding: 6px; height: 32px;"></td>
        </tr>
      `;
    }

    // 組合完整 Excel 網頁表格 (含 MSO XML 樣式標頭)
    const excelTemplate = `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
 <x:ExcelWorkbook>
  <x:ExcelWorksheets>
   <x:ExcelWorksheet>
    <x:Name>加油紀錄表</x:Name>
    <x:WorksheetOptions>
     <x:DisplayGridlines/>
    </x:WorksheetOptions>
   </x:ExcelWorksheet>
  </x:ExcelWorksheets>
 </x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
  body { font-family: "標楷體", "微軟正黑體", Arial, sans-serif; }
  .title-table { width: 100%; border: none; margin-bottom: 5px; }
  .title-table td { border: none; font-size: 18pt; font-weight: bold; text-align: center; vertical-align: middle; }
  .meta-table { width: 100%; border: none; margin-bottom: 8px; font-size: 13pt; font-weight: bold; }
  .meta-table td { border: none; padding: 4px; vertical-align: middle; }
  .grid-table { width: 100%; border-collapse: collapse; text-align: center; }
  .grid-table th { border: 1.5pt solid #000000; background-color: #e2e8f0; font-size: 13pt; font-weight: bold; padding: 8px; height: 36px; vertical-align: middle; }
  .grid-table td { border: 1pt solid #000000; font-size: 11pt; padding: 6px; height: 32px; vertical-align: middle; }
</style>
</head>
<body>
  <table class="title-table">
    <tr>
      <td colspan="6" style="font-size: 18pt; font-weight: bold; text-align: center; padding: 10px;">公務車油卡加油紀錄表</td>
    </tr>
  </table>
  <table class="meta-table">
    <tr>
      <td colspan="6" style="text-align: left; font-size: 13pt; font-weight: bold; padding: 4px;">${cardHeaderStr}</td>
    </tr>
  </table>
  <table class="grid-table" border="1" cellspacing="0" cellpadding="4">
    <thead>
      <tr>
        <th style="width: 14%;">日 期</th>
        <th style="width: 16%;">里 程 數</th>
        <th style="width: 16%;">加 油 金 額</th>
        <th style="width: 16%;">剩 餘 金 額</th>
        <th style="width: 15%;">記 錄 者</th>
        <th style="width: 23%;">車況 ex:左後方燈罩下有...</th>
      </tr>
    </thead>
    <tbody>
      ${dataRowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([excelTemplate], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const filename = `公務車加油紀錄表_${plate}_${targetYearStr}${targetMonthStr}.xls`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 2. 匯出「簽到紀錄 CSV 報表」
  function exportSignInRecordsCsv() {
    if (state.records.length === 0) {
      alert('目前無任何簽到紀錄可匯出');
      return;
    }

    let csvContent = "\uFEFF單號,用車日期,車牌號碼,駕駛人,部門,目的地,事由,時段,出發里程(km),歸還里程(km),累積行駛(km),狀態,油電狀態,同行人員\n";

    state.records.forEach(r => {
      const driverStr = Array.isArray(r.driver) ? r.driver.join('/') : (r.driver || '');
      const psgStr = Array.isArray(r.passengers) ? r.passengers.join('/') : (r.passengers || '');
      const destStr = r.destination ? r.destination.replace(/"/g, '""') : '';
      const purposeStr = (r.purpose || r.note || '').replace(/"/g, '""');

      const row = [
        `"${r.id || ''}"`,
        `"${r.date || ''}"`,
        `"${r.plate || ''}"`,
        `"${driverStr}"`,
        `"${r.department || ''}"`,
        `"${destStr}"`,
        `"${purposeStr}"`,
        `"${r.startTime || ''}-${r.endTime || ''}"`,
        `"${r.startMileage || 0}"`,
        `"${r.endMileage || ''}"`,
        `"${r.totalKm || 0}"`,
        `"${r.status === 'COMPLETED' ? '已還車簽退' : (r.status === 'ACTIVE' ? '使用出勤中' : '預約中')}"`,
        `"${r.fuelStatus || ''}"`,
        `"${psgStr}"`
      ].join(",");
      csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `公務車使用簽到紀錄報表_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 匯出彈窗控制 Modal
  const modalExportChoice = document.getElementById('modalExportChoice');
  const btnExportCsv = document.getElementById('btnExportCsv');
  const btnCloseExportModal = document.getElementById('btnCloseExportModal');
  const btnCancelExportModal = document.getElementById('btnCancelExportModal');

  if (btnExportCsv && modalExportChoice) {
    btnExportCsv.addEventListener('click', () => {
      modalExportChoice.classList.add('active');
    });
  }

  if (btnCloseExportModal && modalExportChoice) {
    btnCloseExportModal.addEventListener('click', () => modalExportChoice.classList.remove('active'));
  }
  if (btnCancelExportModal && modalExportChoice) {
    btnCancelExportModal.addEventListener('click', () => modalExportChoice.classList.remove('active'));
  }

  // 加油紀錄頁面工具列按鈕：匯出加油紀錄 Excel 表 (依紙本格式)
  const btnExportFuelExcel = document.getElementById('btnExportFuelExcel');
  if (btnExportFuelExcel) {
    btnExportFuelExcel.addEventListener('click', () => {
      exportFuelExcelTable();
    });
  }

  // 彈窗內的兩個匯出選項按鈕
  const btnExportFuelExcelModal = document.getElementById('btnExportFuelExcelModal');
  if (btnExportFuelExcelModal) {
    btnExportFuelExcelModal.addEventListener('click', () => {
      exportFuelExcelTable();
      if (modalExportChoice) modalExportChoice.classList.remove('active');
    });
  }

  const btnExportSignInCsvModal = document.getElementById('btnExportSignInCsvModal');
  if (btnExportSignInCsvModal) {
    btnExportSignInCsvModal.addEventListener('click', () => {
      exportSignInRecordsCsv();
      if (modalExportChoice) modalExportChoice.classList.remove('active');
    });
  }

  // 3. JSON 跨裝置資料備份與匯入
  const btnExportBackupJson = document.getElementById('btnExportBackupJson');
  if (btnExportBackupJson) {
    btnExportBackupJson.addEventListener('click', () => {
      const fullData = {
        version: '10',
        exportedAt: new Date().toISOString(),
        vehicles: state.vehicles,
        records: state.records,
        maintenanceRecords: state.maintenanceRecords,
        fuelTransactions: state.fuelTransactions,
        personnel: state.personnel
      };
      const jsonStr = JSON.stringify(fullData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `公務車簽到系統備份資料_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  const btnTriggerImportJson = document.getElementById('btnTriggerImportJson');
  const inputImportJson = document.getElementById('inputImportJson');

  if (btnTriggerImportJson && inputImportJson) {
    btnTriggerImportJson.addEventListener('click', () => inputImportJson.click());

    inputImportJson.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);
          if (importedData.vehicles) state.vehicles = importedData.vehicles;
          if (importedData.records) state.records = importedData.records;
          if (importedData.maintenanceRecords) state.maintenanceRecords = importedData.maintenanceRecords;
          if (importedData.fuelTransactions) state.fuelTransactions = importedData.fuelTransactions;
          if (importedData.personnel) state.personnel = importedData.personnel;

          saveVehicles();
          saveRecords();
          saveMaintenance();
          saveFuelTransactions();
          savePersonnel();

          refreshApp();
          if (modalExportChoice) modalExportChoice.classList.remove('active');
          alert('✅ 跨裝置備份資料已成功匯入並同步！');
        } catch (err) {
          alert('❌ 備份檔案解析失敗，請確認檔案格式是否正確。');
        }
      };
      reader.readAsText(file);
    });
  }

  // 一鍵列印
  document.getElementById('btnPrintCalendar').addEventListener('click', () => {
    window.print();
  });

  // ------------------------------------------------------------------------
  // H. Telegram Bot 機器人整合設定
  // ------------------------------------------------------------------------
  const modalTelegram = document.getElementById('modalTelegram');
  const btnOpenTelegramModal = document.getElementById('btnOpenTelegramModal');
  const btnCloseTelegramModal = document.getElementById('btnCloseTelegramModal');
  const btnCancelTelegram = document.getElementById('btnCancelTelegram');
  const btnSetTgWebhook = document.getElementById('btnSetTgWebhook');
  const tgBotTokenInput = document.getElementById('tgBotTokenInput');
  const tgWebhookStatusResult = document.getElementById('tgWebhookStatusResult');

  if (btnOpenTelegramModal && modalTelegram) {
    btnOpenTelegramModal.addEventListener('click', () => {
      modalTelegram.classList.add('active');
    });
  }

  if (btnCloseTelegramModal && modalTelegram) btnCloseTelegramModal.addEventListener('click', () => modalTelegram.classList.remove('active'));
  if (btnCancelTelegram && modalTelegram) btnCancelTelegram.addEventListener('click', () => modalTelegram.classList.remove('active'));

  if (btnSetTgWebhook && tgBotTokenInput) {
    btnSetTgWebhook.addEventListener('click', async () => {
      const token = tgBotTokenInput.value.trim();
      if (!token) {
        alert('請輸入有效的 Telegram Bot Token');
        return;
      }

      btnSetTgWebhook.disabled = true;
      btnSetTgWebhook.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 正在綁定 Webhook...';

      try {
        const webhookApiUrl = `/api/telegram?action=set_webhook&token=${encodeURIComponent(token)}`;
        const res = await fetch(webhookApiUrl);
        const data = await res.json();

        if (tgWebhookStatusResult) {
          tgWebhookStatusResult.style.display = 'block';
          if (data.success && data.tgResponse && data.tgResponse.ok) {
            tgWebhookStatusResult.style.background = '#f0fdf4';
            tgWebhookStatusResult.style.borderColor = '#bbf7d0';
            tgWebhookStatusResult.style.color = '#166534';
            tgWebhookStatusResult.innerHTML = `<strong>✅ 成功綁定 Telegram Webhook！</strong><br>Webhook URL: <code>${data.webhookUrl}</code><br>現在您可以在 Telegram 搜尋您的機器人發送 <code>/start</code> 開始使用！`;
          } else {
            tgWebhookStatusResult.style.background = '#fef2f2';
            tgWebhookStatusResult.style.borderColor = '#fecaca';
            tgWebhookStatusResult.style.color = '#991b1b';
            tgWebhookStatusResult.innerHTML = `<strong>❌ 綁定失敗：</strong> ${JSON.stringify(data.tgResponse || data)}`;
          }
        }
      } catch (err) {
        if (tgWebhookStatusResult) {
          tgWebhookStatusResult.style.display = 'block';
          tgWebhookStatusResult.style.background = '#fef2f2';
          tgWebhookStatusResult.style.borderColor = '#fecaca';
          tgWebhookStatusResult.style.color = '#991b1b';
          tgWebhookStatusResult.innerHTML = `<strong>❌ 請求發生錯誤：</strong> ${err.message}`;
        }
      } finally {
        btnSetTgWebhook.disabled = false;
        btnSetTgWebhook.innerHTML = '<i class="fa-solid fa-link"></i> 一鍵綁定 Telegram Webhook';
      }
    });
  }

  // Telegram WebApp 自動偵測與使用者初始化
  if (window.Telegram && window.Telegram.WebApp) {
    try {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
      const tgUser = window.Telegram.WebApp.initDataUnsafe?.user;
      if (tgUser && tgUser.first_name) {
        console.log('Telegram WebApp user detected:', tgUser.first_name);
      }
    } catch (e) {
      console.warn('Telegram WebApp init warning:', e);
    }
  }
});

