package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"cloud.google.com/go/pubsub"
	"github.com/joho/godotenv"
)

// Google Chat のイベント構造体（簡易版）
type ChatEvent struct {
	Type   string `json:"type"`
	Action struct {
		ActionMethodName string `json:"actionMethodName"`
		Parameters       []struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		} `json:"parameters"`
	} `json:"action"`
	Message interface{} `json:"message"`
}

var pubsubClient *pubsub.Client
var topic *pubsub.Topic

const TOPIC_NAME = "chat-worker-topic"

func main() {
	// .env の読み込み
	_ = godotenv.Load()

	ctx := context.Background()
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")

	// Pub/Sub クライアントの初期化
	var err error
	pubsubClient, err = pubsub.NewClient(ctx, projectID)
	if err != nil {
		log.Fatalf("PubSub client creation failed: %v", err)
	}
	topic = pubsubClient.Topic(TOPIC_NAME)

	// HTTPハンドラ
	http.HandleFunc("/", chatHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Google Chat bot listening on port %s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}

func chatHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var event ChatEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		log.Printf("JSON decode error: %v", err)
		return
	}

	// 1. Pub/Sub へ非同期送信
	go func(ev ChatEvent) {
		data, _ := json.Marshal(ev)
		topic.Publish(context.Background(), &pubsub.Message{Data: data})
	}(event)

	w.Header().Set("Content-Type", "application/json")

	// 2. イベント判別処理
	if event.Type == "CARD_CLICKED" {
		params := make(map[string]string)
		for _, p := range event.Action.Parameters {
			params[p.Key] = p.value
		}

		method := event.Action.ActionMethodName
		if method == "handle_yes" || method == "submit_reason" {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"actionResponse": map[string]string{"type": "UPDATE_MESSAGE"},
				"text":           "返答ありがとうございました。",
			})
			return
		} else if method == "handle_no" {
			json.NewEncoder(w).Encode(setReasonPayload(params["docId"]))
			return
		}

	} else if event.Type == "MESSAGE" {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("{}"))
		return
	}
}

// カードUIの生成
func setReasonPayload(docId string) map[string]interface{} {
	log.Printf("###### setReasonPayload start ###### docId: %s", docId)

	return map[string]interface{}{
		"actionResponse": map[string]string{
			"type": "UPDATE_MESSAGE",
		},
		"cardsV2": []interface{}{
			map[string]interface{}{
				"cardId": fmt.Sprintf("reason%d", time.Now().UnixMilli()),
				"card": map[string]interface{}{
					"sections": []interface{}{
						map[string]interface{}{
							"widgets": []interface{}{
								map[string]interface{}{
									"textParagraph": map[string]string{
										"text": "<b><font color=\"#ff0000\">★★★★★★「いいえ」の理由の入力★★★★★★</font></b>",
									},
								},
								map[string]interface{}{
									"textInput": map[string]interface{}{
										"name":            "reason_text",
										"type":            "MULTIPLE_LINE",
										"placeholderText": "こちらに「いいえ」の理由の詳細を入力してください...",
									},
								},
								map[string]interface{}{
									"buttonList": map[string]interface{}{
										"buttons": []interface{}{
											map[string]interface{}{
												"text": "この内容で送信",
												"onClick": map[string]interface{}{
													"action": map[string]interface{}{
														"function": "submit_reason",
														"parameters": []interface{}{
															map[string]string{
																"key":   "docId",
																"value": docId,
															},
														},
													},
												},
												"color": map[string]float64{
													"red": 0.8, "green": 0.1, "blue": 0.1, "alpha": 1.0,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}
