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
      const action = event.action;
      //console.log("------ action ------\n", action);
      // パラメータを扱いやすいオブジェクトに変換
      const params = {};
      if (action.parameters) {
        action.parameters.forEach(p => {
          params[p.key] = p.value;
        });
      }
      // 判別処理
      if ((action.actionMethodName === 'handle_yes') || (action.actionMethodName === 'submit_reason') ) {
        res.json({
          "actionResponse": {
            "type": "UPDATE_MESSAGE"
          },
          "text": "返答ありがとうございました。"
        });
      } else if (action.actionMethodName === 'handle_no') {
        res.json(setReasonPayload(params.docId));
      }
      /*
      res.json({
        "renderActions": {
          "actionStatus": {
            "userFacingMessage": "返答ありがとうございました。"
          }
        }
      });
      */
    } else if (event.type === "MESSAGE") {
      /**/
      res
      .status(200)
      .set("Content-Type", "application/json")
      .send("{}");
      /**/
      /*
      res
      .status(200)
      .set("Content-Type", "application/json")
      .send({"text": "確認中です。少々お待ちください。"});
      */
    }

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

function setReasonPayload(docId) {
  console.log("###### setReasonPayload start ######");
  console.log("docRef.id =", docId);
  //console.log("spaceName =", spaceName);
  //console.log("threadName =", threadName);
  //const docId = String(docRef.id);
  return ({
    actionResponse: {
      type: "UPDATE_MESSAGE" 
    },
    cardsV2: [
      {
        cardId: "reason" + Date.now(),
        card: {
          /*
          header: {
            title: "★★★★★★「いいえ」の理由の入力★★★★★★"
          },
          */
          sections: [
            {
              widgets: [
                {
                  "textParagraph": {
                    // <font color="#RRGGBB"> タグが使用可能です
                    "text": "<b><font color=\"#ff0000\">★★★★★★「いいえ」の理由の入力★★★★★★</font></b>"
                  }
                },
                {
                  textInput: {
                    name: "reason_text",
                    //label: "理由を入力してください",
                    type: "MULTIPLE_LINE",
                    placeholderText: "こちらに「いいえ」の理由の詳細を入力してください..."
                  }
                },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "この内容で送信",
                        onClick: {
                          action: {
                            function: "submit_reason",
                            parameters: [
                              {
                                key: "docId",
                                value: String(docId) // 必ず文字列に変換
                              }
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
  });
}
