const PROJECT_ID = "sun-internal-chat";
const COLLECTION_NAME = "chat_logs";

// ウェブアプリにアクセスしたときに実行される
function doGet() {
  /*
  var userEmail = Session.getActiveUser().getEmail();
  if (!userEmail) {
    // ログインしていない、または権限がない場合の処理
    return HtmlService.createHtmlOutput("Googleアカウントでログインしてください。");
  }
  */
  return HtmlService.createTemplateFromFile('index').evaluate()
      .setTitle('Firestore 統計ダッシュボード')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// パターン0：サマリの集計
function getSummaryData(keywords) {
  /*
  const keywords = [
    {key: "通勤手当", value:"通勤手当"},
    {key: "喫煙所", value: "喫煙所"},
  ]
  */
  // 現在日
  const now = new Date();
  // 今月初日
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromto_to_today = getFromTo(firstDay, now);
  const year = now.getFullYear();
  const month = now.getMonth(); // 今月のインデックス (0-11)
  // 先月初日
  const firstDayLastMonth = new Date(year, month - 1, 1);
  //先月末日
  const lastDayLastMonth = new Date(year, month, 0);
  const fromto_last_month = getFromTo(firstDayLastMonth, lastDayLastMonth);
  // 昨日
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const fromto_yesterday = getFromTo(yesterday, yesterday);
  // 一昨日
  const beforeYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
  const fromto_beforeYesterday = getFromTo(beforeYesterday, beforeYesterday);
  const dayOfWeek = now.getDay(); // 日(0)〜土(6)
  // 今週の月曜日を基準にするための差分を計算
  // 日曜(0)の場合は -6、それ以外は -(dayOfWeek - 1)
  const diffToMonday = (dayOfWeek === 0) ? -6 : -(dayOfWeek - 1);
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
// --- 先週 (今週の月曜から 7日前〜1日前) ---
  const lastWeekStart = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
  const lastWeekEnd   = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1);
  const fromto_last_week = getFromTo(lastWeekStart, lastWeekEnd);
  // --- 先々週 (今週の月曜から 14日前〜8日前) ---
  const beforeLastWeekStart = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 14);
  const beforeLastWeekEnd   = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 8);
  const fromto_two_weeks_ago = getFromTo(beforeLastWeekStart, beforeLastWeekEnd);

  //------------------------------------------------------------------------------
  // 今月初めから今日までのリクエスト数
  //------------------------------------------------------------------------------
  var request_num_to_today = getRecordCountFirestoreData(setQueryRecordCount(
    fromto_to_today,
    null
    ));
  var request_num_last_month = getRecordCountFirestoreData(setQueryRecordCount(
    fromto_last_month,
    null
    ));

  //------------------------------------------------------------------------------
  // 昨日のリクエスト数
  //------------------------------------------------------------------------------
  var request_num_yesterday = getRecordCountFirestoreData(setQueryRecordCount(
    fromto_yesterday,
    null
    ));
  var request_num_before_yesterday = getRecordCountFirestoreData(setQueryRecordCount(
    fromto_beforeYesterday,
    null
    ));

  //------------------------------------------------------------------------------
  // 今月初めから今日までの総ユーザ数
  // 対象範囲で全件取得して「氏名」で重複排除する。
  //------------------------------------------------------------------------------
  let data = getRawFirestoreData(setQueryFromTo(fromto_to_today));
  let users = data.flatMap(doc => {
    const nameField = doc.request.mapValue.fields?.displayName;
    // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
    return nameField?.stringValue ? [nameField.stringValue] : ['名称未設定'];
  });
  let distinctUsers = [...new Set(users)];
  var user_num_to_today = distinctUsers.length;

  data = getRawFirestoreData(setQueryFromTo(fromto_last_month));
  users = data.flatMap(doc => {
    const nameField = doc.request.mapValue.fields?.displayName;
    // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
    return nameField?.stringValue ? [nameField.stringValue] : ['名称未設定'];
  });
  distinctUsers = [...new Set(users)];
  var user_num_last_month = distinctUsers.length;

  //------------------------------------------------------------------------------
  // 過去１週間のリクエスト数
  //------------------------------------------------------------------------------
  var request_num_last_week = getRecordCountFirestoreData(setQueryRecordCount(
    fromto_last_week,
    null
    ));
  var request_num_two_weeks_ago = getRecordCountFirestoreData(setQueryRecordCount(
    fromto_two_weeks_ago,
    null
    ));

  //------------------------------------------------------------------------------
  // 過去７日間のリクエスト数の推移
  //------------------------------------------------------------------------------
  let data_last_week = getRawFirestoreData(setQueryFromTo(fromto_last_week));
  let data_two_weeks_ago = getRawFirestoreData(setQueryFromTo(fromto_two_weeks_ago));
  const stats = {};
  stats[fromto_last_week.date_from_formatted.slice(0, 10)] = { last_week:0, two_weeks_ago: 0 };

  let isoString = fromto_last_week.date_from_isoString;
  for (let i = 0; i < 6; i++) {
    // 1. ISO文字列をDateオブジェクトに変換
    let date = new Date(isoString);
    // 2. 1日加算する
    date.setDate(date.getDate() + 1);
    // 3. 再びISO文字列に変換して上書き
    isoString = date.toISOString();
    //console.log(`${i + 1}日後: ${isoString}`);
    stats[getDateFromISOString(isoString).slice(0, 10)] = { last_week:0, two_weeks_ago: 0 };
  }

  // 過去７日間のリクエスト数におけるキーワードヒットの割合
  let sum_keyword_last_week_all = 0;
  let sum_keyword_last_week = {};
  for (let i = 0; i < keywords.length; i++) {
    let val = keywords[i].value;
    sum_keyword_last_week[val] = 0;
  }
  // 過去７日間のリクエスト数における回答の割合
  let sum_answer_last_week = { yes: 0, no:0, other: 0 };
  // 過去７日間のリクエスト数におけるエラーの割合
  let sum_status_last_week = { error: 0, else:0, done: 0 };
  data_last_week.forEach(fields => {
    const date = getDateFromISOString(fields.receivedAt.timestampValue);
    //const date = fields.receivedAt.timestampValue.split('T')[0];
    stats[date.slice(0, 10)].last_week++;

    // 過去７日間のリクエスト数におけるキーワードヒットの割合
    const response = fields.response?.stringValue || "(nothing)";
    sum_keyword_last_week_all++;
    for (let i = 0; i < keywords.length; i++) {
      let val = keywords[i].value;
      if (response.includes(val)) {
        sum_keyword_last_week[val]++;
      }
    }
    // 過去７日間のリクエスト数における回答の割合
    const answer = fields.answer?.stringValue || "";
    if (answer === "yes") {
      sum_answer_last_week.yes++;
    } else if (answer === "no") {
      sum_answer_last_week.no++;
    } else {
      sum_answer_last_week.other++;
    }
    // 過去７日間のリクエスト数におけるエラーの割合
    const status = fields.status?.stringValue || "";
    if (status === "error") {
      sum_status_last_week.error++;
    } else if (status === "done") {
      sum_status_last_week.done++;
    } else {
      sum_status_last_week.else++;
    }
  });
  // 過去７日間のリクエスト数におけるキーワードヒットの割合
  let entries_sum_last_week = Object.entries(sum_keyword_last_week);
  entries_sum_last_week.sort((a, b) => {
    return b[1] - a[1]; // bの値 - aの値 が正ならbを前に持ってくる
  });
  let top10_sum_last_week = entries_sum_last_week.slice(0, 10);
  const pieChart_keyword_last_week = [['キーワード', '数']];
  top10_sum_last_week.forEach(row => {
    sum_keyword_last_week_all -= row[1];
    pieChart_keyword_last_week.push([row[0], row[1]]);
  });
  // 過去７日間のリクエスト数における回答の割合
  const pieChart_answer_last_week = [
    ['回答', '数'],
    ['はい', sum_answer_last_week.yes],
    ['いいえ', sum_answer_last_week.no],
    ['未回答', sum_answer_last_week.other],
  ];
  // 過去７日間のリクエスト数におけるエラーの割合
  const pieChart_status_last_week = [
    ['error', '数'],
    ['error', sum_status_last_week.error],
    ['else', sum_status_last_week.else],
    ['done', sum_status_last_week.done],
  ];

  // 過去７日間(前の７日間)のリクエスト数におけるキーワードヒットの割合
  let sum_keyword_two_weeks_ago_all = 0;
  let sum_keyword_two_weeks_ago = {};
  for (let i = 0; i < keywords.length; i++) {
    let val = keywords[i].value;
    sum_keyword_two_weeks_ago[val] = 0;
  }
  // 過去７日間(前の７日間)のリクエスト数における回答の割合
  let sum_answer_two_weeks_ago = { yes: 0, no:0, other: 0 };
  // 過去７日間(前の７日間)のリクエスト数におけるエラーの割合
  let sum_status_two_weeks_ago = { error: 0, else:0, done: 0 };
  data_two_weeks_ago.forEach(fields => {
    const date_prev = new Date(fields.receivedAt.timestampValue);
    const after7day = new Date(date_prev.getFullYear(), date_prev.getMonth(), date_prev.getDate() + 7);
    stats[getDateFromISOString(after7day).slice(0, 10)].two_weeks_ago++;

    // 過去７日間(前の７日間)のリクエスト数におけるキーワードヒットの割合
    const response = fields.response?.stringValue || "(nothing)";
    sum_keyword_two_weeks_ago_all++;
    for (let i = 0; i < keywords.length; i++) {
      let val = keywords[i].value;
      if (response.includes(val)) {
        sum_keyword_two_weeks_ago[val]++;
      }
    }
    // 過去７日間(前の７日間)のリクエスト数における回答の割合
    const answer = fields.answer?.stringValue || "";
    if (answer === "yes") {
      sum_answer_two_weeks_ago.yes++;
    } else if (answer === "no") {
      sum_answer_two_weeks_ago.no++;
    } else {
      sum_answer_two_weeks_ago.other++;
    }
    // 過去７日間(前の７日間)のリクエスト数におけるエラーの割合
    const status = fields.status?.stringValue || "";
    if (status === "error") {
      sum_status_two_weeks_ago.error++;
    } else if (status === "done") {
      sum_status_two_weeks_ago.done++;
    } else {
      sum_status_two_weeks_ago.else++;
    }
  });
  // 過去７日間(前の７日間)のリクエスト数におけるキーワードヒットの割合
  let entries_sum_two_weeks_ago = Object.entries(sum_keyword_two_weeks_ago);
  entries_sum_two_weeks_ago.sort((a, b) => {
    return b[1] - a[1]; // bの値 - aの値 が正ならbを前に持ってくる
  });
  let top10_sum_two_weeks_ago = entries_sum_two_weeks_ago.slice(0, 10);
  const pieChart_keyword_two_weeks_ago = [['キーワード', '数']];
  top10_sum_two_weeks_ago.forEach(row => {
    sum_keyword_two_weeks_ago_all -= row[1];
    pieChart_keyword_two_weeks_ago.push([row[0], row[1]]);
  });
  // 過去７日間(前の７日間)のリクエスト数における回答の割合
  const pieChart_answer_two_weeks_ago = [
    ['回答', '数'],
    ['はい', sum_answer_two_weeks_ago.yes],
    ['いいえ', sum_answer_two_weeks_ago.no],
    ['未回答', sum_answer_two_weeks_ago.other],
  ];
  // 過去７日間(前の７日間)のリクエスト数におけるエラーの割合
  const pieChart_status_two_weeks_ago = [
    ['error', '数'],
    ['error', sum_status_two_weeks_ago.error],
    ['else', sum_status_two_weeks_ago.else],
    ['done', sum_status_two_weeks_ago.done],
  ];

  // 過去７日間のリクエスト数の推移
  const chartData_last_week = [["日付", "リクエスト数", "リクエスト数(前の7日間)"]];
  const chartData_last_week_user = [["日付", "ユーザ数", "ユーザ数(前の7日間)"]];
  const sortedDates = Object.keys(stats).sort();
  sortedDates.forEach(date => {
    chartData_last_week.push([date, stats[date].last_week, stats[date].two_weeks_ago]);

    // 過去７日間のユーザ数の推移
    let fromto_date = getFromTo(new Date(date), new Date(date));
    let data = getRawFirestoreData(setQueryFromTo(fromto_date));
    let users = data.flatMap(doc => {
      const nameField = doc.request.mapValue.fields?.displayName;
      // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
      return nameField?.stringValue ? [nameField.stringValue] : ['名称未設定'];
    });
    let distinctUsers = [...new Set(users)];
    var user_num_to_date = distinctUsers.length;
    // 過去７日間(前の７日間)のユーザ数の推移
    // 一昨日
    const convDate = new Date(date);
    const before7day = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate() - 7);
    fromto_date = getFromTo(before7day, before7day);
    data = getRawFirestoreData(setQueryFromTo(fromto_date));
    users = data.flatMap(doc => {
      const nameField = doc.request.mapValue.fields?.displayName;
      // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
      return nameField?.stringValue ? [nameField.stringValue] : ['名称未設定'];
    });
    distinctUsers = [...new Set(users)];
    var user_num_to_date7 = distinctUsers.length;
    chartData_last_week_user.push([date, user_num_to_date, user_num_to_date7]);
  });

  return {
    request_num_to_today: request_num_to_today,
    request_num_last_month: request_num_last_month,
    request_num_yesterday: request_num_yesterday,
    request_num_before_yesterday: request_num_before_yesterday,
    user_num_to_today: user_num_to_today,
    user_num_last_month: user_num_last_month,
    request_num_last_week: request_num_last_week,
    request_num_two_weeks_ago: request_num_two_weeks_ago,
    chartData_last_week: chartData_last_week,
    chartData_last_week_user: chartData_last_week_user,
    pieChart_keyword_last_week,
    pieChart_keyword_two_weeks_ago,
    pieChart_answer_last_week,
    pieChart_answer_two_weeks_ago,
    pieChart_status_last_week,
    pieChart_status_two_weeks_ago,
  };
}

