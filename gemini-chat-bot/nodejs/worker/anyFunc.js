// Workspace Add-on通知用
import "dotenv/config";
import fetch from "node-fetch";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import kuromoji from "kuromoji";
//import TinySegmenter from "tiny-segmenter";
import { Firestore } from "@google-cloud/firestore";
//import admin from "firebase-admin";
//import {GoogleAuth} from "google-auth-library";

/*
① ナレッジ連携 (RAG機能)
社員からの質問を受け取った際、GASがナレッジ用スプレッドシートの全内容（または関連性の高い行）を取得し、Geminiへのプロンプトに結合すること。
スプレッドシートの構造：[カテゴリ / 質問のキーワード / 詳細な回答・ルール] の3列構成を想定。
② プロンプトエンジニアリングの指示
Geminiへのシステムプロンプト（指示文）には以下を盛り込むこと：
あなたは当社の「管理本部アシスタント」です。
提供された【社内規定データ】のみに基づいて回答してください。
データに答えがない場合は、勝手に推測せず「分かりかねるため、直接管理本部へお問い合わせください」と丁寧に回答してください。
社員の言い回し（例：「身内が亡くなった」）を、規定上の用語（例：「慶弔休暇」）に読み替えて解釈してください。
③ セキュリティ・プライバシー設定
学習のオフ： Google AI Studioの有料プラン（Pay-as-you-go）を利用し、入力データがモデルの学習に使用されない設定にすること。
*/

const SYSTEM_PROMPT = `
あなたは当社の「管理本部アシスタント」です。
提供された【社内規定データ】のみに基づいて回答してください。
データに答えがない場合は、勝手に推測せず
「分かりかねるため、直接管理本部へお問い合わせください」
と丁寧に回答してください。
社員の言い回し（例：「身内が亡くなった」）を、
規定上の用語（例：「慶弔休暇」）に読み替えて解釈してください。
`;
const FIXED_PHRASE = `
回答は必ず以下の形式で行ってください。

【該当規定】
（規定名を記載。該当がない場合は「該当なし」）

【回答】
（規定文をそのまま、または要約して記載）

【補足】
（必要な場合のみ記載。推測は禁止）
`;
let INTERNAL_RULES = `
【社内規定データ】
・慶弔休暇：配偶者・一親等親族が亡くなった場合、3日間取得可能
・有給休暇：入社6か月後より付与
`; // ← 実際はSpreadsheet等から取得してもOK

/* ========= Gemini ========= */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  //model: "gemini-2.5-flash",
  model: "gemini-2.5-pro",
  systemInstruction: {
    role: "system",
    parts: [
      { text: SYSTEM_PROMPT + FIXED_PHRASE }
    ]
  }});

/* ========= Google Chat ========= */
const chatAuth = new google.auth.GoogleAuth({
  scopes: [
    "https://www.googleapis.com/auth/chat.bot",
    "https://www.googleapis.com/auth/chat.messages.create",
  ]
});

/* ========= Google Sheets ========= */
const embedModel = genAI.getGenerativeModel({
  model: "text-embedding-004",
})
/*
const storage = new Storage();
const bucket = storage.bucket("gemini-sheet-bucket");
*/
const sheetsAuth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
});
//console.log('GOOGLE_APPLICATION_CREDENTIALS=', process.env.GOOGLE_APPLICATION_CREDENTIALS);
const sheets = google.sheets({ version: "v4", auth: sheetsAuth  });

/* ========= Firestore ========= */
console.log("FIRESTORE_DOC=", process.env.FIRESTORE_DOC);
console.log("PROJECT_ID=", process.env.PROJECT_ID);
//console.log("SERVICE=", process.env.K_SERVICE);
//console.log("REVISION=", process.env.K_REVISION);
/**/
const db = new Firestore({
  maxRetries: 0,
  timeout: 3000,
  projectId: process.env.PROJECT_ID,
  databaseId: "(default)",
  preferRest: true,
});
/**/
/*
await db.collection("_healthcheck").add({
  ok: true,
  at: new Date()
});
*/
/*
admin.initializeApp({
  projectId: process.env.PROJECT_ID,
  credential:  admin.credential.applicationDefault(),
});
export const db = admin.firestore();
db.settings({
  databaseId: "(default)",
});
*/
/*
const auth = new GoogleAuth();
const projectId = await auth.getProjectId();
console.log("AUTH projectId: ", projectId);
const res = await fetch("https://firestore.googleapis.com");
console.log("status: ", res.status);
*/

