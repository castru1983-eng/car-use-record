// Vercel Serverless Function: 跨裝置即時雲端資料同步 API
let globalSyncData = null;
let lastSyncTime = 0;

export default async function handler(req, res) {
  // 允許所有跨網域 (CORS) 存取，方便手機與電腦端雙向同步
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (payload && payload.state) {
        globalSyncData = payload.state;
        lastSyncTime = payload.timestamp || Date.now();
        return res.status(200).json({
          success: true,
          message: '雲端同步資料儲存成功',
          timestamp: lastSyncTime
        });
      } else {
        return res.status(400).json({ error: '無效的資料格式' });
      }
    } catch (err) {
      return res.status(400).json({ error: 'JSON 解析失敗' });
    }
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      state: globalSyncData,
      timestamp: lastSyncTime
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
