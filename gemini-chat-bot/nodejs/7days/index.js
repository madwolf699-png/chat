import "dotenv/config";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { Firestore, Timestamp } from "@google-cloud/firestore";

const firestore = new Firestore();

// 現在日
const now = new Date();
// 今月初日
const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
const fromto_to_today = getFromTo(firstDay, now);
console.log('fromto_to_today: ', fromto_to_today);
const year = now.getFullYear();
const month = now.getMonth(); // 今月のインデックス (0-11)
// 先月初日
const firstDayLastMonth = new Date(year, month - 1, 1);
//先月末日
const lastDayLastMonth = new Date(year, month, 0);
const fromto_last_month = getFromTo(firstDayLastMonth, lastDayLastMonth);
console.log('fromto_last_month: ', fromto_last_month);
// 昨日
const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
const fromto_yesterday = getFromTo(yesterday, yesterday);
console.log('fromto_yesterday: ', fromto_yesterday);
// 一昨日
const beforeYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
const fromto_beforeYesterday = getFromTo(beforeYesterday, beforeYesterday);
console.log('fromto_beforeYesterday: ', fromto_beforeYesterday);
const dayOfWeek = now.getDay(); // 日(0)〜土(6)
// 今週の月曜日を基準にするための差分を計算
// 日曜(0)の場合は -6、それ以外は -(dayOfWeek - 1)
const diffToMonday = (dayOfWeek === 0) ? -6 : -(dayOfWeek - 1);
const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
// --- 先週 (今週の月曜から 7日前〜1日前) ---
const lastWeekStart = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
const lastWeekEnd   = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 1);
const fromto_last_week = getFromTo(lastWeekStart, lastWeekEnd);
console.log('fromto_last_week: ', fromto_last_week);
// --- 先々週 (今週の月曜から 14日前〜8日前) ---
const beforeLastWeekStart = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 14);
const beforeLastWeekEnd   = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 8);
const fromto_two_weeks_ago = getFromTo(beforeLastWeekStart, beforeLastWeekEnd);
console.log('fromto_two_weeks_ago: ', fromto_two_weeks_ago);

//------------------------------------------------------------------------------
// 過去１週間のリクエスト数
//------------------------------------------------------------------------------
let request_num_last_week = await getRecordCountFirestoreData(setQueryRecordCount(
  fromto_last_week,
  null
  ));
let request_num_two_weeks_ago = await getRecordCountFirestoreData(setQueryRecordCount(
  fromto_two_weeks_ago,
  null
  ));

//------------------------------------------------------------------------------
// 過去７日間のリクエスト数の推移
//------------------------------------------------------------------------------
const keywords = [
  {key: "該当なし", value:"該当なし"},
  {key: "親族の不幸", value: "親族の不幸"},
  {key: "有給休暇", value: "有給休暇"},
  {key: "夏期休暇", value: "夏期休暇"},
  {key: "通勤手当", value: "通勤手当"},
  {key: "喫煙所", value: "喫煙所"},
  {key: "結婚の報告", value: "結婚の報告"},
  {key: "PCの故障", value: "PCの故障"},
  {key: "分別のルール", value: "分別のルール"},
  {key: "フレックス", value: "フレックス"},
  {key: "インシデント", value: "インシデント"},
  {key: "転居", value: "転居"},
  {key: "氏名を変更", value: "氏名を変更"},
  {key: "被扶養者", value: "被扶養者"},
  {key: "給与振込口座", value: "給与振込口座"},
  {key: "勤務表", value: "勤務表"},
  {key: "月次提出書類", value: "月次提出書類"},
  {key: "交通費", value: "交通費"},
  {key: "出張費", value: "出張費"},
  {key: "経費", value: "経費"},
  {key: "通勤費が変更", value: "通勤費が変更"},
  {key: "慶弔金", value: "慶弔金"},
  {key: "特別休暇", value: "特別休暇"},
  {key: "産休・育休", value: "産休・育休"},
]