/* ========= spreadSheetの読み込み ========= */
let cachedRules = null;
export function setCachedRules(newValue){
  cachedRules = newValue;
}
export async function readFromSheet() {
  console.log("###### readFromSheet start ######");
  if (cachedRules) return cachedRules;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: "ナレッジデータ!A2:C"
  });
  const rows = response.data.values || [];
  //console.log("------ rows -----\n", rows);
  cachedRules = rows.map(row => ({
    category: row[0],
    title: row[1],
    body: row[2]
  }));
  return cachedRules;
}
await readFromSheet();
/**/
let tokenizerPromise = null;
export async function initTokenizer() {
  console.log("###### initTokenizer start ######");
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({
        dicPath: "node_modules/kuromoji/dict"
      }).build((err, tokenizer) => {
        if (err) {
          //console.log("------ err ------\n", err);
          reject(err);
        } else {
          //console.log("------ tokenizer ------\n", tokenizer);
          resolve(tokenizer);
        }
      })
    })
  }
  return tokenizerPromise;
}
await initTokenizer();
async function tokenize(text) {
  console.log("###### tokenize start ######");
  if (!text || typeof text != "string") return [];
  // 英数字を先に抽出
  const alphanumTokens = text.match(/[A-Za-z0-9]+/g) ?? [];
  const tokenizer = await initTokenizer();
  const tokens = tokenizer.tokenize(text);
  //console.log("------ tokens ------\n", tokens);
  const nounTokens = tokens
  .filter(t =>
    t.pos === "名詞"
    //&& t.pos_detail_1 === "固有名詞"
    //t.surface_form !== "*" // 念のため
    // ||
    //(t.pos === "動詞" && t.basic_form)
  )
  .map(t => t.surface_form);
  //.map(t => t.basic_form || t.surface_form);
  // マージ & 重複排除
  const keywords = [...new Set([
    ...alphanumTokens,
    ...nounTokens
  ])];
  return keywords;
  //return tokens.map(t => t.surface_form);
}
/**/
/*
let segmenter = new TinySegmenter();
*/
export async function searchRules(rules, question) {
  console.log("###### searchRules start ######");
  //console.log("----- question ------\n", question)
  const keywords = await tokenize(question);  // kuromoji
  //const keywords = segmenter.segment(question); // TinySegmenter
  console.log("----- keywords ------\n", keywords)
  const related = rules.filter(r =>
    keywords.some(k =>
    (r.title + r.body).includes(k)
    )
  ).slice(0, 10);
  //console.log("----- related ------\n", related);
  
  const result =
    related.length == 0
    ?
    "該当する社内規定が見つかりませんでした。"
    :
    related.map(r =>
      `■ ${r.title}\n${r.body}`
    ).join("\n\n")
    ;
  return result;
}