// パターン1：キーワードの集計
function getKeywordData(keyword) {
  //keyword = "該当なし";
  //console.log("keyword: ", keyword);
  const fromto = getOneMonthAgo();
  const data = getRawFirestoreData(setQueryFromTo(fromto));
  const stats = {};
  let stats_sum = { keyword: 0, other: 0 };
  const listData = [];
  
  stats[fromto.date_from_formatted.slice(0, 10)] = { all:0, keyword: 0 };
  data.forEach(fields => {
    const response = fields.response?.stringValue || "(nothing)";
    //console.log("response", response);
    const date = getDateFromISOString(fields.receivedAt.timestampValue).slice(0, 10);
    if (!stats[date]) stats[date] = { all:0, keyword: 0 };
    const request = fields.request.mapValue.fields;

    stats[date].all++;
    // 「すべて」が選択されたか、キーワードが含まれている場合にカウント
    if (!keyword || keyword === "すべて" || response.includes(keyword)) {
      //const date = fields.receivedAt.timestampValue.split('T')[0];
      stats[date].keyword = (stats[date].keyword || 0) + 1;
      stats_sum.keyword++;
      if (response.includes("該当なし")) {
        listData.push({
          docId: fields.docId,
          receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
          name: request?.displayName?.stringValue ?? "名称未設定",
          userMessage: request.userMessage?.stringValue ? request.userMessage?.stringValue : "(nothing)",
          content: response,
          //content: JSON.stringify(fields.error),
        });
      }
    }else{
      stats_sum.other++;
    }
  });

  // 時系列折れ線グラフ
  const chartData = [["日付", "全件", keyword]];
  const sortedDates = Object.keys(stats).sort();
  if (sortedDates.length === 0) {
    // データが1件もない場合、今日の日付で0件というダミーを入れることでエラーを回避
    const today = getDateFromISOString(new Date().toISOString()).slice(0, 10);
    //const today = new Date().toISOString().split('T')[0];
    chartData.push([today, 0, 0]);
  } else {
    sortedDates.forEach(date => {
      chartData.push([date, stats[date].all, stats[date].keyword]);
    });
  }
  if (!stats[fromto.date_to_formatted.slice(0, 10)]) stats[fromto.date_to_formatted.slice(0, 10)] = { all:0, keyword: 0 };

  // パーセンテージ
  var chartData2 = [
    ['Category', keyword, "その他"],
    ['比率', stats_sum.keyword, stats_sum.other] // 合計値は自動計算されるので実数でOK
  ];

  // 総数
  // keywordを含むか否かのクエリはFirestoreでは指定できない。

  var series = {
    0: { color: '#EA4335' }, // keyword（赤）
    1: { color: '#FBBC05' }, // その他（黄）
  };

  const displayTitle = (!keyword || keyword === "すべて") ? "全体の投稿件数推移" : `キーワード「${keyword}」の推移`;

  return {
    fromto: fromto, 
    chartData: chartData, 
    chartData2: chartData2, 
    series: series, 
    listData: listData, 
    title: displayTitle,
    keyword: keyword
  };
}

