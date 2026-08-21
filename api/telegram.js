// Vercel Serverless Function: Telegram Bot Webhook API (/api/telegram.js)

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

// 讀取當前雲端同步 Data
async function getCloudState(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/sync`);
    if (res.ok) {
      const data = await res.json();
      return data.state || null;
    }
  } catch (e) {
    console.error('Failed to fetch cloud state in telegram bot:', e);
  }
  return null;
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

    if (data === 'cmd_cards') {
      if (!state || !state.fuelCards || state.fuelCards.length === 0) {
        return sendMessage(token, chatId, '💳 <b>實體油卡概況</b>\n\n目前系統中尚無登記的實體油卡。', getBackMenuKeyboard(baseUrl));
      }
      let text = '💳 <b>車隊實體油卡與餘額明細</b>\n\n';
      state.fuelCards.forEach(c => {
        const boundV = state.vehicles ? state.vehicles.find(v => v.id === c.boundCarId) : null;
        const boundStr = boundV ? ` [綁定 ${boundV.plate}]` : '';
        text += `• <b>${c.cardNo}</b>${boundStr}\n  當前餘額：<b>NT$ ${(c.balance || 0).toLocaleString()}</b>\n\n`;
      });
      return sendMessage(token, chatId, text, getBackMenuKeyboard(baseUrl));
    }

    if (data === 'cmd_status') {
      if (!state || !state.records) {
        return sendMessage(token, chatId, '📋 目前尚無車輛簽到資料。', getBackMenuKeyboard(baseUrl));
      }
      const activeRecords = state.records.filter(r => !r.returnDate || r.returnDate === '');
      if (activeRecords.length === 0) {
        return sendMessage(token, chatId, '🟢 <b>當前公務車出勤狀況</b>\n\n所有公務車輛均在廠，無外出車輛。', getBackMenuKeyboard(baseUrl));
      }

      let text = '🚗 <b>當前外出出勤公務車輛列表</b>\n\n';
      activeRecords.forEach(r => {
        const v = state.vehicles ? state.vehicles.find(veh => veh.id === r.carId) : null;
        const carName = v ? `${v.plate} (${v.model})` : '公務車';
        text += `• <b>${carName}</b>\n  👤 駕駛：${r.driver || '同仁'}\n  📍 目的地：${r.destination || '未填寫'}\n  📏 出車里程：${r.startMileage ? r.startMileage.toLocaleString() + ' km' : '-'}\n  ⏱️ 簽到時間：${r.startDate || ''}\n\n`;
      });
      return sendMessage(token, chatId, text, getBackMenuKeyboard(baseUrl));
    }

    if (data === 'cmd_signin') {
      if (!state || !state.vehicles || state.vehicles.length === 0) {
        return sendMessage(token, chatId, '⚠️ 系統中目前尚無公務車資料。', getBackMenuKeyboard(baseUrl));
      }

      let text = '🚗 <b>公務車出車簽到 / 歸還操作</b>\n\n請選擇您要操作的公務車輛：';
      const buttons = state.vehicles.map(v => ([{ text: `🚗 ${v.plate} (${v.model})`, callback_data: `select_car_${v.id}` }]));
      buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: buttons });
    }

    if (data.startsWith('select_car_')) {
      const carId = data.replace('select_car_', '');
      const vehicle = state.vehicles ? state.vehicles.find(v => v.id === carId) : null;
      const carName = vehicle ? `${vehicle.plate}` : carId;

      const text = `🚗 選擇車輛：<b>${carName}</b>\n\n請直接在對話框回覆簽到指令：\n<code>/signin ${carName} 駕駛姓名 目的地 起始里程</code>\n\n<b>範例：</b>\n<code>/signin ${carName} 林大為 彰化廠 ${(vehicle && vehicle.mileage) ? vehicle.mileage : 42850}</code>\n\n<i>或點擊下方按鈕開啟 WebApp 網頁版直接點選簽到：</i>`;
      return sendMessage(token, chatId, text, {
        inline_keyboard: [
          [{ text: '📱 開啟 WebApp 直接簽到', web_app: { url: baseUrl } }],
          [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
        ]
      });
    }

    if (data === 'cmd_fuel') {
      if (!state || !state.fuelCards || state.fuelCards.length === 0) {
        return sendMessage(token, chatId, '⚠️ 系統中目前尚無實體油卡資料。', getBackMenuKeyboard(baseUrl));
      }

      let text = '⛽ <b>加油扣款 / 油卡儲值操作</b>\n\n請選擇您要使用的實體油卡：';
      const buttons = state.fuelCards.map(c => ([{ text: `💳 ${c.cardNo} (餘額 NT$ ${c.balance.toLocaleString()})`, callback_data: `select_card_${c.id}` }]));
      buttons.push([{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]);

      return sendMessage(token, chatId, text, { inline_keyboard: buttons });
    }

    if (data.startsWith('select_card_')) {
      const cardId = data.replace('select_card_', '');
      const card = state.fuelCards ? state.fuelCards.find(c => c.id === cardId) : null;
      const cardName = card ? card.cardNo : cardId;

      const text = `💳 選擇油卡：<b>${cardName}</b> (當前餘額: NT$ ${(card ? card.balance : 0).toLocaleString()})\n\n請直接回覆加油扣款指令：\n<code>/fuel 加油金額 里程數 加油同仁 備註</code>\n\n<b>範例：</b>\n<code>/fuel 1500 42850 林大為 中油西屯站</code>\n\n<i>或點擊下方按鈕開啟 WebApp 網頁版紀錄加油：</i>`;
      return sendMessage(token, chatId, text, {
        inline_keyboard: [
          [{ text: '📱 開啟 WebApp 直接登錄加油', web_app: { url: baseUrl } }],
          [{ text: '🔙 返回主選單', callback_data: 'cmd_menu' }]
        ]
      });
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

    // 處理出車簽到指令：/signin 車號 駕駛 目的地 里程
    if (msgText.startsWith('/signin') || msgText.startsWith('簽到')) {
      const parts = msgText.replace('/signin', '').replace('簽到', '').trim().split(/\s+/);
      if (parts.length < 3) {
        return sendMessage(token, chatId, '⚠️ <b>簽到格式不完整</b>\n\n請使用格式：\n<code>/signin 車牌 駕駛姓名 目的地 起始里程</code>\n\n例如：\n<code>/signin ALZ-3759 林大為 彰化廠 42850</code>');
      }

      let carQuery = parts[0];
      let driver = parts[1];
      let destination = parts[2];
      let mileage = parseInt(parts[3]) || 0;

      let vehicle = null;
      if (state && state.vehicles) {
        vehicle = state.vehicles.find(v => v.plate.toLowerCase().includes(carQuery.toLowerCase()));
      }
      if (!vehicle && state && state.vehicles && state.vehicles.length > 0) {
        vehicle = state.vehicles[0];
      }

      const carId = vehicle ? vehicle.id : 'v1';
      const carPlate = vehicle ? vehicle.plate : carQuery;

      if (!mileage && vehicle) mileage = vehicle.mileage || 0;

      const now = new Date();
      const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');

      const newRecord = {
        id: 'rec-' + Date.now(),
        carId: carId,
        driver: driver,
        passengers: [],
        shift: '早班',
        purpose: '公務外勤',
        destination: destination,
        startMileage: mileage,
        endMileage: null,
        startDate: dateStr,
        returnDate: '',
        note: 'Telegram Bot 簽到'
      };

      if (!state.records) state.records = [];
      state.records.unshift(newRecord);

      if (vehicle && mileage > (vehicle.mileage || 0)) {
        vehicle.mileage = mileage;
      }

      await saveCloudState(baseUrl, state);

      const replyText = `✅ <b>出車簽到成功！</b>\n\n🚗 <b>車輛：</b> ${carPlate}\n👤 <b>駕駛：</b> ${driver}\n📍 <b>目的地：</b> ${destination}\n📏 <b>起始里程：</b> ${mileage.toLocaleString()} km\n⏱️ <b>時間：</b> ${dateStr}`;
      return sendMessage(token, chatId, replyText, getBackMenuKeyboard(baseUrl));
    }

    // 處理加油扣款指令：/fuel 金額 里程 姓名 備註
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

      if (!state.fuelTransactions) state.fuelTransactions = [];
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
  const text = `🚗 <b>公務車簽到與油卡管理系統</b>\n\n歡迎使用 Telegram Bot 操作！請點擊下方按鈕或直接輸入指令：\n\n• <b>出車簽到：</b> <code>/signin 車號 駕駛 目的地 里程</code>\n• <b>加油扣款：</b> <code>/fuel 金額 里程 同仁 備註</code>`;

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
