// Vercel Serverless Function: Telegram Bot Webhook API (/api/telegram.js)

const DEFAULT_STATE = {
  vehicles: [
    {
      id: 'v1',
      plate: 'ALZ-3759',
      type: '轎車',
      model: 'Toyota Altis',
      mileage: 42850,
      maintMileage: 50000,
      fuelCardId: 'fc-1',
      fuelCardNo: '中油捷利卡 #8839-2041',
      fuelCardBalance: 2900,
      status: 'AVAILABLE'
    }
  ],
  fuelCards: [
    {
      id: 'fc-1',
      cardNo: '中油捷利卡 #8839-2041',
      boundCarId: 'v1',
      balance: 2900,
      note: '總務課經辦保管'
    }
  ],
  personnel: [
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
  ],
  records: [],
  fuelTransactions: [],
  maintenanceRecords: []
};

// 暫存進行中的對話步驟草稿 (In-memory draft state for Telegram callbacks)
const tempDrafts = {};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = req.query.token || process.env.TELEGRAM_BOT_TOKEN;

  // GET: 用於測試 Webhook 或設定 Webhook / 註冊指令選單
  if (req.method === 'GET') {
    const { action, url } = req.query;

    if (action === 'set_webhook' && token) {
      const webhookUrl = url || `https://${req.headers.host}/api/telegram?token=${token}`;
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
        const data = await tgRes.json();
        await setBotCommands(token);
        return res.status(200).json({ success: true, tgResponse: data, webhookUrl });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    if (action === 'set_commands' && token) {
      const success = await setBotCommands(token);
      return res.status(200).json({ success, message: 'Bot commands updated.' });
    }

    return res.status(200).json({
      status: 'active',
      message: 'Telegram Bot Webhook Endpoint is running.',
      usage: 'Set webhook via GET /api/telegram?action=set_webhook&token=YOUR_BOT_TOKEN'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!token) {
    return res.status(200).json({ status: 'ignored', message: 'No Bot Token configured' });
  }

  const update = req.body;
  if (!update) {
    return res.status(200).json({ status: 'no_body' });
  }

  const host = req.headers.host || 'car-use-record.vercel.app';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  try {
    await processTelegramUpdate(update, token, baseUrl);
  } catch (err) {
    console.error('Error processing Telegram update:', err);
  }

  return res.status(200).json({ ok: true });
}

// 註冊 Telegram 官方 Bot 指令選單 (Set Bot Commands for Telegram UI / Menu button)
async function setBotCommands(token) {
  const url = `https://api.telegram.org/bot${token}/setMyCommands`;
  const commands = [
    { command: 'menu', description: '📋 主選單（開啟功能選單按鈕）' },
    { command: 'signin', description: '🚗 出車簽到 / 歸還（逐步引導）' },
    { command: 'fuel', description: '⛽ 新增加油扣款（逐步引導，可拍照佐證）' },
    { command: 'out', description: '🚗 出車簽到 / 歸還（快捷入口）' }
  ];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands })
    });
    const data = await res.json();
    return data.ok;
  } catch (err) {
    console.error('Failed to set Telegram Bot commands:', err);
  }
  return false;
}

// 輔助：發送 Telegram 訊息
async function sendMessage(token, chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// 輔助：編輯 Telegram 訊息內容與按鈕 (用於複選動態開關切換)
async function editMessageText(token, chatId, messageId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${token}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML'
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

// 輔助：回應 Callback Query
async function answerCallbackQuery(token, callbackQueryId, text = '') {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text })
  });
}

// 輔助：取得 Telegram 上傳照片實體 URL
async function getTelegramFileUrl(token, fileId) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.result && data.result.file_path) {
        return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
      }
    }
  } catch (e) {
    console.error('Error fetching Telegram file path:', e);
  }
  return null;
}