// パターン2：回答傾向（はい・いいえ・未回答）の集計
function getAnswerData() {
  const fromto = getOneMonthAgo();
  const data = getRawFirestoreData(setQueryFromTo(fromto));
  const stats = {};
  let stats_sum = { yes: 0, no:0, other: 0 };
  const listData_no = [];
  const listData_other = [];
  
  stats[fromto.date_from_formatted.slice(0, 10)] = { all:0, yes: 0, no: 0, other: 0 };
  data.forEach(fields => {
    const answer = fields.answer?.stringValue || "";
    const date = getDateFromISOString(fields.receivedAt.timestampValue).slice(0, 10);
    //const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, yes: 0, no: 0, other: 0 };
    const request = fields.request.mapValue.fields;
    const response = fields.response?.stringValue || "(nothing)";

    stats[date].all++;
    if (answer === "yes") {
      stats[date].yes++;
      stats_sum.yes++;
    } else if (answer === "no") {
      stats[date].no++;
      stats_sum.no++;
        listData_no.push({
          docId: fields.docId,
          receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
          name: request?.displayName?.stringValue ?? "名称未設定",
          userMessage: request.userMessage?.stringValue ? request.userMessage?.stringValue : "(nothing)",
          content: response,
          reason: fields.reason?.stringValue || "(nothing)",
          //content: JSON.stringify(fields.error),
        });
    } else {
      stats[date].other++;
      stats_sum.other++;
        listData_other.push({
          docId: fields.docId,
          receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
          name: request?.displayName?.stringValue ?? "名称未設定",
          userMessage: request.userMessage?.stringValue ? request.userMessage?.stringValue : "(nothing)",
          content: response,
          //content: JSON.stringify(fields.error),
        });
    }
  });

  // 時系列折れ線グラフ
  const chartData = [["日付", "全件", "はい", "いいえ", "未回答"]];
  Object.keys(stats).sort().forEach(date => {
    chartData.push([date, stats[date].all, stats[date].yes, stats[date].no, stats[date].other]);
  });
  if (!stats[fromto.date_to_formatted.slice(0, 10)]) stats[fromto.date_to_formatted.slice(0, 10)] = { all:0, yes: 0, no: 0, other: 0 };

  // パーセンテージ
  var chartData2 = [
    ['Category', 'はい', 'いいえ', '未回答'],
    ['比率', stats_sum.yes, stats_sum.no,stats_sum.other] // 合計値は自動計算されるので実数でOK
  ];

  var series = {
    0: { color: '#EA4335' }, // はい（赤）
    1: { color: '#FBBC05' }, // いいえ（黄）
    2: { color: '#34A853' }  // 未回答（緑）
  };

  return {
    fromto: fromto, 
    chartData: chartData, 
    chartData2: chartData2, 
    series: series, 
    listData_no: listData_no, 
    listData_other: listData_other, 
    title: '問題解決の回答傾向の時系列推移'
  };
}