let data_last_week = await getRawFirestoreData(setQueryFromTo(fromto_last_week));
let data_two_weeks_ago = await getRawFirestoreData(setQueryFromTo(fromto_two_weeks_ago));
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
//console.log('stats: ', stats);

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
  //console.log('fields: ', fields);
  const date = getDateFromISOString(fields.receivedAt.toDate());
  //const date = fields.receivedAt.timestampValue.split('T')[0];
  stats[date.slice(0, 10)].last_week++;

  // 過去７日間のリクエスト数におけるキーワードヒットの割合
  const response = fields.response ?  fields.response : "(nothing)";
  const str = JSON.stringify(response);
  //console.log('response: ', response);
  sum_keyword_last_week_all++;
  for (let i = 0; i < keywords.length; i++) {
    let val = keywords[i].value;
    if (str.includes(val)) {
      sum_keyword_last_week[val]++;
    }
  }
  // 過去７日間のリクエスト数における回答の割合
  const answer = fields.answer ? fields.answer : "";
  if (answer === "yes") {
    sum_answer_last_week.yes++;
  } else if (answer === "no") {
    sum_answer_last_week.no++;
  } else {
    sum_answer_last_week.other++;
  }
  // 過去７日間のリクエスト数におけるエラーの割合
  const status = fields.status ? fields.status : "";
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
  const date_prev = new Date(fields.receivedAt.toDate());
  const after7day = new Date(date_prev.getFullYear(), date_prev.getMonth(), date_prev.getDate() + 7);
  stats[getDateFromISOString(after7day).slice(0, 10)].two_weeks_ago++;

  // 過去７日間(前の７日間)のリクエスト数におけるキーワードヒットの割合
  const response = fields.response ? fields.response :  "(nothing)";
  const str = JSON.stringify(response);
  sum_keyword_two_weeks_ago_all++;
  for (let i = 0; i < keywords.length; i++) {
    let val = keywords[i].value;
    if (str.includes(val)) {
      sum_keyword_two_weeks_ago[val]++;
    }
  }
  // 過去７日間(前の７日間)のリクエスト数における回答の割合
  const answer = fields.answer ? fields.answer : "";
  if (answer === "yes") {
    sum_answer_two_weeks_ago.yes++;
  } else if (answer === "no") {
    sum_answer_two_weeks_ago.no++;
  } else {
    sum_answer_two_weeks_ago.other++;
  }
  // 過去７日間(前の７日間)のリクエスト数におけるエラーの割合
  const status = fields.status ? fields.status : "";
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
for (const date of sortedDates) {
  chartData_last_week.push([date, stats[date].last_week, stats[date].two_weeks_ago]);

  // 過去７日間のユーザ数の推移
  let fromto_date = getFromTo(new Date(date), new Date(date));
  let data = await getRawFirestoreData(setQueryFromTo(fromto_date));
  //console.log('data: ', data);
  let users = data.flatMap(doc => {
    //console.log('doc: ', doc);
    const nameField = doc.request.displayName;
    // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
    return nameField ? nameField : ['名称未設定'];
  });
  let distinctUsers = [...new Set(users)];
  var user_num_to_date = distinctUsers.length;
  // 過去７日間(前の７日間)のユーザ数の推移
  // 一昨日
  const convDate = new Date(date);
  const before7day = new Date(convDate.getFullYear(), convDate.getMonth(), convDate.getDate() - 7);
  fromto_date = getFromTo(before7day, before7day);
  data = await getRawFirestoreData(setQueryFromTo(fromto_date));
  users = data.flatMap(doc => {
    const nameField = doc.request.displayName;
    // nameFieldが { stringValue: "ユーザー名" } という構造なら .stringValue を取る
    return nameField ? nameField : ['名称未設定'];
  });
  distinctUsers = [...new Set(users)];
  var user_num_to_date7 = distinctUsers.length;
  chartData_last_week_user.push([date, user_num_to_date, user_num_to_date7]);
}

console.log('request_num_last_week: ', request_num_last_week);
console.log('request_num_two_weeks_ago: ', request_num_two_weeks_ago);
console.log('chartData_last_week: ', chartData_last_week);     
console.log('chartData_last_week_user: ', chartData_last_week_user);     
console.log('pieChart_keyword_last_week: ', pieChart_keyword_last_week); 
console.log('pieChart_keyword_two_weeks_ago: ', pieChart_keyword_two_weeks_ago);     
console.log('pieChart_answer_last_week: ', pieChart_answer_last_week);     
console.log('pieChart_answer_two_weeks_ago: ', pieChart_answer_two_weeks_ago);     
console.log('pieChart_status_last_week: ', pieChart_status_last_week);     
console.log('pieChart_status_two_weeks_ago: ', pieChart_status_two_weeks_ago);     

await upsertRawFirestoreData(
  sortedDates[0],
  sortedDates[sortedDates.length - 1],
  request_num_last_week,
  request_num_two_weeks_ago,
  chartData_last_week,
  chartData_last_week_user,
  pieChart_keyword_last_week,
  pieChart_keyword_two_weeks_ago,
  pieChart_answer_last_week,
  pieChart_answer_two_weeks_ago,
  pieChart_status_last_week,
  pieChart_status_two_weeks_ago
);

function getFormattedDate(val) {
  const date = new Date(val);
  const zonedDate = toZonedTime(date, 'Asia/Tokyo');
  return format(zonedDate, 'yyyy-MM-dd HH:mm:ss');
  //return Utilities.formatDate(val, "JST", "yyyy-MM-dd HH:mm:ss");
}

