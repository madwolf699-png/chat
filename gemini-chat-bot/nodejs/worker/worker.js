// Workspace Add-on通知用
import "dotenv/config";
import express from "express";
import {
  setCachedRules,
  readFromSheet,
  searchRules,
  saveChat,
  geminiApi,
  sendToChat,
  setConfirm,
  saveAnswer,
} from "./anyFunc.js";

/* ========= Express ========== */
const app = express();
app.use(express.json());

let docRef = null;

/* ========= Chat API Endpoint ========= */
app.post("/", async(req, res) => {
  let receivedAt;
  let messagePayload;
  let answer;
  try {
    console.log("###### app.post start ######");
    receivedAt = new Date();
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
    messagePayload = event.chat.messagePayload;
    //console.log("------ messagePayload ------\n", messagePayload);
    const userMessage = messagePayload?.message?.text;
    const spaceName = messagePayload?.space?.name;
    if (!userMessage || !spaceName) {
      console.error("Message or space missing");
      await sendToChat(spaceName, "Message or space missing");
    }

    if (userMessage === "はい" || userMessage === "いいえ"){
      await saveAnswer(docRef, userMessage);
      await sendToChat(spaceName, { text: "回答ありがとうございました。" });
    } else {
      await sendToChat(spaceName, { text: "確認中です。少々お待ちください。" });
      docRef = null;
      /* --- Spreadsheet から補足情報を取得 --- */
      /**/
      const rules = await readFromSheet();
      // speadSheeetの内容から簡易検索
      const related  = await searchRules(rules, userMessage);
      //console.log("------ related ------\n", related);
      answer = await geminiApi(related, userMessage);
      /* --- Chat API で後送 --- */
      await sendToChat(spaceName, { text: answer });
      docRef = await saveChat(receivedAt, messagePayload, answer, null, "done");
      await sendToChat(spaceName, setConfirm(docRef));
      //res.status(204).send(); // Pub/Sub ACK
    }
  } catch (err) {
    console.error("------ エラー発生 ------\n", err);
    await saveChat(receivedAt, messagePayload, answer, err, "error");
    //console.error("ERROR:", err);
    //await sendToChat(spaceName, "エラーが発生しました。管理本部へお問い合わせください。");
  }
});
/* ========= 管理者用 ========= */
app.post("/reload", async(req, res) => {
  try {
    console.log("###### app.post reload start ######");
    setCachedRules(null);
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
