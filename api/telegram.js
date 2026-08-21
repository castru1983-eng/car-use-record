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

  // GET: 用於測試 Webhook 或設定 Webhook
  if (req.method === 'GET') {
    const { action, token, url } = req.query;

    if (action === 'set_webhook' && token) {
      const webhookUrl = url || `https://${req.headers.host}/api/telegram?token=${token}`;
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
        const data = await tgRes.json();
        return res.status(200).json({ success: true, tgResponse: data, webhookUrl });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
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

  const token = req.query.token || process.env.TELEGRAM_BOT_TOKEN;
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

// 輔助：回應 Callback Query
async function answerCallbackQuery(token, callbackQueryId, text = '') {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text })
  });
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

// 處理 Telegram 訊息邏輯
async function processTelegramUpdate(update, token, baseUrl) {
  // 1. 處理 Inline Button 點擊事件 (Callback Query)
  if (update.callback_query) {
    const cb = update.callback_query;
    const chatId = cb.message.chat.id;
    const data = cb.data;

    await answerCallbackQuery(token, cb.id);

    const state = await getCloudState(baseUrl);

    if (data === 'cmd_menu') {
      return sendMainMenu(token, chatId, baseUrl);
    }

    // A. 查詢實體油卡餘額
    if (data === 'cmd_cards') {
      let text = '💳 <b>車隊實體油卡與餘額明細</b>\n\n';
      state.fuelCards.forEach(c => {
        const boundV = state.vehicles ? state.vehicles.find(v => v.id === c.boundCarId) : null;
        const boundStr = boundV ? ` [綁定 ${boundV.plate}]` : '';
        text += `• <b>${c.cardNo}</b>${boundStr}\n  當前餘額：<b>NT$ ${(c.balance || 0).toLocaleString()}</b>\n\n`;
      });
      return sendMessage(token, chatId, text, getBackMenuKeyboard(baseUrl));
    }

    // B. 查詢當前出勤狀況
    if (data === 'cmd_status') {
      const activeRecords = state.records.filter(r => !r.returnDate || r.returnDate === '');
      if (activeRecords.length === 0) {
        return sendMessage(token, chatId, '🟢 <b>當前公務車出勤狀況</b>\n\n所有公務車輛均在廠，無外出出勤車輛。', getBackMenuKeyboard(baseUrl));
      }

      let text = '🚗 <b>當前外出出勤公務車輛列表</b>\n\n';
      activeRecords.forEach(r => {
        const v = state.vehicles ? state.vehicles.find(veh => veh.id === r.carId) : null;
        const carName = v ? `${v.plate} (${v.model})` : '公務車';
        const psgStr = (r.passengers && r.passengers.length > 0) ? r.passengers.join(', ') : '無';
        text += `• <b>${carName}</b>\n  👤 駕駛：${r.driver || '同仁'}\n  👥 乘客：${psgStr}\n  📝 備註：${r.note || r.purpose || '無'}\n  📏 出車里程：${r.startMileage ? r.startMileage.toLocaleString() + ' km' : '-'}\n  ⏱️ 簽到時間：${r.startDate || ''}\n\n`;
      });
      return sendMessage(token, chatId, text, getBackMenuKeyboard(baseUrl));
    }

    // C. 互動式出車簽到流程
    // 步驟 1/4: 選擇車輛
    if (data === 'cmd_signin') {
      let text = '🚗 <b>【步驟 1/4】請點選您要簽到的公務車輛：</b>';
      const buttons = state.vehicles.map(v => ([{ text: `🚗 ${v.plate} (${v.model})`, callback_data: `sn_car_${v.id}` }]));
      buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: buttons });
    }

    // 步驟 2/4: 選擇駕駛
    if (data.startsWith('sn_car_')) {
      const carId = data.replace('sn_car_', '');
      const vehicle = state.vehicles.find(v => v.id === carId);

      tempDrafts[chatId] = { carId, carPlate: vehicle ? vehicle.plate : '公務車', mileage: vehicle ? (vehicle.mileage || 42850) : 42850 };

      let text = `🚗 選擇車輛：<b>${tempDrafts[chatId].carPlate}</b>\n\n<b>【步驟 2/4】請點選出勤駕駛姓名：</b>`;
      const pButtons = [];
      for (let i = 0; i < state.personnel.length; i += 3) {
        const row = state.personnel.slice(i, i + 3).map(p => ({
          text: `👤 ${p.name}`,
          callback_data: `sn_driver_${p.name}`
        }));
        pButtons.push(row);
      }
      pButtons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: pButtons });
    }

    // 步驟 3/4: 選擇同行乘客
    if (data.startsWith('sn_driver_')) {
      const driverName = data.replace('sn_driver_', '');
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].driver = driverName;

      let text = `🚗 車輛：<b>${tempDrafts[chatId].carPlate || '公務車'}</b>\n👤 駕駛：<b>${driverName}</b>\n\n<b>【步驟 3/4】請點選同行乘客 (如有)：</b>`;
      
      const psgButtons = [];
      psgButtons.push([{ text: '🚫 無同行乘客 (單人出車)', callback_data: 'sn_psg_none' }]);

      const otherPersonnel = state.personnel.filter(p => p.name !== driverName);
      for (let i = 0; i < otherPersonnel.length; i += 3) {
        const row = otherPersonnel.slice(i, i + 3).map(p => ({
          text: `👥 ${p.name}`,
          callback_data: `sn_psg_${p.name}`
        }));
        psgButtons.push(row);
      }
      psgButtons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: psgButtons });
    }

    // 步驟 4/4: 選擇/輸入備註說明
    if (data.startsWith('sn_psg_')) {
      const psg = data.replace('sn_psg_', '');
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].passenger = (psg === 'none') ? '' : psg;
      tempDrafts[chatId].step = 'awaiting_note';

      const psgDisplay = tempDrafts[chatId].passenger ? tempDrafts[chatId].passenger : '無乘客';
      let text = `🚗 車輛：<b>${tempDrafts[chatId].carPlate || '公務車'}</b>\n👤 駕駛：<b>${tempDrafts[chatId].driver || '同仁'}</b>\n👥 乘客：<b>${psgDisplay}</b>\n\n<b>【步驟 4/4】請點選「無備註」或直接在此對話框輸入備註內容：</b>\n<i>（亦可直接在此對話框輸入自行輸入備註文字傳送，例如：台中客戶拜訪）</i>`;
      
      const noteButtons = [
        [
          { text: '📝 無備註 (點擊直接完成簽到)', callback_data: 'sn_note_無備註' }
        ],
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
      const driver = draft.driver || '同仁';
      const passenger = draft.passenger || '';
      const mileage = draft.mileage || 42850;
      const note = (rawNote === '無備註') ? '' : rawNote;

      const now = new Date();
      const dateYMD = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      const dateStr = dateYMD + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

      const passengersArr = passenger ? [passenger] : [];

      const newRecord = {
        id: 'rec-' + Date.now(),
        carId: carId,
        plate: carPlate,
        date: dateYMD,
        shift: '早班',
        driver: driver,
        passengers: passengersArr,
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

      const psgStr = passenger ? passenger : '無乘客 (單人出車)';
      const noteStr = note ? note : '無備註';
      const replyText = `✅ <b>出車簽到完成！</b>\n\n🚗 <b>車輛：</b> ${carPlate}\n👤 <b>駕駛：</b> ${driver}\n👥 <b>同行乘客：</b> ${psgStr}\n📝 <b>備註：</b> ${noteStr}\n📏 <b>起始里程：</b> ${mileage.toLocaleString()} km\n⏱️ <b>簽到時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }

    // D. 互動式加油扣款流程
    if (data === 'cmd_fuel') {
      let text = '⛽ <b>【步驟 1/3】請點選您要使用的實體油卡：</b>';
      const buttons = state.fuelCards.map(c => ([{ text: `💳 ${c.cardNo} (餘額 NT$ ${(c.balance || 0).toLocaleString()})`, callback_data: `fl_card_${c.id}` }]));
      buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: buttons });
    }

    // 加油選油卡 -> 選擇加油金額
    if (data.startsWith('fl_card_')) {
      const cardId = data.replace('fl_card_', '');
      const card = state.fuelCards.find(c => c.id === cardId);

      tempDrafts[chatId] = { cardId, cardNo: card ? card.cardNo : '油卡', balance: card ? (card.balance || 0) : 0, boundCarId: card ? card.boundCarId : '' };

      let text = `💳 選擇油卡：<b>${tempDrafts[chatId].cardNo}</b> (當前餘額: NT$ ${tempDrafts[chatId].balance.toLocaleString()})\n\n<b>【步驟 2/3】請點選加油金額：</b>`;
      const amtButtons = [
        [
          { text: '⛽ $500', callback_data: 'fl_amt_500' },
          { text: '⛽ $1,000', callback_data: 'fl_amt_1000' }
        ],
        [
          { text: '⛽ $1,500', callback_data: 'fl_amt_1500' },
          { text: '⛽ $2,000', callback_data: 'fl_amt_2000' }
        ],
        [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
      ];

      return sendMessage(token, chatId, text, { inline_keyboard: amtButtons });
    }

    // 加油選金額 -> 選擇同仁
    if (data.startsWith('fl_amt_')) {
      const amt = parseInt(data.replace('fl_amt_', '')) || 1000;
      if (!tempDrafts[chatId]) tempDrafts[chatId] = {};
      tempDrafts[chatId].amount = amt;

      let text = `💳 油卡：<b>${tempDrafts[chatId].cardNo || '油卡'}</b>\n💰 金額：<b>NT$ ${amt.toLocaleString()}</b>\n\n<b>【步驟 3/3】請點選加油經辦同仁：</b>`;
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

    // 加油選同仁 -> 完成加油扣款！
    if (data.startsWith('fl_person_')) {
      const person = data.replace('fl_person_', '');
      const draft = tempDrafts[chatId] || {};
      const cardId = draft.cardId || (state.fuelCards[0] ? state.fuelCards[0].id : 'fc-1');
      const amount = draft.amount || 1000;

      const fuelCard = state.fuelCards.find(c => c.id === cardId) || state.fuelCards[0];
      const vehicle = state.vehicles.find(v => v.id === (fuelCard ? fuelCard.boundCarId : '')) || state.vehicles[0];

      const balanceAfter = (fuelCard.balance || 0) - amount;
      fuelCard.balance = balanceAfter;

      if (fuelCard.boundCarId && state.vehicles) {
        const boundV = state.vehicles.find(v => v.id === fuelCard.boundCarId);
        if (boundV) boundV.fuelCardBalance = balanceAfter;
      }

      const now = new Date();
      const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

      const newTx = {
        id: 'ft-' + Date.now(),
        cardId: fuelCard.id,
        cardNo: fuelCard.cardNo,
        carId: vehicle ? vehicle.id : 'v1',
        type: 'EXPENSE',
        amount: amount,
        mileage: vehicle ? (vehicle.mileage || 42850) : 42850,
        balanceAfter: balanceAfter,
        person: person,
        date: dateStr,
        note: 'Telegram 1-Click 加油扣款',
        photos: []
      };

      state.fuelTransactions.unshift(newTx);
      await saveCloudState(baseUrl, state);

      delete tempDrafts[chatId];

      const replyText = `⛽ <b>加油扣款已成功登錄！</b>\n\n💳 <b>使用油卡：</b> ${fuelCard.cardNo}\n💰 <b>扣款金額：</b> - NT$ ${amount.toLocaleString()}\n💵 <b>扣款後油卡餘額：</b> NT$ ${balanceAfter.toLocaleString()}\n👤 <b>經辦同仁：</b> ${person}\n⏱️ <b>時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }
  }

  // 2. 處理文字訊息指令 (Message)
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const msgText = update.message.text.trim();

    if (msgText.startsWith('/start') || msgText.startsWith('/help') || msgText === '選單' || msgText === '功能') {
      return sendMainMenu(token, chatId, baseUrl);
    }

    const state = await getCloudState(baseUrl);

    // 若正處於 步驟 4/4 等待手動輸入備註狀態，則將使用者發送的訊息視為自訂備註並完成簽到
    if (tempDrafts[chatId] && tempDrafts[chatId].step === 'awaiting_note' && !msgText.startsWith('/')) {
      const draft = tempDrafts[chatId];
      const note = msgText;
      const carId = draft.carId || 'v1';
      const carPlate = draft.carPlate || 'ALZ-3759';
      const driver = draft.driver || '同仁';
      const passenger = draft.passenger || '';
      const mileage = draft.mileage || 42850;

      const now = new Date();
      const dateYMD = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      const dateStr = dateYMD + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

      const passengersArr = passenger ? [passenger] : [];

      const newRecord = {
        id: 'rec-' + Date.now(),
        carId: carId,
        plate: carPlate,
        date: dateYMD,
        shift: '早班',
        driver: driver,
        passengers: passengersArr,
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

      const psgStr = passenger ? passenger : '無乘客 (單人出車)';
      const replyText = `✅ <b>出車簽到完成！</b>\n\n🚗 <b>車輛：</b> ${carPlate}\n👤 <b>駕駛：</b> ${driver}\n👥 <b>同行乘客：</b> ${psgStr}\n📝 <b>備註：</b> ${note}\n📏 <b>起始里程：</b> ${mileage.toLocaleString()} km\n⏱️ <b>簽到時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }

    // 處理出車簽到文字指令：/signin 車號 駕駛 乘客 備註
    if (msgText.startsWith('/signin') || msgText.startsWith('簽到')) {
      const parts = msgText.replace('/signin', '').replace('簽到', '').trim().split(/\s+/);
      if (parts.length < 2) {
        return sendMessage(token, chatId, '⚠️ <b>簽到格式不完整</b>\n\n請使用格式：\n<code>/signin 車牌 駕駛姓名 乘客姓名 備註</code>\n\n例如：\n<code>/signin ALZ-3759 林大為 陳靜宜 公務外勤</code>');
      }

      let carQuery = parts[0];
      let driver = parts[1];
      let passenger = parts[2] || '';
      let note = parts.slice(3).join(' ') || 'Telegram Bot 簽到';

      let vehicle = null;
      if (state && state.vehicles) {
        vehicle = state.vehicles.find(v => v.plate.toLowerCase().includes(carQuery.toLowerCase()));
      }
      if (!vehicle && state && state.vehicles && state.vehicles.length > 0) {
        vehicle = state.vehicles[0];
      }

      const carId = vehicle ? vehicle.id : 'v1';
      const carPlate = vehicle ? vehicle.plate : carQuery;
      const mileage = vehicle ? (vehicle.mileage || 42850) : 42850;

      const now = new Date();
      const dateYMD = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
      const dateStr = dateYMD + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

      const passengersArr = passenger ? [passenger] : [];

      const newRecord = {
        id: 'rec-' + Date.now(),
        carId: carId,
        plate: carPlate,
        date: dateYMD,
        shift: '早班',
        driver: driver,
        passengers: passengersArr,
        purpose: note || '公務外勤',
        destination: '',
        startMileage: mileage,
        endMileage: null,
        startDate: dateStr,
        returnDate: '',
        status: 'ACTIVE',
        note: note || 'Telegram Bot 簽到',
        notes: note || 'Telegram Bot 簽到'
      };

      state.records.unshift(newRecord);
      await saveCloudState(baseUrl, state);

      const psgStr = passenger ? passenger : '無乘客 (單人出車)';
      const replyText = `✅ <b>出車簽到成功！</b>\n\n🚗 <b>車輛：</b> ${carPlate}\n👤 <b>駕駛：</b> ${driver}\n👥 <b>同行乘客：</b> ${psgStr}\n📝 <b>備註：</b> ${note}\n📏 <b>起始里程：</b> ${mileage.toLocaleString()} km\n⏱️ <b>時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }

    // 處理加油扣款文字指令：/fuel 金額 里程 姓名 備註
    if (msgText.startsWith('/fuel') || msgText.startsWith('加油')) {
      const parts = msgText.replace('/fuel', '').replace('加油', '').trim().split(/\s+/);
      if (parts.length < 1 || !parseInt(parts[0])) {
        return sendMessage(token, chatId, '⚠️ <b>加油格式不完整</b>\n\n請使用格式：\n<code>/fuel 加油金額 當前里程 加油同仁 備註</code>\n\n例如：\n<code>/fuel 1500 42850 林大為 中油西屯站</code>');
      }

      let amount = parseInt(parts[0]) || 0;
      let mileage = parseInt(parts[1]) || 0;
      let person = parts[2] || (update.message.from ? update.message.from.first_name : '駕駛同仁');
      let note = parts.slice(3).join(' ') || 'Telegram Bot 加油紀錄';

      let fuelCard = (state && state.fuelCards && state.fuelCards.length > 0) ? state.fuelCards[0] : null;
      let vehicle = (state && state.vehicles && state.vehicles.length > 0) ? state.vehicles[0] : null;

      if (!fuelCard) {
        return sendMessage(token, chatId, '⚠️ 系統中尚無實體油卡可供扣款，請先在車輛管理新增油卡。');
      }

      const balanceAfter = (fuelCard.balance || 0) - amount;
      fuelCard.balance = balanceAfter;

      if (fuelCard.boundCarId && state.vehicles) {
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
        cardId: fuelCard.id,
        cardNo: fuelCard.cardNo,
        carId: vehicle ? vehicle.id : 'v1',
        type: 'EXPENSE',
        amount: amount,
        mileage: mileage,
        balanceAfter: balanceAfter,
        person: person,
        date: dateStr,
        note: note,
        photos: []
      };

      state.fuelTransactions.unshift(newTx);
      await saveCloudState(baseUrl, state);

      const replyText = `⛽ <b>加油扣款已成功登錄！</b>\n\n💳 <b>使用油卡：</b> ${fuelCard.cardNo}\n💰 <b>加油金額：</b> - NT$ ${amount.toLocaleString()}\n💵 <b>扣款後油卡餘額：</b> NT$ ${balanceAfter.toLocaleString()}\n📏 <b>當前里程：</b> ${mileage ? mileage.toLocaleString() + ' km' : '-'}\n👤 <b>經辦同仁：</b> ${person}\n⏱️ <b>時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }

    // 未知指令預設回覆主選單
    return sendMainMenu(token, chatId, baseUrl);
  }
}

// 發送主選單 Inline Keyboard
function sendMainMenu(token, chatId, baseUrl) {
  const text = `🚗 <b>公務車簽到與油卡管理系統</b>\n\n歡迎使用 Telegram Bot 操作！請點擊下方按鈕進行 1-Click 快捷選單操作：`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚗 出車簽到 / 歸還', callback_data: 'cmd_signin' },
        { text: '⛽ 新增加油扣款', callback_data: 'cmd_fuel' }
      ],
      [
        { text: '💳 查詢油卡餘額', callback_data: 'cmd_cards' },
        { text: '📋 當前出勤車輛', callback_data: 'cmd_status' }
      ],
      [
        { text: '📱 開啟 WebApp 網頁版介面', web_app: { url: baseUrl } }
      ]
    ]
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