// パターン3：異常終了の集計
function getStatusData() {
  const fromto = getOneMonthAgo();
  const data = getRawFirestoreData(setQueryFromTo(fromto));
  const stats = {};
  let stats_sum = { error: 0, received: 0, done: 0 };
  const listData_error = [];
  const listData_received = [];

  stats[fromto.date_from_formatted.slice(0, 10)] = { all:0, error: 0, received: 0, done: 0 };
  data.forEach(fields => {
    //console.log(fields);
    const status = fields.status?.stringValue || "";
    const date = getDateFromISOString(fields.receivedAt.timestampValue).slice(0, 10);
    //const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, error: 0, received: 0, done: 0 };
    const request = fields.request.mapValue.fields;
    const error = fields.error.mapValue.fields;

    stats[date].all++;
    if (status === "error") {
      stats[date].error++;
      stats_sum.error++;
      listData_error.push({
        docId: fields.docId,
        receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
        name: request?.displayName?.stringValue ?? "名称未設定",
        userMessage: request.userMessage?.stringValue ? request.userMessage?.stringValue : "(nothing)",
        content: error.message?.stringValue ? error.message?.stringValue : "(nothing)",
        //content: JSON.stringify(fields.error),
      });
    } else if (status === "done") {
      stats[date].done++;
      stats_sum.done++;
    } else {
      stats[date].received++;
      stats_sum.received++;
      listData_received.push({
        docId: fields.docId,
        receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
        name: request?.displayName?.stringValue ?? "名称未設定",
        userMessage: request.userMessage?.stringValue ? request.userMessage?.stringValue : "(nothing)",
        content: error.message?.stringValue ? error.message?.stringValue : "(nothing)",
        //content: JSON.stringify(fields.error),
      });
    }
  });

  // 折れ線グラフ
  const chartData = [["日付", "全件", "error", "else", "done"]];
  Object.keys(stats).sort().forEach(date => {
    chartData.push([date, stats[date].all, stats[date].error, stats[date].received, stats[date].done]);
  });
  if (!stats[fromto.date_to_formatted.slice(0, 10)]) stats[fromto.date_to_formatted.slice(0, 10)] = { all:0, error: 0, received: 0, done: 0 };

  // パーセンテージ
  var chartData2 = [
    ['Category', 'error', 'else', 'done'],
    ['比率', stats_sum.error, stats_sum.received, stats_sum.done] // 合計値は自動計算されるので実数でOK
  ];

  var series = {
    0: { color: '#EA4335' }, // error（赤）
    1: { color: '#FBBC05' }, // received（黄）
    2: { color: '#34A853' }  // done（緑）
  };

  return {
    fromto: fromto, 
    chartData: chartData, 
    chartData2: chartData2, 
    series: series, 
    listData_error: listData_error, 
    listData_received: listData_received, 
    title: '異常終了の時系列推移'
  };
}

