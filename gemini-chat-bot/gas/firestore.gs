const PROJECT_ID = "sun-internal-chat";
const COLLECTION_NAME = "chat_logs";
const COLLECTION_NAME_7DAYS_SUMMARY = "7days_summary";

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
    COLLECTION_NAME,
    fromto_to_today,
    null
    ));
  var request_num_last_month = getRecordCountFirestoreData(setQueryRecordCount(
    COLLECTION_NAME,
    fromto_last_month,
    null
    ));

  //------------------------------------------------------------------------------
  // 昨日のリクエスト数
  //------------------------------------------------------------------------------
  var request_num_yesterday = getRecordCountFirestoreData(setQueryRecordCount(
    COLLECTION_NAME,
    fromto_yesterday,
    null
    ));
  var request_num_before_yesterday = getRecordCountFirestoreData(setQueryRecordCount(
    COLLECTION_NAME,
    fromto_beforeYesterday,
    null
    ));

  //------------------------------------------------------------------------------
  // 今月初めから今日までの総ユーザ数
  // 対象範囲で全件取得して「氏名」で重複排除する。
  //------------------------------------------------------------------------------
  let data = getRawFirestoreData(setQueryFromTo(COLLECTION_NAME, fromto_to_today));
  let users = data.flatMap(doc => {
    const nameField = doc.request.mapValue.fields?.displayName;
    // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
    return nameField?.stringValue ? [nameField.stringValue] : ['名称未設定'];
  });
  let distinctUsers = [...new Set(users)];
  var user_num_to_today = distinctUsers.length;

  data = getRawFirestoreData(setQueryFromTo(COLLECTION_NAME, fromto_last_month));
  users = data.flatMap(doc => {
    const nameField = doc.request.mapValue.fields?.displayName;
    // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
    return nameField?.stringValue ? [nameField.stringValue] : ['名称未設定'];
  });
  distinctUsers = [...new Set(users)];
  var user_num_last_month = distinctUsers.length;

  //------------------------------------------------------------------------------
  // 過去１週間の集計を取得
  //------------------------------------------------------------------------------
  let request_num_last_week = 0;
  let request_num_two_weeks_ago = 0;
  let chartData_last_week = [];
  let chartData_last_week_user = [];
  let pieChart_keyword_last_week = [];
  let pieChart_keyword_two_weeks_ago = [];
  let pieChart_answer_last_week = [];
  let pieChart_answer_two_weeks_ago = [];
  let pieChart_status_last_week = [];
  let pieChart_status_two_weeks_ago = [];

  data = getRawFirestoreData(setQueryFromTo_summary(COLLECTION_NAME_7DAYS_SUMMARY, getFromTo(fromto_last_week.date_from_formatted, fromto_last_week.date_to_formatted)));
  data.forEach(fields => {
    request_num_last_week = fields.request_num_last_week.integerValue;
    request_num_two_weeks_ago = fields.request_num_two_weeks_ago.integerValue;
    chartData_last_week = JSON.parse(fields.chartData_last_week.stringValue);
    chartData_last_week_user = JSON.parse(fields.chartData_last_week_user.stringValue);
    pieChart_keyword_last_week = JSON.parse(fields.pieChart_keyword_last_week.stringValue);
    pieChart_keyword_two_weeks_ago = JSON.parse(fields.pieChart_keyword_two_weeks_ago.stringValue);
    pieChart_answer_last_week = JSON.parse(fields.pieChart_answer_last_week.stringValue);
    pieChart_answer_two_weeks_ago = JSON.parse(fields.pieChart_answer_two_weeks_ago.stringValue);
    pieChart_status_last_week = JSON.parse(fields.pieChart_status_last_week.stringValue);
    pieChart_status_two_weeks_ago = JSON.parse(fields.pieChart_status_two_weeks_ago.stringValue);
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
    pieChart_keyword_last_week: pieChart_keyword_last_week,
    pieChart_keyword_two_weeks_ago: pieChart_keyword_two_weeks_ago,
    pieChart_answer_last_week: pieChart_answer_last_week,
    pieChart_answer_two_weeks_ago: pieChart_answer_two_weeks_ago,
    pieChart_status_last_week: pieChart_status_last_week,
    pieChart_status_two_weeks_ago: pieChart_status_two_weeks_ago,
  };
}

// パターン1：キーワードの集計
function getKeywordData(keyword) {
  //keyword = "該当なし";
  //console.log("keyword: ", keyword);
  const fromto = getOneMonthAgo();
  const data = getRawFirestoreData(setQueryFromTo(COLLECTION_NAME, fromto));
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
  const data = getRawFirestoreData(setQueryFromTo(COLLECTION_NAME, fromto));
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
  const data = getRawFirestoreData(setQueryFromTo(COLLECTION_NAME, fromto));
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

function getFromTo_noTime(date_from, date_to) {
  const fromDate = new Date(date_from);
  const startDate = new Date(fromDate.setHours(0, 0, 0, 000));
  const toDate = new Date(date_to);
  const endDate = new Date(toDate.setHours(0, 0, 0, 000));
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

function setQueryFromTo(collection_name, fromto){
  // 2. 検索範囲の設定（ISO8601形式の文字列）
  // 3. クエリ（JSON）の作成
  let structuredQuery = {
    from: [{ collectionId: collection_name }],
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
              value: { timestampValue: new Date(fromto.date_from_formatted).toISOString() }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: "receivedAt" },
              op: "LESS_THAN_OR_EQUAL",
              value: { timestampValue: new Date(fromto.date_to_formatted).toISOString() }
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

function setQueryFromTo_summary(collection_name, fromto){
  // 2. 検索範囲の設定（ISO8601形式の文字列）
  // 3. クエリ（JSON）の作成
  let structuredQuery = {
    from: [{ collectionId: collection_name }],
    orderBy: [
      {
        field: { fieldPath: "from" },
        direction: "ASCENDING"
      }
    ]
  };

  //console.log('fromto.date_from_formatted: ', new Date(fromto.date_from_formatted).toISOString() );
  //console.log('fromto.date_to_formatted: ', new Date(fromto.date_to_formatted).toISOString() );

  if (fromto) {
    structuredQuery.where = 
    {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "from" },
              //op: "EQUAL",
              op: "GREATER_THAN_OR_EQUAL",
              value: { timestampValue: new Date(fromto.date_from_formatted).toISOString() }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: "to" },
              op: "LESS_THAN_OR_EQUAL",
              value: { timestampValue: new Date(fromto.date_to_formatted).toISOString() }
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

function setQueryRecordCount(collection_name, fromto, filters) {
  let structuredQuery = {
    from: [{ collectionId: collection_name }],
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
        value: { timestampValue: new Date(fromto.date_from_formatted).toISOString() }
      }
    });
    myFilters.push({
      fieldFilter: {
        field: { fieldPath: "receivedAt" },
        op: "LESS_THAN_OR_EQUAL",
        value: { timestampValue: new Date(fromto.date_to_formatted).toISOString() }
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
  const rawData = getRawFirestoreData(setQueryFromTo(COLLECTION_NAME, null));
  
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
