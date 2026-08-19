/**
 * 公務車使用紀錄簽到系統 - 主程式邏輯 (app.js)
 * 包含：月曆渲染、數位簽名板、車輛管理、出還車里程計算、LocalStorage 儲存與 CSV 匯出
 */

// ==========================================================================
// 1. 初始化資料與狀態 Store
// ==========================================================================
const STORAGE_KEY_RECORDS = 'car_records_db_v1';
const STORAGE_KEY_VEHICLES = 'car_vehicles_db_v1';
const STORAGE_KEY_MAINTENANCE = 'car_maintenance_db_v1';
const STORAGE_KEY_FUEL_TX = 'car_fuel_transactions_db_v1';

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
  fuelTransactions: []
};

// 來自「公務車事件紀錄.xlsx」之歷史保養與事件數據 (含待處理任務)
const EXCEL_IMPORTED_MAINTENANCE_RECORDS = [
  { id: "maint-pending-1", date: "2026-08-14 10:00", category: "維修", title: "ABC-1234 前輪胎磨損估價中", content: "已請原廠開立估價單，待主管批示後安排進場更換", status: "PENDING" },
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

// 預設示範油卡儲值與加油紀錄
const EXCEL_IMPORTED_FUEL_TRANSACTIONS = [
  { id: 'ft-101', carId: 'v1', type: 'TOPUP', amount: 5000, date: '2026-08-01 09:00', balanceAfter: 5000, note: '總務處統一油卡預付儲值' },
  { id: 'ft-102', carId: 'v1', type: 'EXPENSE', amount: 1500, date: '2026-08-10 17:30', balanceAfter: 3500, note: '台灣中油西屯站 / 駕駛：林大為 / 發票：AB88921021' }
];

// 預設固定公務車輛
const DEFAULT_VEHICLES = [
  { id: 'v1', plate: 'ALZ-3759', model: '公務車 (Toyota Altis)', type: '轎車', mileage: 42850, status: 'AVAILABLE', fuelCardNo: '中油捷利卡 #8839-2041', fuelCardBalance: 3500 }
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
      plate: 'ABC-1234',
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
      passengers: '張課長、陳專員',
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
      passengers: '李經理',
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
      passengers: '王工程師',
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
}

function saveFuelTransactions() {
  localStorage.setItem(STORAGE_KEY_FUEL_TX, JSON.stringify(state.fuelTransactions));
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
}

function saveVehicles() {
  localStorage.setItem(STORAGE_KEY_VEHICLES, JSON.stringify(state.vehicles));
}

function saveMaintenance() {
  localStorage.setItem(STORAGE_KEY_MAINTENANCE, JSON.stringify(state.maintenanceRecords));
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
      if (r.date !== dateFormatted) return false;
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

      badgesHtml += `
        <div class="record-tag ${shiftClass}" data-record-id="${rec.id}">
          <div class="record-tag-header">
            <span class="record-tag-car">${rec.plate} (${shiftIcon} ${shiftName})</span>
          </div>
          ${rec.signature ? `<img src="${rec.signature}" class="record-signature-img" alt="手寫簽名">` : ''}
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

    const sigImage = rec.signature 
      ? `<img src="${rec.signature}" class="signature-thumb" style="max-height:36px; max-width:110px;" title="點擊查看" alt="簽名">`
      : `<span style="color: var(--text-light); font-size: 0.8rem;">未簽名</span>`;

    tr.innerHTML = `
      <td>
        <div style="font-weight: 700;">${rec.date}</div>
      </td>
      <td>${shiftBadge}</td>
      <td>${sigImage}</td>
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

    // 車輛卡片渲染
    let statusBadge = `<span class="vehicle-status-tag available">🟢 可正常出勤</span>`;
    if (v.status === 'MAINTENANCE') {
      statusBadge = `<span class="vehicle-status-tag" style="background:#fef3c7; color:#b45309;">🔧 定期保養中</span>`;
    } else if (v.status === 'OUT_OF_SERVICE') {
      statusBadge = `<span class="vehicle-status-tag" style="background:#fee2e2; color:#b91c1c;">🔴 停用中</span>`;
    }

    const card = document.createElement('div');
    card.className = 'vehicle-card';
    card.innerHTML = `
      <div class="vehicle-card-header">
        <span class="vehicle-plate">${v.plate}</span>
        ${statusBadge}
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
          <i class="fa-solid fa-credit-card" style="color: #059669;"></i> <strong>${v.fuelCardNo || '未綁定油卡'}</strong>
        </div>
        <div style="font-size: 0.95rem; font-weight: 700; color: #047857;">
          NT$ ${(v.fuelCardBalance || 0).toLocaleString()}
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-secondary btn-quick-fuel-tx" data-id="${v.id}" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; color: #059669; border-color: #a7f3d0; background: #ecfdf5;">
          <i class="fa-solid fa-gas-pump"></i> 儲值/加油
        </button>
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
}

// (D.2) 渲染油卡餘額與交易明細管理 (Fuel Card Management)
function renderFuelCardManagement() {
  const tbody = document.getElementById('fuelTransactionTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  // 1. 計算車隊總油卡餘額
  const totalBalance = state.vehicles.reduce((acc, v) => acc + (v.fuelCardBalance || 0), 0);
  const elTotalBal = document.getElementById('statTotalFuelBalance');
  if (elTotalBal) elTotalBal.innerText = `NT$ ${totalBalance.toLocaleString()}`;

  // 2. 計算綁定油卡張數
  const cardCount = state.vehicles.filter(v => v.fuelCardNo && v.fuelCardNo.trim() !== '').length;
  const elCardCount = document.getElementById('statFuelCardCount');
  if (elCardCount) elCardCount.innerText = `${cardCount} 張`;

  // 3. 計算本月加油總花費
  const now = new Date();
  const currentY = now.getFullYear();
  const currentM = now.getMonth();
  const monthExpenses = state.fuelTransactions.filter(tx => {
    if (tx.type !== 'EXPENSE') return false;
    const d = new Date(tx.date);
    return d.getFullYear() === currentY && d.getMonth() === currentM;
  }).reduce((acc, tx) => acc + (tx.amount || 0), 0);
  const elMonthExp = document.getElementById('statMonthFuelExpense');
  if (elMonthExp) elMonthExp.innerText = `NT$ ${monthExpenses.toLocaleString()}`;

  if (state.fuelTransactions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          <i class="fa-solid fa-receipt" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--text-light); display: block;"></i>
          尚無油卡加值或加油扣款異動紀錄
        </td>
      </tr>
    `;
    return;
  }

  // 排序：最新交易在最上面
  const sortedTx = [...state.fuelTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  sortedTx.forEach(tx => {
    const vehicle = state.vehicles.find(v => v.id === tx.carId);
    const carInfo = vehicle ? `${vehicle.plate} (${vehicle.model})<br><span style="font-size:0.75rem; color:var(--text-muted);">${vehicle.fuelCardNo || '無卡號'}</span>` : '未知車輛';
    
    const isTopUp = tx.type === 'TOPUP';
    const typeBadge = isTopUp 
      ? `<span style="background:#d1fae5; color:#059669; padding:0.2rem 0.55rem; border-radius:4px; font-size:0.8rem; font-weight:700;">🟢 油卡儲值</span>`
      : `<span style="background:#fee2e2; color:#dc2626; padding:0.2rem 0.55rem; border-radius:4px; font-size:0.8rem; font-weight:700;">⛽ 加油扣款</span>`;

    const amtStr = isTopUp ? `+ NT$ ${tx.amount.toLocaleString()}` : `- NT$ ${tx.amount.toLocaleString()}`;
    const amtColor = isTopUp ? '#059669' : '#dc2626';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div style="font-weight:700;">${tx.date}</div></td>
      <td>${carInfo}</td>
      <td>${typeBadge}</td>
      <td><span style="font-weight:700; color:${amtColor};">${amtStr}</span></td>
      <td><strong>NT$ ${(tx.balanceAfter || 0).toLocaleString()}</strong></td>
      <td><div style="font-size:0.85rem; color:#334155;">${tx.note || '無'}</div></td>
      <td style="text-align: right;">
        <button class="btn btn-icon btn-delete-fuel-tx" data-id="${tx.id}" title="刪除此筆交易">
          <i class="fa-solid fa-trash" style="color: var(--danger-color);"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 刷新全系統介面
function refreshApp() {
  updateMetrics();
  renderCalendar();
  renderTable();
  renderVehicles();
  renderFuelCardManagement();
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
    this.ctx = this.canvas.getContext('2d');
    this.isDrawing = false;
    this.strokeColor = '#0f172a';
    this.lineWidth = 3;
    this.hasDrawn = false;

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = this.strokeColor;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  setStrokeColor(color) {
    this.strokeColor = color;
    this.ctx.strokeStyle = color;
  }

  clear() {
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasDrawn = false;
  }

  getPos(e) {
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

  // 2. 初始化簽名 Engine
  sigEngine = new SignaturePadEngine('signatureCanvas');
  const embeddedSigEngine = new SignaturePadEngine('embeddedSignatureCanvas');

  // 3. 首次全系統渲染
  refreshApp();

  // 清除內嵌簽名板按鈕
  document.getElementById('btnClearEmbeddedSig').addEventListener('click', () => {
    embeddedSigEngine.clear();
  });

  // ------------------------------------------------------------------------
  // A. 分頁切換 (Tabs)
  // ------------------------------------------------------------------------
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-target');
      document.getElementById(targetId).classList.remove('hidden');
      state.activeView = targetId;
    });
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

  const openRecordModal = (presetDate = '') => {
    formRecord.reset();
    document.getElementById('recordId').value = '';

    const signDate = presetDate || new Date().toISOString().split('T')[0];
    document.getElementById('formDate').value = signDate;
    document.getElementById('displaySignDate').innerHTML = `<i class="fa-regular fa-calendar"></i> 簽到日期：${signDate}`;
    
    // 預設重置班別為「早班」
    document.getElementById('formShift').value = '早班';
    document.querySelectorAll('.shift-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-shift') === '早班');
    });

    // 預設車輛為 v1
    document.getElementById('formCarId').value = state.vehicles[0] ? state.vehicles[0].id : 'v1';

    embeddedSigEngine.clear();
    modalRecord.classList.add('active');
  };

  document.getElementById('btnOpenNewRecord').addEventListener('click', () => openRecordModal());

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

  // 提交簽到表單 (包含早/晚班與備註)
  formRecord.addEventListener('submit', (e) => {
    e.preventDefault();

    const carId = document.getElementById('formCarId').value;
    const vehicle = state.vehicles.find(v => v.id === carId);

    const sigData = embeddedSigEngine.toDataURL();
    if (!sigData) {
      alert('請先在手寫區域進行電子簽名！');
      return;
    }

    const noteInput = document.getElementById('formNoteQuick');
    const noteText = noteInput ? noteInput.value.trim() : '';
    const shiftVal = document.getElementById('formShift').value || '早班';

    const newRecord = {
      id: 'rec-' + Date.now(),
      carId: carId,
      plate: vehicle ? vehicle.plate : 'ABC-1234',
      date: document.getElementById('formDate').value,
      shift: shiftVal,
      driver: '已簽名使用人',
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
      signature: sigData,
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
      <span><i class="fa-solid fa-car-side" style="color: var(--primary-color);"></i> 公務車 (${rec.plate || 'ABC-1234'})</span>
      <span style="color: var(--primary-color);">${rec.date} ${shiftIcon} ${shiftText}</span>
    `;

    document.getElementById('detailSignatureImg').src = rec.signature || '';
    document.getElementById('detailNoteBox').innerText = rec.notes || rec.destination || '無特別備註';

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

  const btnOpenVeh = document.getElementById('btnOpenAddVehicle');
  if (btnOpenVeh && formVehicle) {
    btnOpenVeh.addEventListener('click', () => {
      formVehicle.reset();
      document.getElementById('vehicleEditId').value = '';
      document.getElementById('modalVehicleTitle').innerText = '新增公務車資料';
      modalVehicle.classList.add('active');
    });
  }

  const btnCloseVeh = document.getElementById('btnCloseVehicleModal');
  if (btnCloseVeh && modalVehicle) btnCloseVeh.addEventListener('click', () => modalVehicle.classList.remove('active'));

  const btnCancelVeh = document.getElementById('btnCancelVehicle');
  if (btnCancelVeh && modalVehicle) btnCancelVeh.addEventListener('click', () => modalVehicle.classList.remove('active'));

  formVehicle.addEventListener('submit', (e) => {
    e.preventDefault();

    const editId = document.getElementById('vehicleEditId').value;
    const plate = document.getElementById('vehiclePlate').value.trim().toUpperCase();
    const model = document.getElementById('vehicleModel').value.trim();
    const type = document.getElementById('vehicleType').value;
    const mileage = parseInt(document.getElementById('vehicleCurrentMileage').value) || 0;
    const fuelCardNo = document.getElementById('vehicleFuelCardNo').value.trim();
    const fuelCardBalance = parseInt(document.getElementById('vehicleFuelCardBalance').value) || 0;
    const status = document.getElementById('vehicleStatus').value;

    if (editId) {
      const v = state.vehicles.find(item => item.id === editId);
      if (v) {
        v.plate = plate;
        v.model = model;
        v.type = type;
        v.mileage = mileage;
        v.fuelCardNo = fuelCardNo;
        v.fuelCardBalance = fuelCardBalance;
        v.status = status;
      }
    } else {
      const newV = {
        id: 'v-' + Date.now(),
        plate: plate,
        model: model,
        type: type,
        mileage: mileage,
        fuelCardNo: fuelCardNo,
        fuelCardBalance: fuelCardBalance,
        status: status
      };
      state.vehicles.push(newV);
    }

    saveVehicles();
    refreshApp();
    modalVehicle.classList.remove('active');
  });

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
        const elCardNo = document.getElementById('vehicleFuelCardNo');
        if (elCardNo) elCardNo.value = v.fuelCardNo || '';
        const elCardBal = document.getElementById('vehicleFuelCardBalance');
        if (elCardBal) elCardBal.value = v.fuelCardBalance || 0;
        document.getElementById('vehicleStatus').value = v.status;
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
  // F.2 油卡與加油交易紀錄 Modal 控制
  // ------------------------------------------------------------------------
  const modalFuelTx = document.getElementById('modalFuelTx');
  const formFuelTx = document.getElementById('formFuelTx');

  const openFuelTxModal = (txId = '', presetCarId = '') => {
    if (!formFuelTx || !modalFuelTx) return;
    formFuelTx.reset();
    document.getElementById('fuelTxEditId').value = '';

    // 填入車輛選單
    const selectCar = document.getElementById('fuelTxCarId');
    selectCar.innerHTML = '';
    state.vehicles.forEach(v => {
      selectCar.innerHTML += `<option value="${v.id}" ${presetCarId === v.id ? 'selected' : ''}>${v.plate} - ${v.model} (${v.fuelCardNo || '未綁卡'})</option>`;
    });

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

  // 車輛卡片上的快捷「儲值/加油」按鈕
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-quick-fuel-tx');
    if (btn) {
      const carId = btn.getAttribute('data-id');
      openFuelTxModal('', carId);
    }
  });

  // 提交加油/儲值紀錄表單
  if (formFuelTx) {
    formFuelTx.addEventListener('submit', (e) => {
      e.preventDefault();

      const carId = document.getElementById('fuelTxCarId').value;
      const type = document.getElementById('fuelTxType').value;
      const amount = parseInt(document.getElementById('fuelTxAmount').value) || 0;
      const rawDate = document.getElementById('fuelTxDate').value;
      const date = rawDate.replace('T', ' ');
      const note = document.getElementById('fuelTxNote').value.trim();

      const vehicle = state.vehicles.find(v => v.id === carId);
      if (!vehicle) {
        alert('請選擇有效車輛');
        return;
      }

      let currentBal = vehicle.fuelCardBalance || 0;
      let newBalance = currentBal;
      if (type === 'TOPUP') {
        newBalance = currentBal + amount;
      } else {
        newBalance = currentBal - amount;
      }
      vehicle.fuelCardBalance = newBalance;

      const newTx = {
        id: 'ft-' + Date.now(),
        carId: carId,
        type: type,
        amount: amount,
        date: date,
        balanceAfter: newBalance,
        note: note
      };

      state.fuelTransactions.unshift(newTx);

      saveVehicles();
      saveFuelTransactions();
      refreshApp();
      modalFuelTx.classList.remove('active');
    });
  }

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
  // G. 報表 CSV 匯出與整月日曆列印
  // ------------------------------------------------------------------------
  document.getElementById('btnExportCsv').addEventListener('click', () => {
    if (state.records.length === 0) {
      alert('目前無任何紀錄可匯出');
      return;
    }

    // CSV Header (UTF-8 BOM 加入預防 Excel 簡繁亂碼)
    let csvContent = "\uFEFF單號,用車日期,車牌號碼,駕駛人,部門,目的地,事由,時段,出發里程(km),歸還里程(km),累積行駛(km),狀態,油電狀態,同行人員\n";

    state.records.forEach(r => {
      const row = [
        `"${r.id}"`,
        `"${r.date}"`,
        `"${r.plate}"`,
        `"${r.driver}"`,
        `"${r.department}"`,
        `"${r.destination.replace(/"/g, '""')}"`,
        `"${(r.purpose || '').replace(/"/g, '""')}"`,
        `"${r.startTime || ''}-${r.endTime || ''}"`,
        `"${r.startMileage || 0}"`,
        `"${r.endMileage || ''}"`,
        `"${r.totalKm || 0}"`,
        `"${r.status === 'COMPLETED' ? '已還車簽退' : (r.status === 'ACTIVE' ? '使用出勤中' : '預約中')}"`,
        `"${r.fuelStatus || ''}"`,
        `"${(r.passengers || '').replace(/"/g, '""')}"`
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
  });

  // 一鍵列印
  document.getElementById('btnPrintCalendar').addEventListener('click', () => {
    window.print();
  });
});
