// Workspace Add-on通知用
import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PubSub } from "@google-cloud/pubsub";

/* ========= Express ========== */
const app = express();
app.use(express.json());

const pubsub = new PubSub();
const TOPIC_NAME = "chat-worker-topic";

/* ========= Chat API Endpoint ========= */
app.post("/",  async (req, res) => {
  try {
    // Google Chat からのメッセージ
    const event = req.body;
    console.log("------ event ------\n", event);

    if (event.type === 'CARD_CLICKED' || event.commonEventObject?.invokedFunction){
      const action = event.commonEventObject?.parameters?.action;
      return res.json({
        "actionResponse": {
          "type": "UPDATE_MESSAGE",
          "text": `回答ありがとうございました。`,
        }
      });
    }

    // 非同期処理用に Pub/Sub へ送信
    /**/
    await pubsub.topic(TOPIC_NAME).publishMessage({
      json: event,
    });
    /**/
    /**/
    res
    .status(200)
    .set("Content-Type", "application/json")
    .send("{}");
    /**/
  } catch (err) {
    console.error(err);
    return res.json({
      text: "エラーが発生しました。",
    });
  } 
});

/* ========= Server ========= */
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Google Chat bot listening on port ${port}`);
});
