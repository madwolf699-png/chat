# Gemini Chat App

## 対象環境
  - Google Apps Script (GAS)
  - Gemini 2.5-flash
  - SpreadSHeet
  - Google AI Studio
    ```bash
    https://aistudio.google.com/api-keys
    ```
  - Google Apps Script
    ```bash
    https://script.google.com/u/1/home/projects/1GH-glsOdfNpScA6dz2Fqxn-erT1l59ztjjavtcnxv0U0emXIvhVMEheI/edit
    ```
  - Google Cloud
    ```bash
    https://console.cloud.google.com/welcome?project=gemini-chat-bot-484323&authuser=1
    ```

  - Google Apps Scriptを使用してGoogle Chatアプリを作成する
    ```bash
    https://developers.google.com/workspace/chat/quickstart/apps-script-app?utm_source=chatgpt.com&hl=ja
    ```

## ディレクトリ構成

    [リポジトリ名]/
    ├─ gas/　⇒　GASのソース
    ├    ├─ appsscript.json
    ├    ├─ Bot.gs
    ├    ├─ index.html
    ├    ├─ HtmlService.gs
    ├    ├─ Common.gs
    └─ README.md　⇒　本ファイル

## Geminiモデル一覧の確認
  ````bash
  curl -X GET https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyB_EJJmnSllXeJEGvgvHFFTtxEx9AMqv3Q
  ````
## Gemini疎通確認
  ```bash
  curl -X POST \
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=[APIキー]" \
    -H "Content-Type: application/json" \
    -d '{
      "contents": [
        {
          "parts": [
             { "text": "こんにちは。自己紹介してください。" }
          ]
        }
     ]
    }'
  ```

## HtmlServiceとしての環境
- 以下のURLにアクセス
  ```bash
  https://script.google.com/macros/s/AKfycbwS14edGhJpfhFojPDk6pFIKo5LIP-7WHk1075c1C8M3MMAArlrccubVG3Nu-vboA5tAg/exec
  ```

## CHat Botとしての環境
- Google Ai Studio
  - APIキーを作成＆取得

- Google Apps SCriptでのデプロイ
  - 種類：Webアプリ
  - 次のユーザとして実行：自分
  - アクセスできるユーザ：全員

- Google Cloudでの設定
  - 