/* ========= Chat API 後送 ========= */
export async function sendToChat(spaceName, { text, cardsV2 }) {
  console.log("###### sendToChat start ######");
  //console.log("------ 回答 -----\n", text);
  const authClient = await chatAuth.getClient();
  const accessToken = await authClient.getAccessToken();

  const body = {};
  if (text) body.text = text;
  if (cardsV2) body.cardsV2 = cardsV2;
  try {
    const response = await fetch(
      `https://chat.googleapis.com/v1/${spaceName}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );
    /*
    console.log("Status:", response.status);
    console.log("OK:", response.ok);
    const result = await response.json();
    console.log("Response Body:", result);
    */
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}

export async function geminiApi(related, userMessage) {
  console.log("###### geminiApi start ######");
  INTERNAL_RULES =  `
    【社内規定データ】
    ${related}
    `;
    /**/
    //console.log("------ INTERNAL_RULES ------\n", INTERNAL_RULES);
    console.log("------ Gemini API start ------");
    const result = await model.generateContent({
        contents: [
            {
            role: "user",
            parts: [
                {
                text: INTERNAL_RULES + "\n\n【質問】\n" + userMessage
                }
            ]
            }
        ]
    });
    console.log("------ Gemini API end ------");
    return result.response.text();
}

export async function saveMessage(msg) {
  const doc = {
    request: {
      spaceName: msg?.space?.name,
      //displayName: msg?.sender?.displayName,
      //email: msg?.sender?.email,
      userMessage: msg?.message?.text,
    },
    response: {},
    error: {},
    status: "received",
    receivedAt: new Date(),
    sendedAt: "",
    updatedAt: ""
  }
  return await db.collection(process.env.FIRESTORE_DOC).add(doc);
}

export async function saveResponse(docRef, res) {
  await docRef.set({
      response: res, 
      status: "done",
      sendedAt: new Date(),
      updatedAt: new Date()
    },
    { merge: true }
  );
/*
  await db.collection(process.env.FIRESTORE_DOC)
    .doc(docRef.id)
    .update({
      response: res, 
      sendedAt: new Date()
    }, { merge: true });
*/
}

export async function saveError(docRef, err) {
  await docRef.set(
    {
      error: {
        message: err?.message ?? String(err),
        name: err?.name ?? null,
        stack: err?.stack ?? null
      },
      status: "error",
      updatedAt: new Date()
    },
    { merge: true }
  );
}

//export let docRef;

export async function saveChat(receivedAt, msg, answer, err, status) {
  console.log("###### saveChat start ######");
  //docRef = null;
  const doc = {
    request: {
      spaceName: msg?.space?.name ? msg?.space?.name : "",
      displayName: msg?.sender?.displayName ? msg?.sender?.displayName : "",
      //email: msg?.sender?.email,
      userMessage: msg?.text ? msg?.text : "",
    },
    response: answer ? answer : {},
    error: err ? {
        message: err?.message ?? String(err),
        name: err?.name ?? null,
        stack: err?.stack?.slice(0, 2000) ?? null
      } : {},
    status: status,
    isHit: answer ? (answer.includes("該当なし") ? false : true) : false,
    answer: "",
    reason: "",
    receivedAt: receivedAt,
    sendedAt: answer ? new Date() : "",
    updatedAt: answer || err  ? new Date() : ""
  }
  return await db.collection(process.env.FIRESTORE_DOC).add(doc);
}

export async function saveAnswer(docId, answer) {
  console.log("###### saveAnswer start ######");
  const docRef = db.collection(process.env.FIRESTORE_DOC).doc(docId);
  await docRef.set(
    {
      answer: answer,
      updatedAt: new Date()
    },
    { merge: true } // 既存のフィールドを保持したまま更新
  );
  /*
  await docRef.set(
    {
      answer: answer,
      updatedAt: new Date()
    },
    { merge: true }
  );
  */
}

export function setCardPayload(spaceName, threadName, docRef) {
  console.log("###### setCardPayload start ######");
  console.log("docRef.id =", docRef.id);
  //console.log("spaceName =", spaceName);
  //console.log("threadName =", threadName);
  //const docId = String(docRef.id);
  return (
    {
      parent: spaceName, // "spaces/XXXXX" の形式
      requestBody: {
        // スレッドを維持する場合に指定
        thread: { name: threadName }, 
        cardsV2: [
          {
            cardId: "confirm_" + Date.now(),
            card: {
              header: {
                title: "回答リクエスト",
                subtitle: "この問題は解決しましたか？",
              },
              sections: [
                {
                  widgets: [
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "はい",
                            onClick: {
                              action: {
                                function: "handle_yes",
                                parameters: [
                                  { key: "docId", value: docRef.id}
                                ]
                              }
                            },
                            // ボタンを強調する場合（マテリアルデザインの色指定）
                            color: { red: 0.18, green: 0.49, blue: 0.19, alpha: 1 }
                          },
                          {
                            text: "いいえ",
                            onClick: {
                              action: {
                                function: "handle_no",
                                parameters: [
                                  { key: "docId", value: docRef.id}
                                ]
                              }
                            },
                            color: { red: 0.8, green: 0.1, blue: 0.1, alpha: 1 }
                          }
                        ]
                      }
                    }
                  ]
                }
              ]
            }
          }
        ]
      }
    }
  );
}

export async function sendChatCard(payload) {
  console.log("###### sendChatCard start ######");
  // 1. 認証設定 (ADC: Application Default Credentials を使用)
  // Cloud Run上であれば自動でサービスアカウントが使用されます
  const authClient = await chatAuth.getClient();
  const credentials = await chatAuth.getCredentials();
  // サービスアカウントのメールアドレス（client_email）を表示
  //console.log("------ 使用中のサービスアカウント:", credentials.client_email);

  const chat = google.chat({ version: 'v1', auth: authClient });
  // 2. cardsV2 レスポンスの構築
  // 3. メッセージの送信
  try {
    const response = await chat.spaces.messages.create(payload);
    console.log('Message sent:', response.data.name);
  } catch (error) {
    console.error('Error sending message to Google Chat:', error);
  }
}

export async function saveReason(docId, reason) {
  console.log("###### saveReason start ######");
  const docRef = db.collection(process.env.FIRESTORE_DOC).doc(docId);
  await docRef.set(
    {
      reason: reason,
      updatedAt: new Date()
    },
    { merge: true } // 既存のフィールドを保持したまま更新
  );
}

async function getDocumentById(docId) {
  console.log("###### getDocumentById start ######");
  try {
    // 1. ドキュメントのリファレンスを取得
    const docRef = db.collection(process.env.FIRESTORE_DOC).doc(docId);
    // 2. データを取得
    const doc = await docRef.get();
   // 3. 存在チェック
    if (!doc.exists) {
      console.log('ドキュメントが見つかりませんでした');
      return null;
    }
    // 4. データの取り出し
    const data = doc.data();
    //console.log('取得したデータ:', data);
    return data;
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

export async function sendToWebhook(docId) {
  console.log("###### sendToWebhook start ######");
  const webhookUrl = process.env.WEBHOOK_URL;
  //console.log("webhookUrl:", webhookUrl);
  const doc = await getDocumentById(docId);
  const receivedAt = doc.receivedAt.toDate();
  const msg = `
回答「いいえ」に対する理由が入力されました。\n
■ID
${docId}\n
■受信日時
${receivedAt.toLocaleString('ja-JP')}\n
■氏名
${doc.request.displayName}\n
■質問
${doc.request.userMessage}\n
■回答
${doc.response}\n
■いいえの理由
${doc.reason}\n
`;

  const data = JSON.stringify({
    text: msg
  });
  console.log("data:", data);
  try {
    const response = await fetch(
      webhookUrl,
      {
        method: "POST",
        headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        //'Content-Length': data.length,
        },
        body: data
      }
    );
    /*
    console.log("Status:", response.status);
    console.log("OK:", response.ok);
    const result = await response.json();
    console.log("Response Body:", result);
    */
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}
