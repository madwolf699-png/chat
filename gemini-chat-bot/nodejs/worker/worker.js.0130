// Workspace Add-on通知用
import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from  "@google-cloud/storage";
import kuromoji from "kuromoji";
//import TinySegmenter from "tiny-segmenter";
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

/* ========= Express ========== */
const app = express();
app.use(express.json());

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
  scopes: ["https://www.googleapis.com/auth/chat.bot"]
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

/* ========= spreadSheetの読み込み ========= */
let cachedRules = null;
async function readFromSheet() {
  try {
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
  } catch (err) {
    console.error("------ エラー発生 ------\n", err);
  }
}
await readFromSheet();
/**/
let tokenizerPromise = null;
async function initTokenizer() {
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
  const tokenizer = await initTokenizer();
  const tokens = tokenizer.tokenize(text);
  //console.log("------ tokens ------\n", tokens);
  const keywords = tokens
  .filter(t =>
     t.pos === "名詞"
     // ||
     //(t.pos === "動詞" && t.basic_form)
    )
  .map(t => t.basic_form || t.surface_form);
  return keywords;
  //return tokens.map(t => t.surface_form);
}
/**/
/*
let segmenter = new TinySegmenter();
*/
async function searchRules(rules, question) {
  console.log("###### searchRules start ######");
  //console.log("----- question ------\n", question)
  const keywords = await tokenize(question);  // kuromoji
  //const keywords = segmenter.segment(question); // TinySegmenter
  //console.log("----- keywords ------\n", keywords)
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
async function sendToChat(spaceName, text) {
  try {
    console.log("###### sendToChat start ######");
    //console.log("------ 回答 -----\n", text);
    const authClient = await chatAuth.getClient();
    const accessToken = await authClient.getAccessToken();

    await fetch(
      `https://chat.googleapis.com/v1/${spaceName}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      }
    );
  } catch (err) {
    console.error("------ エラー発生 ------\n", err);
  }
}

/* ========= Chat API Endpoint ========= */
app.post("/", async(req, res) => {
  try {
    console.log("###### app.post start ######");
    // Pub/Sub ACK
    res
    .status(200)
    .set("Content-Type", "application/json")
    .send("{}");
    const message = Buffer.from(
      req.body.message.data,
      "base64"
    ).toString("utf8");
    const event = JSON.parse(message);
    /* ---- ユーザー入力取得（ここが最大の違い） ---- */
    const messagePayload = event.chat.messagePayload;
    //console.log("------ messagePayload ------\n", messagePayload);
    const userMessage = messagePayload?.message?.text;
    const spaceName = messagePayload?.space?.name;
    if (!userMessage || !spaceName) {
      console.error("Message or space missing");
      await sendToChat(spaceName, "Message or space missing");
    }

    await sendToChat(spaceName, "確認中です。少々お待ちください。");
    /* --- Spreadsheet から補足情報を取得 --- */
    /**/
    const rules = await readFromSheet();
    // speadSheeetの内容から簡易検索
    const related  = await searchRules(rules, userMessage);
    //console.log("------ related ------\n", related);
    INTERNAL_RULES =  `
    【社内規定データ】
    ${related}
    `;
    /**/
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
    const answer = result.response.text();
    console.log("------ Gemini API end ------");
    /* --- Chat API で後送 --- */
    await sendToChat(spaceName, answer);

    //res.status(204).send(); // Pub/Sub ACK

  } catch (err) {
    console.error("------ エラー発生 ------\n", err);
    //console.error("ERROR:", err);
    //await sendToChat(spaceName, "エラーが発生しました。管理本部へお問い合わせください。");
  }
});
/* ========= 管理者用 ========= */
app.post("/reload", async(req, res) => {
  try {
    cachedRules = null;
    await readFromSheet();
    res.send("reloaded");
  } catch (err) {
    console.error("------ エラー発生 ------\n", err);
  }
});

/* ========= Server ========= */
/**/
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Google Chat Worker listening on port ${port}`);
});
/**/

/* ========= テスト ======== */
/*
const rules = await readFromSheet();
//const question = "長期休暇を取りたいのですが";
const question = "喫煙は大丈夫ですか";
const related  = await searchRules(rules, question);
console.log("------ related ------\n", related);
INTERNAL_RULES =  `
【社内規定データ】
${related}
`;
console.log("------ INTERNAL_RULES ------ \n", INTERNAL_RULES);
console.log("------ Gemini API start ------");
const result = await model.generateContent({
    contents: [
        {
        role: "user",
        parts: [
            {
            text: INTERNAL_RULES + "\n\n【質問】\n" + question
            }
        ]
        }
    ]
});
const answer = result.response.text();
console.log("------ Gemini API end ------");
console.log("------ answer ------\n", answer);
*/
