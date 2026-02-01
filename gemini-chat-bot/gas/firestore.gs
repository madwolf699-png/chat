// ウェブアプリにアクセスしたときに実行される
function doGet() {
return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('Firestore 統計ダッシュボード')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// パターン1：キーワードの集計
function getKeywordData(keyword) {
  //keyword = "転居（引っ越し）";
  console.log("keyword: ", keyword);
  const data = getRawFirestoreData();
  const stats = {};
  
  data.forEach(fields => {
    const response = fields.response?.stringValue || "";
    console.log("response", response);
    const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, keyword: 0 };
    stats[date].all++;
    // 「すべて」が選択されたか、キーワードが含まれている場合にカウント
    if (!keyword || keyword === "すべて" || response.includes(keyword)) {
      //const date = fields.receivedAt.timestampValue.split('T')[0];
      stats[date].keyword = (stats[date].keyword || 0) + 1;
    }
  });

  const chartData = [["日付", "全件", keyword]];
  const sortedDates = Object.keys(stats).sort();

  if (sortedDates.length === 0) {
    // データが1件もない場合、今日の日付で0件というダミーを入れることでエラーを回避
    const today = new Date().toISOString().split('T')[0];
    chartData.push([today, 0, 0]);
  } else {
    sortedDates.forEach(date => {
      chartData.push([date, stats[date].all, stats[date].keyword]);
    });
  }
  
  const displayTitle = (!keyword || keyword === "すべて") ? "全体の投稿件数推移" : `キーワード「${keyword}」の推移`;
  return { data: chartData, title: displayTitle };
}

// パターン2：回答傾向（はい・いいえ・未回答）の集計
function getAnswerData() {
  const data = getRawFirestoreData();
  const stats = {};
  
  data.forEach(fields => {
    const answer = fields.answer?.stringValue || "";
    const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, yes: 0, no: 0, other: 0 };
    
    stats[date].all++;
    if (answer === "はい") stats[date].yes++;
    else if (answer === "いいえ") stats[date].no++;
    else stats[date].other++;
  });

  const chartData = [["日付", "全件", "はい", "いいえ", "未回答"]];
  Object.keys(stats).sort().forEach(date => {
    chartData.push([date, stats[date].all, stats[date].yes, stats[date].no, stats[date].other]);
  });
  return { data: chartData, title: '問題解決の回答傾向の時系列推移' };
}

// パターン3：異常終了の集計
function getStatusData() {
  const data = getRawFirestoreData();
  const stats = {};
  
  data.forEach(fields => {
    const status = fields.status?.stringValue || "";
    const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, error: 0, nothing: 0 };
    
    stats[date].all++;
    if (status === "error") stats[date].error++;
    else if (status === "") stats[date].nothing++;
  });

  const chartData = [["日付", "全件", "error", "nothing"]];
  Object.keys(stats).sort().forEach(date => {
    chartData.push([date, stats[date].all, stats[date].error, stats[date].nothing]);
  });
  return { data: chartData, title: '異常終了の時系列推移' };
}

// 共通：Firestoreから生データを取得する
function getRawFirestoreData() {
  const projectId = "gemini-chat-bot-484323";
  const collectionName = "chat_logs";
  const token = ScriptApp.getOAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}`;
  const response = UrlFetchApp.fetch(url, { headers: { "Authorization": "Bearer " + token } });
  const json = JSON.parse(response.getContentText());
  return json.documents ? json.documents.map(doc => doc.fields) : [];
}

