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

// パターン1：キーワードの集計
function getKeywordData(keyword) {
  //keyword = "転居（引っ越し）";
  console.log("keyword: ", keyword);
  const fromto = getOneMonthAgo();
  const data = getRawFirestoreData(setQueryFromTo(fromto));
  const stats = {};
  let stats_sum = { keyword: 0, other: 0 };
  const listData = [];
  
  stats[fromto.oneMonthAgo_isoString.split('T')[0]] = { all:0, keyword: 0 };
  data.forEach(fields => {
    const response = fields.response?.stringValue || "(nothing)";
    //console.log("response", response);
    const date = fields.receivedAt.timestampValue.split('T')[0];
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
          receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
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
    const today = new Date().toISOString().split('T')[0];
    chartData.push([today, 0, 0]);
  } else {
    sortedDates.forEach(date => {
      chartData.push([date, stats[date].all, stats[date].keyword]);
    });
  }
  if (!stats[fromto.now_isoString.split('T')[0]]) stats[fromto.now_isoString.split('T')[0]] = { all:0, keyword: 0 };

  // パーセンテージ
  var chartData2 = [
    ['Category', keyword, "その他"],
    ['タスク比率', stats_sum.keyword, stats_sum.other] // 合計値は自動計算されるので実数でOK
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
    title: displayTitle
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
  
  stats[fromto.oneMonthAgo_isoString.split('T')[0]] = { all:0, yes: 0, no: 0, other: 0 };
  data.forEach(fields => {
    const answer = fields.answer?.stringValue || "";
    const date = fields.receivedAt.timestampValue.split('T')[0];
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
          receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
          userMessage: request.userMessage?.stringValue ? request.userMessage?.stringValue : "(nothing)",
          content: response,
          //content: JSON.stringify(fields.error),
        });
    } else {
      stats[date].other++;
      stats_sum.other++;
        listData_other.push({
          receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
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
  if (!stats[fromto.now_isoString.split('T')[0]]) stats[fromto.now_isoString.split('T')[0]] = { all:0, yes: 0, no: 0, other: 0 };

  // パーセンテージ
  var chartData2 = [
    ['Category', 'はい', 'いいえ', '未回答'],
    ['タスク比率', stats_sum.yes, stats_sum.no,stats_sum.other] // 合計値は自動計算されるので実数でOK
  ];

  // 総数
  var sum_yes = getRecordCountFirestoreData(setQueryRecordCount(
    null,
    [
      {
        fieldFilter: {
          field: { fieldPath: "answer" }, // 任意のフィールド名
          op: "EQUAL",
          value: { stringValue: "yes" } // 一致させたい値
        }
      }
    ]));
  var sum_no = getRecordCountFirestoreData(setQueryRecordCount(
    null,
    [
      {
        fieldFilter: {
          field: { fieldPath: "answer" }, // 任意のフィールド名
          op: "EQUAL",
          value: { stringValue: "no" } // 一致させたい値
        }
      }
    ]));
  var sum_other = getRecordCountFirestoreData(setQueryRecordCount(
    null,
    [
      {
        fieldFilter: {
          field: { fieldPath: "answer" }, // 任意のフィールド名
          op: "NOT_IN", // ここがポイント
          value: {
            arrayValue: {
              values: [
                { stringValue: "yes" },
                { stringValue: "no" }
              ]
            }
          }
        }
      }
    ]));
  var chartData3 = [
    ['Category', 'はい', 'いいえ', '未回答'],
    ['タスク比率', sum_yes, sum_no, sum_other] // 合計値は自動計算されるので実数でOK
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
    chartData3: chartData3,
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

  stats[fromto.oneMonthAgo_isoString.split('T')[0]] = { all:0, error: 0, received: 0, done: 0 };
  data.forEach(fields => {
    //console.log(fields);
    const status = fields.status?.stringValue || "";
    const date = fields.receivedAt.timestampValue.split('T')[0];
    if (!stats[date]) stats[date] = { all:0, error: 0, received: 0, done: 0 };
    const request = fields.request.mapValue.fields;
    const error = fields.error.mapValue.fields;

    stats[date].all++;
    if (status === "error") {
      stats[date].error++;
      stats_sum.error++;
      listData_error.push({
        receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
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
        receivedAt: getDateFromISOString(fields.receivedAt.timestampValue),
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
  if (!stats[fromto.now_isoString.split('T')[0]]) stats[fromto.now_isoString.split('T')[0]] = { all:0, error: 0, received: 0, done: 0 };

  // パーセンテージ
  var chartData2 = [
    ['Category', 'error', 'else', 'done'],
    ['タスク比率', stats_sum.error, stats_sum.received, stats_sum.done] // 合計値は自動計算されるので実数でOK
  ];

  // 総数
  var sum_error = getRecordCountFirestoreData(setQueryRecordCount(
    null,
    [
      {
        fieldFilter: {
          field: { fieldPath: "status" }, // 任意のフィールド名
          op: "EQUAL",
          value: { stringValue: "error" } // 一致させたい値
        }
      }
    ]));
  var sum_done = getRecordCountFirestoreData(setQueryRecordCount(
    null,
    [
      {
        fieldFilter: {
          field: { fieldPath: "status" }, // 任意のフィールド名
          op: "EQUAL",
          value: { stringValue: "done" } // 一致させたい値
        }
      }
    ]));
  var sum_else = getRecordCountFirestoreData(setQueryRecordCount(
    null,
    [
      {
        fieldFilter: {
          field: { fieldPath: "status" }, // 任意のフィールド名
          op: "NOT_IN", // ここがポイント
          value: {
            arrayValue: {
              values: [
                { stringValue: "error" },
                { stringValue: "done" }
              ]
            }
          }
        }
      }
    ]));
  var chartData3 = [
    ['Category', 'error', 'else', 'done'],
    ['タスク比率', sum_error, sum_else, sum_done] // 合計値は自動計算されるので実数でOK
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
    chartData3: chartData3,
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
    .map(result => result.document.fields);
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
  console.log("該当レコード数: " + count);
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
    now_formatted: now_formatted,
    oneMonthAgo_formatted: oneMonthAgo_formatted,
    now_isoString: now_isoString,
    oneMonthAgo_isoString: oneMonthAgo_isoString
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
              value: { timestampValue: fromto.oneMonthAgo_isoString }
            }
          },
          {
            fieldFilter: {
              field: { fieldPath: "receivedAt" },
              op: "LESS_THAN_OR_EQUAL",
              value: { timestampValue: fromto.now_isoString }
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
        value: { timestampValue: fromto.oneMonthAgo_isoString }
      }
    });
    myFilters.push({
      fieldFilter: {
        field: { fieldPath: "receivedAt" },
        op: "LESS_THAN_OR_EQUAL",
        value: { timestampValue: fromto.now_isoString }
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

  console.log(myFilters);
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
  const data = rawData.map(doc => {
    // doc.fields が存在するかチェック（万が一のデータ不備対策）
    const content = doc.fields ? doc.fields : doc; 
    return JSON.stringify(content);
  }).join("\n");

  return data;
}