// 共通：Firestoreから生データを取得する
function getRawFirestoreData(queryPayload) {
  const token = ScriptApp.getOAuthToken();
  // 1. URLを「runQuery」エンドポイントに変更
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  // 4. UrlFetchAppでPOSTリクエストを送信
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + token },
    payload: JSON.stringify(queryPayload),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const results = JSON.parse(response.getContentText());
  // runQueryの結果は配列で返ってくるため、各要素の document.fields を抽出
  // ※結果が空の場合は [{}] のような形で返ることがあるためフィルタリング
  return results
    .filter(result => result.document)
    .map(result => {
      // fields（データ本体）を展開し、そこに docId を追加して返す
      const fields = result.document.fields;
      const fullPath = result.document.name;
      const docId = fullPath.split('/').pop(); // パスの最後からIDを抽出

      return {
        docId: docId,      // ドキュメントID
        namePath: fullPath, // フルパスが必要な場合はこれも保持
        ...fields           // 既存のフィールドデータを展開
      };
    });
  /*
  return results
    .filter(result => result.document)
    .map(result => result.document.fields);
  */
}
/*
function getRawFirestoreData() {
  const projectId = "sun-internal-chat";
  const collectionName = "chat_logs";
  const token = ScriptApp.getOAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}`;
  const response = UrlFetchApp.fetch(url, { headers: { "Authorization": "Bearer " + token } });
  const json = JSON.parse(response.getContentText());
  return json.documents ? json.documents.map(doc => doc.fields) : [];
}
*/

