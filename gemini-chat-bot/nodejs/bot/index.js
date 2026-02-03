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
    //console.log("------ event ------\n", event);

    // 非同期処理用に Pub/Sub へ送信
    /**/
    pubsub.topic(TOPIC_NAME).publishMessage({
      json: event,
    });
    /**/

    if (event.type === "CARD_CLICKED") {
        res.json({
        "actionResponse": {
          "type": "UPDATE_MESSAGE"
        },
        "text": "回答ありがとうございました。"
      });
      /*
      res.json({
        "renderActions": {
          "actionStatus": {
            "userFacingMessage": "回答ありがとうございました。"
          }
        }
      });
      */
    } else if (event.type === "MESSAGE") {
      res
      .status(200)
      .set("Content-Type", "application/json")
      .send({"text": "確認中です。少々お待ちください。"});
    }

    /*
    res
    .status(200)
    .set("Content-Type", "application/json")
    .send("{}");
    */
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
