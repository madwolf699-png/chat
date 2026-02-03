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
  let stats_sum = { keyword: 0, other: 0 };
  
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
      stats_sum.keyword++;
    }else{
      stats_sum.other++;
    }
  });

  // 時系列折れ線グラフ
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

  // パーセンテージ
  var chartData2 = [
    ['Category', keyword, "その他"],
    ['タスク比率', stats_sum.keyword, stats_sum.other] // 合計値は自動計算されるので実数でOK
  ];

  var series = {
    0: { color: '#EA4335' }, // keyword（赤）
    1: { color: '#FBBC05' }, // その他（黄）
  };

  const displayTitle = (!keyword || keyword === "すべて") ? "全体の投稿件数推移" : `キーワード「${keyword}」の推移`;

  return { data: chartData, data2: chartData2, series: series, title: displayTitle };
}

// パターン2：回答傾向（はい・いいえ・未回答）の集計
function getAnswerData() {
  const data = getRawFirestoreData();
  const stats = {};
  let stats_sum = { yes: 0, no:0, other: 0 };
  
  data.forEach(fields => {
    const answer = fields.answer?.stringValue || "";
    const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, yes: 0, no: 0, other: 0 };
 
    stats[date].all++;
    if (answer === "yes") {
      stats[date].yes++;
      stats_sum.yes++;
    } else if (answer === "no") {
      stats[date].no++;
      stats_sum.no++;
    } else {
      stats[date].other++;
      stats_sum.other++;
    }
  });

  // 時系列折れ線グラフ
  const chartData = [["日付", "全件", "はい", "いいえ", "未回答"]];
  Object.keys(stats).sort().forEach(date => {
    chartData.push([date, stats[date].all, stats[date].yes, stats[date].no, stats[date].other]);
  });

  // パーセンテージ
  var chartData2 = [
    ['Category', 'はい', 'いいえ', '未回答'],
    ['タスク比率', stats_sum.yes, stats_sum.no,stats_sum.other] // 合計値は自動計算されるので実数でOK
  ];

  var series = {
    0: { color: '#EA4335' }, // はい（赤）
    1: { color: '#FBBC05' }, // いいえ（黄）
    2: { color: '#34A853' }  // 未回答（緑）
  };

  return { data: chartData, data2: chartData2, series: series, title: '問題解決の回答傾向の時系列推移' };
}

// パターン3：異常終了の集計
function getStatusData() {
  const data = getRawFirestoreData();
  const stats = {};
  let stats_sum = { error: 0, nothing: 0, other: 0 };
  
  data.forEach(fields => {
    const status = fields.status?.stringValue || "";
    const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, error: 0, nothing: 0, other: 0 };
    
    stats[date].all++;
    if (status === "error") {
      stats[date].error++;
      stats_sum.error++;
    } else if (status === "") {
      stats[date].nothing++;
      stats_sum.nothing++;
    } else {
      stats[date].other++;
      stats_sum.other++;
    }
  });

  // 折れ線グラフ
  const chartData = [["日付", "全件", "error", "nothing", "その他"]];
  Object.keys(stats).sort().forEach(date => {
    chartData.push([date, stats[date].all, stats[date].error, stats[date].nothing, stats[date].other]);
  });

  // パーセンテージ
  var chartData2 = [
    ['Category', 'error', 'nothing', 'その他'],
    ['タスク比率', stats_sum.error, stats_sum.nothing, stats_sum.other] // 合計値は自動計算されるので実数でOK
  ];

  var series = {
    0: { color: '#EA4335' }, // error（赤）
    1: { color: '#FBBC05' }, // nothing（黄）
    2: { color: '#34A853' }  // その他（緑）
  };

  return { data: chartData, data2: chartData2, series: series, title: '異常終了の時系列推移' };
}

// 共通：Firestoreから生データを取得する
function getRawFirestoreData() {
  const projectId = "sun-internal-chat";
  const collectionName = "chat_logs";
  const token = ScriptApp.getOAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}`;
  const response = UrlFetchApp.fetch(url, { headers: { "Authorization": "Bearer " + token } });
  const json = JSON.parse(response.getContentText());
  return json.documents ? json.documents.map(doc => doc.fields) : [];
}