function getRecordCountFirestoreData(queryPayload) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runAggregationQuery`;
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + token },
    payload: JSON.stringify(queryPayload),
    muteHttpExceptions: true
  };
  const response = UrlFetchApp.fetch(url, options);
  const results = JSON.parse(response.getContentText());
  // 結果の取り出し（aggregationResultsという配列の中に数値が入ってきます）
  const count = results[0].result.aggregateFields.total_count;
  //console.log("該当レコード数: " + count);
  return Number(count.integerValue);
}

function getFormattedDate(val) {
  return Utilities.formatDate(val, "JST", "yyyy-MM-dd HH:mm:ss");
}

function getIsoFromDate(val) {
  return val.toISOString();
}

function getDateFromISOString(val){
  var dateObj = new Date(val);
  return Utilities.formatDate(dateObj, "JST", "yyyy-MM-dd HH:mm:ss");
}

function getFromTo(date_from, date_to) {
  const fromDate = new Date(date_from);
  const startDate = new Date(fromDate.setHours(0, 0, 0, 000));
  const toDate = new Date(date_to);
  const endDate = new Date(toDate.setHours(23, 59, 59, 999));
  var date_from_formatted = getFormattedDate(startDate);
  var date_from_isoString = getIsoFromDate(startDate);
  var date_to_formatted = getFormattedDate(endDate);
  var date_to_isoString = getIsoFromDate(endDate);
  return {
    date_from_formatted: date_from_formatted,
    date_from_isoString: date_from_isoString,
    date_to_formatted: date_to_formatted,
    date_to_isoString: date_to_isoString
  };
}

function getOneMonthAgo() {
  var now = new Date();
  var oneMonthAgo = new Date();

  var now_formatted =getFormattedDate(now);
  var now_isoString = getIsoFromDate(now);

  //日時を 2026-02-03T12:36:03.569Z 形式にする
  // 引数：(日付オブジェクト, タイムゾーン, フォーマット)
  //var formattedDate = Utilities.formatDate(now, "JST", "yyyy-MM-dd HH:mm:ss");

  //ISO形式の文字列（Z付き）を変換したい場合
  //var isoStr = "2026-02-03T12:36:03.569Z";
  //var dateObj = new Date(isoStr);
  //var result = Utilities.formatDate(dateObj, "JST", "yyyy-MM-dd HH:mm:ss");
  //console.log(result); // "2026-02-03 21:36:03"

  // 1か月前を設定
  oneMonthAgo.setMonth(now.getMonth() - 1);
  //console.log(oneMonthAgo);
  var oneMonthAgo_formatted = getFormattedDate(oneMonthAgo);
  var oneMonthAgo_isoString = getIsoFromDate(oneMonthAgo);

  return {
    date_from_formatted: oneMonthAgo_formatted,
    date_from_isoString: oneMonthAgo_isoString,
    date_to_formatted: now_formatted,
    date_to_isoString: now_isoString
  };
}

function setQueryFromTo(fromto){
  // 2. 検索範囲の設定（ISO8601形式の文字列）
  // 3. クエリ（JSON）の作成
  let structuredQuery = {
    from: [{ collectionId: COLLECTION_NAME }],
    orderBy: [
      {
        field: { fieldPath: "receivedAt" },
        direction: "ASCENDING"
      }
    ]
  };

  if (fromto) {
    structuredQuery.where = 
    {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "receivedAt" },
              op: "GREATER_THAN_OR_EQUAL",
              value: { timestampValue: fromto.date_from_isoString }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: "receivedAt" },
              op: "LESS_THAN_OR_EQUAL",
              value: { timestampValue: fromto.date_to_isoString }
            }
          }
        ]
      }
    };
  }

  // 3. 最終的なリクエスト用オブジェクトに含める
  return queryPayload = {
    structuredQuery: structuredQuery
  };
}

function setQueryRecordCount(fromto, filters) {
  let structuredQuery = {
    from: [{ collectionId: COLLECTION_NAME }],
  };

  let myFilters = [];
  var op = "AND";
  if (filters) {
    myFilters.push(filters);
  }
  if (fromto){
    myFilters.push({
      fieldFilter: {
        field: { fieldPath: "receivedAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { timestampValue: fromto.date_from_isoString }
      }
    });
    myFilters.push({
      fieldFilter: {
        field: { fieldPath: "receivedAt" },
        op: "LESS_THAN_OR_EQUAL",
        value: { timestampValue: fromto.date_to_isoString }
      }
    });
  }
  /*
  if (myFilters.length < 2) {
    op = "OR";
  }
  */
  if (myFilters) {
    structuredQuery.where = 
    {
      compositeFilter: {
        op: op,
        filters: myFilters
      }
    };
  }

  //console.log(myFilters);
  return queryPayload = {
    structuredAggregationQuery: {
      structuredQuery: structuredQuery,
      // 件数を集計するための設定
      aggregations: [
        {
          count: {},
          alias: "total_count"
        }
      ]
    }
  };
}

function getFirestoreDataForDownload() {
  // 1. Firestoreからデータを抽出（これまでのクエリ処理）
  //const fromto = getOneMonthAgo();
  const rawData = getRawFirestoreData(setQueryFromTo(null));
  
// 2. データの整形
  // rawData が null や空配列の場合を考慮し、map処理の前に存在確認をします
  if (!rawData || rawData.length === 0) {
    return ""; // データがない場合は空文字を返す
  }

  // 各レコードの fields 部分を抽出し、JSON文字列化して改行で連結
  const formattedData = rawData.map(doc => {
    // doc.fields が存在するかチェック（万が一のデータ不備対策）
    return doc.fields ? doc.fields : doc;
  });
    /*
    const content = doc.fields ? doc.fields : doc; 
    return JSON.stringify(content);
  }).join("\n");
  */

  return JSON.stringify(formattedData);
  //return formattedData;
}