// 讀取當前雲端同步 Data (若為 null 則帶入預設資料)
async function getCloudState(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/sync`);
    if (res.ok) {
      const data = await res.json();
      let st = data.state;
      if (!st) st = DEFAULT_STATE;
      if (!st.vehicles || st.vehicles.length === 0) st.vehicles = DEFAULT_STATE.vehicles;
      if (!st.fuelCards || st.fuelCards.length === 0) st.fuelCards = DEFAULT_STATE.fuelCards;
      if (!st.personnel || st.personnel.length === 0) st.personnel = DEFAULT_STATE.personnel;
      if (!st.records) st.records = [];
      if (!st.fuelTransactions) st.fuelTransactions = [];
      return st;
    }
  } catch (e) {
    console.error('Failed to fetch cloud state in telegram bot:', e);
  }
  return DEFAULT_STATE;
}

// 儲存更新後的雲端 Data
async function saveCloudState(baseUrl, state) {
  try {
    await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, timestamp: Date.now() })
    });
  } catch (e) {
    console.error('Failed to save cloud state in telegram bot:', e);
  }
}

// 駕駛複選鍵盤構建
function buildDriverKeyboard(state, selectedDrivers) {
  const pButtons = [];
  for (let i = 0; i < state.personnel.length; i += 3) {
    const row = state.personnel.slice(i, i + 3).map(p => {
      const isSelected = selectedDrivers.includes(p.name);
      return {
        text: isSelected ? `✅ ${p.name}` : `👤 ${p.name}`,
        callback_data: `tg_drv_${p.name}`
      };
    });
    pButtons.push(row);
  }

  const countStr = selectedDrivers.length > 0 ? ` (已選 ${selectedDrivers.length} 人)` : ' (請點選同仁)';
  pButtons.push([{ text: `➡️ 選好了，下一步${countStr}`, callback_data: 'sn_confirm_drivers' }]);
  pButtons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

  return { inline_keyboard: pButtons };
}

function buildDriverText(carPlate, selectedDrivers) {
  const driversDisplay = selectedDrivers.length > 0 ? selectedDrivers.join(', ') : '尚未選擇 (可點選多位同仁)';
  return `🚗 選擇車輛：<b>${carPlate}</b>\n已選駕駛：<b>${driversDisplay}</b>\n\n<b>【步驟 2/4】請點選出勤駕駛（支援複選）：</b>\n<i>（可點選多位駕駛同仁，勾選完畢請按下方「➡️ 選好了，下一步」）</i>`;
}

// 乘客複選鍵盤構建
function buildPassengerKeyboard(state, selectedDrivers, selectedPassengers) {
  const psgButtons = [];

  const otherPersonnel = state.personnel.filter(p => !selectedDrivers.includes(p.name));
  for (let i = 0; i < otherPersonnel.length; i += 3) {
    const row = otherPersonnel.slice(i, i + 3).map(p => {
      const isSelected = selectedPassengers.includes(p.name);
      return {
        text: isSelected ? `✅ ${p.name}` : `👥 ${p.name}`,
        callback_data: `tg_psg_${p.name}`
      };
    });
    psgButtons.push(row);
  }

  psgButtons.push([{ text: '🚫 無同行乘客 (單人出車)', callback_data: 'sn_psg_none' }]);
  const countStr = selectedPassengers.length > 0 ? ` (已選 ${selectedPassengers.length} 人)` : '';
  psgButtons.push([{ text: `➡️ 選好了，下一步${countStr}`, callback_data: 'sn_confirm_passengers' }]);
  psgButtons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

  return { inline_keyboard: psgButtons };
}

function buildPassengerText(carPlate, selectedDrivers, selectedPassengers) {
  const driversDisplay = selectedDrivers.length > 0 ? selectedDrivers.join(', ') : '無';
  const psgDisplay = selectedPassengers.length > 0 ? selectedPassengers.join(', ') : '無乘客 (可點選多位)';
  return `🚗 車輛：<b>${carPlate}</b>\n👤 駕駛：<b>${driversDisplay}</b>\n已選乘客：<b>${psgDisplay}</b>\n\n<b>【步驟 3/4】請點選同行乘客（支援複選）：</b>\n<i>（可點選多位乘客，勾選完畢請按「➡️ 選好了，下一步」或「🚫 無同行乘客」）</i>`;
}

// 完成加油交易寫入與儲存
async function completeFuelTransaction(token, chatId, draft, photos, baseUrl, state) {
  const cardId = draft.cardId || (state.fuelCards[0] ? state.fuelCards[0].id : 'fc-1');
  const amount = draft.amount || 1000;
  const mileage = draft.mileage || 42850;
  const person = draft.person || '經辦同仁';
  const note = draft.note || '無備註';

  const fuelCard = state.fuelCards.find(c => c.id === cardId) || state.fuelCards[0];
  const vehicle = state.vehicles.find(v => v.id === (fuelCard ? fuelCard.boundCarId : '')) || state.vehicles[0];

  const balanceAfter = (fuelCard ? (fuelCard.balance || 0) : 0) - amount;
  if (fuelCard) fuelCard.balance = balanceAfter;

  if (fuelCard && fuelCard.boundCarId && state.vehicles) {
    const boundV = state.vehicles.find(v => v.id === fuelCard.boundCarId);
    if (boundV) boundV.fuelCardBalance = balanceAfter;
  }

  if (vehicle && mileage > (vehicle.mileage || 0)) {
    vehicle.mileage = mileage;
  }

  const now = new Date();
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

  const newTx = {
    id: 'ft-' + Date.now(),
    cardId: fuelCard ? fuelCard.id : 'fc-1',
    cardNo: fuelCard ? fuelCard.cardNo : '油卡',
    carId: vehicle ? vehicle.id : 'v1',
    type: 'EXPENSE',
    amount: amount,
    mileage: mileage,
    balanceAfter: balanceAfter,
    person: person,
    date: dateStr,
    note: note,
    photos: photos || []
  };

  state.fuelTransactions.unshift(newTx);
  await saveCloudState(baseUrl, state);

  delete tempDrafts[chatId];

  const photoText = (photos && photos.length > 0) ? `📸 <b>佐證照片：</b> 已成功上傳 ${photos.length} 張照片` : '📸 <b>佐證照片：</b> 未上傳';
  const replyText = `⛽ <b>加油扣款已成功登錄！</b>\n\n💳 <b>使用油卡：</b> ${fuelCard ? fuelCard.cardNo : '油卡'}\n💰 <b>扣款金額：</b> - NT$ ${amount.toLocaleString()}\n💵 <b>扣款後餘額：</b> NT$ ${balanceAfter.toLocaleString()}\n📏 <b>當前里程：</b> ${mileage.toLocaleString()} km\n👤 <b>經辦同仁：</b> ${person}\n📝 <b>備註：</b> ${note}\n${photoText}\n⏱️ <b>時間：</b> ${dateStr}`;

  return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
}

// 處理 Telegram 訊息邏輯
async function processTelegramUpdate(update, token, baseUrl) {
  // 自動註冊 Telegram 官方 Command 列表
  setBotCommands(token).catch(() => {});

  // 1. 處理 Inline Button 點擊事件 (Callback Query)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data = cb.data;

    await answerCallbackQuery(token, cb.id);

    const state = await getCloudState(baseUrl);

    if (data === 'cmd_menu') {
      delete tempDrafts[chatId];
      return sendMainMenu(token, chatId, baseUrl);
    }

    // C. 互動式出車簽到流程
    // 步驟 1/4: 選擇車輛
    if (data === 'cmd_signin') {
      let text = '🚗 <b>【步驟 1/4】請點選您要簽到的公務車輛：</b>';
      const buttons = state.vehicles.map(v => ([{ text: `🚗 ${v.plate} (${v.model})`, callback_data: `sn_car_${v.id}` }]));
      buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: buttons });
    }

    // 步驟 2/4: 開始選擇駕駛 (進入駕駛複選)
    if (data.startsWith('sn_car_')) {
      const carId = data.replace('sn_car_', '');
      const vehicle = state.vehicles.find(v => v.id === carId);

      tempDrafts[chatId] = {
        carId,
        carPlate: vehicle ? vehicle.plate : '公務車',
        mileage: vehicle ? (vehicle.mileage || 42850) : 42850,
        drivers: [],
        passengers: []
      };

      const text = buildDriverText(tempDrafts[chatId].carPlate, tempDrafts[chatId].drivers);
      const keyboard = buildDriverKeyboard(state, tempDrafts[chatId].drivers);

      return sendMessage(token, chatId, text, keyboard);
    }

    // 駕駛複選按鈕 Toggle
    if (data.startsWith('tg_drv_')) {
      const name = data.replace('tg_drv_', '');
      if (!tempDrafts[chatId]) tempDrafts[chatId] = { drivers: [], passengers: [] };
      if (!tempDrafts[chatId].drivers) tempDrafts[chatId].drivers = [];

      const idx = tempDrafts[chatId].drivers.indexOf(name);
      if (idx >= 0) {
        tempDrafts[chatId].drivers.splice(idx, 1);
      } else {
        tempDrafts[chatId].drivers.push(name);
      }

      const text = buildDriverText(tempDrafts[chatId].carPlate || '公務車', tempDrafts[chatId].drivers);
      const keyboard = buildDriverKeyboard(state, tempDrafts[chatId].drivers);

      return editMessageText(token, chatId, messageId, text, keyboard);
    }

    // 確認駕駛選擇 -> 進入步驟 3/4 乘客複選
    if (data === 'sn_confirm_drivers') {
      const draft = tempDrafts[chatId] || {};
      const drivers = draft.drivers || [];

      if (drivers.length === 0) {
        return answerCallbackQuery(token, cb.id, '⚠️ 請至少點選一位駕駛同仁！');
      }

      const text = buildPassengerText(draft.carPlate || '公務車', drivers, draft.passengers || []);
      const keyboard = buildPassengerKeyboard(state, drivers, draft.passengers || []);

      return sendMessage(token, chatId, text, keyboard);
    }

    // 乘客複選按鈕 Toggle
    if (data.startsWith('tg_psg_')) {
      const name = data.replace('tg_psg_', '');
      if (!tempDrafts[chatId]) tempDrafts[chatId] = { drivers: [], passengers: [] };
      if (!tempDrafts[chatId].passengers) tempDrafts[chatId].passengers = [];

      const idx = tempDrafts[chatId].passengers.indexOf(name);
      if (idx >= 0) {
        tempDrafts[chatId].passengers.splice(idx, 1);
      } else {
        tempDrafts[chatId].passengers.push(name);
      }

      const text = buildPassengerText(tempDrafts[chatId].carPlate || '公務車', tempDrafts[chatId].drivers || [], tempDrafts[chatId].passengers);
      const keyboard = buildPassengerKeyboard(state, tempDrafts[chatId].drivers || [], tempDrafts[chatId].passengers);

      return editMessageText(token, chatId, messageId, text, keyboard);
    }

    // 點擊「無同行乘客」 -> 清空乘客並進入步驟 4/4 備註
    if (data === 'sn_psg_none') {
      if (!tempDrafts[chatId]) tempDrafts[chatId] = { drivers: [], passengers: [] };
      tempDrafts[chatId].passengers = [];
      tempDrafts[chatId].step = 'awaiting_note';

      const driversDisplay = tempDrafts[chatId].drivers.length > 0 ? tempDrafts[chatId].drivers.join(', ') : '同仁';
      let text = `🚗 車輛：<b>${tempDrafts[chatId].carPlate || '公務車'}</b>\n👤 駕駛：<b>${driversDisplay}</b>\n👥 乘客：<b>無乘客 (單人出車)</b>\n\n<b>【步驟 4/4】請點選「無備註」或直接在此對話框輸入備註內容：</b>\n<i>（亦可直接在此對話框輸入自行輸入備註文字傳送，例如：台中客戶拜訪）</i>`;

      const noteButtons = [
        [{ text: '📝 無備註 (點擊直接完成簽到)', callback_data: 'sn_note_無備註' }],
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: noteButtons });
    }

    // 確認乘客選擇 -> 進入步驟 4/4 備註
    if (data === 'sn_confirm_passengers') {
      if (!tempDrafts[chatId]) tempDrafts[chatId] = { drivers: [], passengers: [] };
      tempDrafts[chatId].step = 'awaiting_note';

      const driversDisplay = tempDrafts[chatId].drivers.length > 0 ? tempDrafts[chatId].drivers.join(', ') : '同仁';
      const psgDisplay = tempDrafts[chatId].passengers.length > 0 ? tempDrafts[chatId].passengers.join(', ') : '無乘客';
      let text = `🚗 車輛：<b>${tempDrafts[chatId].carPlate || '公務車'}</b>\n👤 駕駛：<b>${driversDisplay}</b>\n👥 乘客：<b>${psgDisplay}</b>\n\n<b>【步驟 4/4】請點選「無備註」或直接在此對話框輸入備註內容：</b>\n<i>（亦可直接在此對話框輸入自行輸入備註文字傳送，例如：台中客戶拜訪）</i>`;

      const noteButtons = [
        [{ text: '📝 無備註 (點擊直接完成簽到)', callback_data: 'sn_note_無備註' }],
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: noteButtons });
    }

    // 選擇備註 -> 完成簽到紀錄！
    if (data.startsWith('sn_note_')) {
      const rawNote = data.replace('sn_note_', '');
      const draft = tempDrafts[chatId] || {};
      const carId = draft.carId || 'v1';
      const carPlate = draft.carPlate || 'ALZ-3759';
      const drivers = draft.drivers && draft.drivers.length > 0 ? draft.drivers : ['同仁'];
      const passengers = draft.passengers || [];
      const mileage = draft.mileage || 42850;
      const note = (rawNote === '無備註') ? '' : rawNote;

      const now = new Date();
      const dateYMD = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      const dateStr = dateYMD + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

      const newRecord = {
        id: 'rec-' + Date.now(),
        carId: carId,
        plate: carPlate,
        date: dateYMD,
        shift: '早班',
        driver: drivers,
        passengers: passengers,
        purpose: note || '公務外勤',
        destination: '',
        startMileage: mileage,
        endMileage: null,
        startDate: dateStr,
        returnDate: '',
        status: 'ACTIVE',
        note: note || '無備註',
        notes: note || '無備註'
      };

      state.records.unshift(newRecord);
      await saveCloudState(baseUrl, state);

      delete tempDrafts[chatId];

      const drvStr = drivers.join(', ');
      const psgStr = passengers.length > 0 ? passengers.join(', ') : '無乘客 (單人出車)';
      const noteStr = note ? note : '無備註';
      const replyText = `✅ <b>出車簽到完成！</b>\n\n🚗 <b>車輛：</b> ${carPlate}\n👤 <b>駕駛：</b> ${drvStr}\n👥 <b>同行乘客：</b> ${psgStr}\n📝 <b>備註：</b> ${noteStr}\n📏 <b>起始里程：</b> ${mileage.toLocaleString()} km\n⏱️ <b>簽到時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }

    // D. 互動式加油扣款流程 (Steps 1 ~ 6)
    // 步驟 1/6: 選擇實體油卡
    if (data === 'cmd_fuel') {
      let text = '⛽ <b>【步驟 1/6】請點選您要使用的實體油卡：</b>';
      const buttons = state.fuelCards.map(c => ([{ text: `💳 ${c.cardNo} (餘額 NT$ ${(c.balance || 0).toLocaleString()})`, callback_data: `fl_card_${c.id}` }]));
      buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: buttons });
    }

    // 步驟 2/6: 選擇/輸入加油金額
    if (data.startsWith('fl_card_')) {
      const cardId = data.replace('fl_card_', '');
      const card = state.fuelCards.find(c => c.id === cardId);

      tempDrafts[chatId] = {
        cardId,
        cardNo: card ? card.cardNo : '油卡',
        balance: card ? (card.balance || 0) : 0,
        boundCarId: card ? card.boundCarId : '',
        step: 'awaiting_fuel_amount'
      };

      let text = `💳 選擇油卡：<b>${tempDrafts[chatId].cardNo}</b> (當前餘額: NT$ ${tempDrafts[chatId].balance.toLocaleString()})\n\n<b>【步驟 2/6】請直接在對話框輸入加油金額：</b>\n<i>（例如：直接輸入 1500 或 1230 傳送）</i>\n\n<i>或可點選熱門金額：</i>`;
      const amtButtons = [
        [
          { text: '⛽ $500', callback_data: 'fl_amt_500' },
          { text: '⛽ $1,000', callback_data: 'fl_amt_1000' }
        ],
        [
          { text: '⛽ $1,500', callback_data: 'fl_amt_2000' },
          { text: '⛽ $2,000', callback_data: 'fl_amt_2000' }
        ],
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: amtButtons });
    }

    // 步驟 3/6: 加油選金額 -> 輸入當前儀表板里程
    if (data.startsWith('fl_amt_')) {
      const amt = parseInt(data.replace('fl_amt_', '')) || 1000;
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].amount = amt;
      tempDrafts[chatId].step = 'awaiting_fuel_mileage';

      let text = `💳 油卡：<b>${tempDrafts[chatId].cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${amt.toLocaleString()}</b>\n\n<b>【步驟 3/6】請直接在對話框輸入當前儀表板里程數 (km)：</b>\n<i>（例如：直接輸入 42850 傳送）</i>`;
      const mButtons = [
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: mButtons });
    }

    // 步驟 4/6: 加油選里程 -> 選擇經辦同仁
    if (data.startsWith('fl_mileage_')) {
      const mil = parseInt(data.replace('fl_mileage_', '')) || 42850;
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].mileage = mil;
      tempDrafts[chatId].step = 'awaiting_fuel_person';

      let text = `💳 油卡：<b>${tempDrafts[chatId].cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${(tempDrafts[chatId].amount || 0).toLocaleString()}</b>\n📏 里程：<b>${mil.toLocaleString()} km</b>\n\n<b>【步驟 4/6】請點選加油經辦同仁：</b>`;
      const pButtons = [];
      for (let i = 0; i < state.personnel.length; i += 3) {
        const row = state.personnel.slice(i, i + 3).map(p => ({
          text: `👤 ${p.name}`,
          callback_data: `fl_person_${p.name}`
        }));
        pButtons.push(row);
      }
      pButtons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: pButtons });
    }

    // 步驟 5/6: 加油選同仁 -> 輸入備註說明
    if (data.startsWith('fl_person_')) {
      const person = data.replace('fl_person_', '');
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].person = person;
      tempDrafts[chatId].step = 'awaiting_fuel_note';

      let text = `💳 油卡：<b>${tempDrafts[chatId].cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${(tempDrafts[chatId].amount || 0).toLocaleString()}</b>\n📏 里程：<b>${(tempDrafts[chatId].mileage || 0).toLocaleString()} km</b>\n👤 同仁：<b>${person}</b>\n\n<b>【步驟 5/6】請點選「無備註」或直接在對話框輸入加油備註：</b>\n<i>（例如：直接輸入 西屯路中油站發送）</i>`;
      const nButtons = [
        [{ text: '📝 無備註 (進入下一步照片佐證)', callback_data: 'fl_note_無備註' }],
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: nButtons });
    }

    // 步驟 6/6: 選擇備註 -> 拍攝/上傳照片佐證
    if (data.startsWith('fl_note_')) {
      const rawNote = data.replace('fl_note_', '');
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].note = (rawNote === '無備註') ? '無備註' : rawNote;
      tempDrafts[chatId].step = 'awaiting_fuel_photo';

      const draft = tempDrafts[chatId];
      let text = `💳 油卡：<b>${draft.cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${(draft.amount || 0).toLocaleString()}</b>\n📏 里程：<b>${(draft.mileage || 0).toLocaleString()} km</b>\n👤 同仁：<b>${draft.person || '同仁'}</b>\n📝 備註：<b>${draft.note}</b>\n\n<b>【步驟 6/6】請直接在對話框拍攝傳送照片佐證 (儀表板或發票)：</b>\n<i>（可直接在此傳送照片，或點選下方按鈕直接完成）</i>`;
      const pButtons = [
        [{ text: '✅ 無照片，直接完成加油登錄', callback_data: 'fl_complete_nophoto' }],
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: pButtons });
    }

    // 完成加油登錄 (無照片)
    if (data === 'fl_complete_nophoto') {
      const draft = tempDrafts[chatId] || {};
      return completeFuelTransaction(token, chatId, draft, [], baseUrl, state);
    }
  }

  // 2. 處理文字與照片訊息指令 (Message)
  if (update.message) {
    const chatId = update.message.chat.id;

    const state = await getCloudState(baseUrl);

    // 處理 Telegram 直接拍照/傳送照片訊息 (步驟 6/6 照片佐證)
    if (update.message.photo && tempDrafts[chatId] && tempDrafts[chatId].step === 'awaiting_fuel_photo') {
      const photosArr = update.message.photo;
      const largestPhoto = photosArr[photosArr.length - 1];
      const fileUrl = await getTelegramFileUrl(token, largestPhoto.file_id);

      const photoList = fileUrl ? [fileUrl] : [];
      const draft = tempDrafts[chatId];
      return completeFuelTransaction(token, chatId, draft, photoList, baseUrl, state);
    }

    // 處理文字訊息指令 (Commands / Inputs / Permanent Keyboard)
    if (update.message.text) {
      const msgText = update.message.text.trim();

      // 指令選單觸發 /start, /menu, /help, 選單
      if (msgText === '/start' || msgText === '/menu' || msgText === '/help' || msgText === '選單' || msgText === '功能') {
        delete tempDrafts[chatId];
        return sendMainMenu(token, chatId, baseUrl);
      }

      // 指令或按鈕觸發 出車簽到 (/signin, /out, 🚗 出車簽到 / 歸還, 出車簽到) -> 開啟【步驟 1/4】
      if (msgText === '/signin' || msgText === '/out' || msgText.includes('出車簽到') || msgText.includes('簽到')) {
        delete tempDrafts[chatId];
        let text = '🚗 <b>【步驟 1/4】請點選您要簽到的公務車輛：</b>';
        const buttons = state.vehicles.map(v => ([{ text: `🚗 ${v.plate} (${v.model})`, callback_data: `sn_car_${v.id}` }]));
        buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

        return sendMessage(token, chatId, text, { inline_keyboard: buttons });
      }

      // 指令或按鈕觸發 加油扣款 (/fuel, ⛽ 新增加油扣款, 新增加油扣款, 加油) -> 開啟【步驟 1/6】
      if (msgText === '/fuel' || msgText.includes('新增加油扣款') || msgText.includes('加油扣款')) {
        delete tempDrafts[chatId];
        let text = '⛽ <b>【步驟 1/6】請點選您要使用的實體油卡：</b>';
        const buttons = state.fuelCards.map(c => ([{ text: `💳 ${c.cardNo} (餘額 NT$ ${(c.balance || 0).toLocaleString()})`, callback_data: `fl_card_${c.id}` }]));
        buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

        return sendMessage(token, chatId, text, { inline_keyboard: buttons });
      }

      // 若正處於 出車簽到 步驟 4/4 等待手動輸入備註狀態
      if (tempDrafts[chatId] && tempDrafts[chatId].step === 'awaiting_note' && !msgText.startsWith('/')) {
        const draft = tempDrafts[chatId];
        const note = msgText;
        const carId = draft.carId || 'v1';
        const carPlate = draft.carPlate || 'ALZ-3759';
        const drivers = draft.drivers && draft.drivers.length > 0 ? draft.drivers : ['同仁'];
        const passengers = draft.passengers || [];
        const mileage = draft.mileage || 42850;

        const now = new Date();
        const dateYMD = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
        const dateStr = dateYMD + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

        const newRecord = {
          id: 'rec-' + Date.now(),
          carId: carId,
          plate: carPlate,
          date: dateYMD,
          shift: '早班',
          driver: drivers,
          passengers: passengers,
          purpose: note,
          destination: '',
          startMileage: mileage,
          endMileage: null,
          startDate: dateStr,
          returnDate: '',
          status: 'ACTIVE',
          note: note,
          notes: note
        };

        state.records.unshift(newRecord);
        await saveCloudState(baseUrl, state);

        delete tempDrafts[chatId];

        const drvStr = drivers.join(', ');
        const psgStr = passengers.length > 0 ? passengers.join(', ') : '無乘客 (單人出車)';
        const replyText = `✅ <b>出車簽到完成！</b>\n\n🚗 <b>車輛：</b> ${carPlate}\n👤 <b>駕駛：</b> ${drvStr}\n👥 <b>同行乘客：</b> ${psgStr}\n📝 <b>備註：</b> ${note}\n📏 <b>起始里程：</b> ${mileage.toLocaleString()} km\n⏱️ <b>簽到時間：</b> ${dateStr}`;
        return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
      }

      // 若正處於 加油 步驟 2/6 等待手動輸入金額狀態
      if (tempDrafts[chatId] && tempDrafts[chatId].step === 'awaiting_fuel_amount' && !msgText.startsWith('/')) {
        const amount = parseInt(msgText.replace(/[^0-9]/g, ''));
        if (!amount || isNaN(amount) || amount <= 0) {
          return sendMessage(token, chatId, '⚠️ <b>無效的金額數字</b>\n\n請直接輸入數字金額，例如：<code>1500</code> 或 <code>1230</code>');
        }

        tempDrafts[chatId].amount = amount;
        tempDrafts[chatId].step = 'awaiting_fuel_mileage';

        let text = `💳 油卡：<b>${tempDrafts[chatId].cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${amount.toLocaleString()}</b>\n\n<b>【步驟 3/6】請直接在對話框輸入當前儀表板里程數 (km)：</b>\n<i>（例如：直接輸入 42850 傳送）</i>`;
        const mButtons = [
          [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
        ];

        return sendMessage(token, chatId, text, { inline_keyboard: mButtons });
      }

      // 若正處於 加油 步驟 3/6 等待手動輸入里程狀態
      if (tempDrafts[chatId] && tempDrafts[chatId].step === 'awaiting_fuel_mileage' && !msgText.startsWith('/')) {
        const mil = parseInt(msgText.replace(/[^0-9]/g, ''));
        if (!mil || isNaN(mil) || mil <= 0) {
          return sendMessage(token, chatId, '⚠️ <b>無效的里程數字</b>\n\n請直接輸入里程數字，例如：<code>42850</code>');
        }

        tempDrafts[chatId].mileage = mil;
        tempDrafts[chatId].step = 'awaiting_fuel_person';

        let text = `💳 油卡：<b>${tempDrafts[chatId].cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${(tempDrafts[chatId].amount || 0).toLocaleString()}</b>\n📏 里程：<b>${mil.toLocaleString()} km</b>\n\n<b>【步驟 4/6】請點選加油經辦同仁：</b>`;
        const pButtons = [];
        for (let i = 0; i < state.personnel.length; i += 3) {
          const row = state.personnel.slice(i, i + 3).map(p => ({
            text: `👤 ${p.name}`,
            callback_data: `fl_person_${p.name}`
          }));
          pButtons.push(row);
        }
        pButtons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

        return sendMessage(token, chatId, text, { inline_keyboard: pButtons });
      }

      // 若正處於 加油 步驟 5/6 等待手動輸入備註狀態
      if (tempDrafts[chatId] && tempDrafts[chatId].step === 'awaiting_fuel_note' && !msgText.startsWith('/')) {
        tempDrafts[chatId].note = msgText;
        tempDrafts[chatId].step = 'awaiting_fuel_photo';

        const draft = tempDrafts[chatId];
        let text = `💳 油卡：<b>${draft.cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${(draft.amount || 0).toLocaleString()}</b>\n📏 里程：<b>${(draft.mileage || 0).toLocaleString()} km</b>\n👤 同仁：<b>${draft.person || '同仁'}</b>\n📝 備註：<b>${draft.note}</b>\n\n<b>【步驟 6/6】請直接在對話框拍攝傳送照片佐證 (儀表板或發票)：</b>\n<i>（可直接在此傳送照片，或點選下方按鈕直接完成）</i>`;
        const pButtons = [
          [{ text: '✅ 無照片，直接完成加油登錄', callback_data: 'fl_complete_nophoto' }],
          [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
        ];

        return sendMessage(token, chatId, text, { inline_keyboard: pButtons });
      }

      // 未知指令預設回覆主選單
      return sendMainMenu(token, chatId, baseUrl);
    }
  }
}

// 發送主選單 (相容 Telegram 所有版本：帶入底部常駐 ReplyKeyboard + InlineKeyboard)
function sendMainMenu(token, chatId, baseUrl) {
  const text = `🚗 <b>公務車簽到與油卡管理系統</b>\n\n歡迎使用 Telegram Bot 操作！請點擊下方鍵盤按鈕或功能按鈕進行操作：`;

  // 1-Click 常駐鍵盤 (相容所有 Telegram 電腦版/手機版)
  const keyboard = {
    keyboard: [
      [
        { text: '🚗 出車簽到 / 歸還' },
        { text: '⛽ 新增加油扣款' }
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };

  return sendMessage(token, chatId, text, keyboard);
}

function getBackMenuKeyboard(baseUrl) {
  return {
    inline_keyboard: [
      [{ text: '📱 開啟 WebApp 網頁版', web_app: { url: baseUrl } }],
      [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
    ]
  };
}