function getIsoFromDate(val) {
  return val.toISOString();
}

function getDateFromISOString(val){
  //console.log('val: ', val);
  var dateObj = new Date(val);
  const zonedDate = toZonedTime(dateObj, 'Asia/Tokyo');
  return format(zonedDate, 'yyyy-MM-dd HH:mm:ss');
  //return Utilities.formatDate(dateObj, "JST", "yyyy-MM-dd HH:mm:ss");
}

function getFromTo(date_from, date_to) {
  const fromDate = new Date(date_from);
  const startDate = new Date(fromDate.setHours(0, 0, 0, '0o0'));
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

function setQueryRecordCount(fromto, filters) {
  let myFilters = [];
  var op = "AND";
  if (filters) {
    myFilters.push(filters);
  }
  if (fromto){
    myFilters.push(
      { field: "receivedAt", op: ">=", value: Timestamp.fromDate(new Date(fromto.date_from_isoString)) }
    );
    myFilters.push(
      { field: "receivedAt", op: "<=", value: Timestamp.fromDate(new Date(fromto.date_to_isoString)) }
    );
  }

  //console.log('return: ', { and: myFilters });
  return { and: myFilters };
}

function setQueryFromTo(fromto){
  let myFilters = [];
  if (fromto){
    myFilters.push(
      { field: "receivedAt", op: ">=", value: Timestamp.fromDate(new Date(fromto.date_from_isoString)) }
    );
    myFilters.push(
      { field: "receivedAt", op: "<=", value: Timestamp.fromDate(new Date(fromto.date_to_isoString)) }
    );
  }

  //console.log('return: ', { and: myFilters });
  return { and: myFilters };
}

async function getRecordCountFirestoreData(conditions = {}) {
  let query = firestore.collection(process.env.FIRESTORE_DOC);
  if (conditions.and) {
    conditions.and.forEach(c => {
      //console.log('c: ', c)
      query = query.where(c.field, c.op, c.value);
    });
  }

  if (conditions.or) {
    const orFilters = conditions.or.map(c =>
      Filter.where(c.field, c.op, c.value)
    );

    query = query.where(Filter.or(...orFilters));
  }
  const snapshot = await query.count().get();
  //console.log('count: ', snapshot.data().count);
  return snapshot.data().count;
}

async function getRawFirestoreData(conditions = {}) {
  let query = firestore.collection(process.env.FIRESTORE_DOC);
  if (conditions.and) {
    conditions.and.forEach(c => {
      //console.log('c: ', c)
      query = query.where(c.field, c.op, c.value);
    });
  }

  if (conditions.or) {
    const orFilters = conditions.or.map(c =>
      Filter.where(c.field, c.op, c.value)
    );

    query = query.where(Filter.or(...orFilters));
  }
  const snapshot = await query.orderBy("receivedAt", "asc").get();
  const docs = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  //console.log('docs: ', docs);
  return docs;
}

async function upsertRawFirestoreData(
  from,
  to,
  request_num_last_week,
  request_num_two_weeks_ago,
  chartData_last_week,
  chartData_last_week_user,
  pieChart_keyword_last_week,
  pieChart_keyword_two_weeks_ago,
  pieChart_answer_last_week,
  pieChart_answer_two_weeks_ago,
  pieChart_status_last_week,
  pieChart_status_two_weeks_ago
) {
  const collectionRef = firestore.collection(process.env.FIRESTORE_SUMMARY);
  let query = firestore.collection(process.env.FIRESTORE_SUMMARY);
  const snapshot = await collectionRef
  .where("from", "==", new Date(from))
  .where("to", "==", new Date(to))
  .limit(1).get();
  const data = {
    from: new Date(from),
    to: new Date(to),
    request_num_last_week: request_num_last_week,
    request_num_two_weeks_ago: request_num_two_weeks_ago,
    chartData_last_week: JSON.stringify(chartData_last_week),
    chartData_last_week_user: JSON.stringify(chartData_last_week_user),
    pieChart_keyword_last_week: JSON.stringify(pieChart_keyword_last_week),
    pieChart_keyword_two_weeks_ago: JSON.stringify(pieChart_keyword_two_weeks_ago),
    pieChart_answer_last_week: JSON.stringify(pieChart_answer_last_week),
    pieChart_answer_two_weeks_ago: JSON.stringify(pieChart_answer_two_weeks_ago),
    pieChart_status_last_week: JSON.stringify(pieChart_status_last_week),
    pieChart_status_two_weeks_ago: JSON.stringify(pieChart_status_two_weeks_ago),    
  };
  if (snapshot.empty) {
    await collectionRef.add(data);
  } else {
    const docId = snapshot.docs[0].id;
    await collectionRef.doc(docId).set(data, { merge: true });
  }
}

