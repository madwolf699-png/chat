# Gemini Chat Bot

## 全体構成
```bash
Google Chat
   │  (Event: MESSAGE)
   ▼
Google Chat API
   │  (HTTP POST)
   ▼
Cloud Run（Bot入口）
   │  即レスポンス
   ├── res.status(200).send({})
   │
   │ ② 非同期キュー
   ▼
Pub/Sub / Cloud Tasks
   ├─ res.status(200).send({})
   ├─ Chat API レスポンス({ text: "確認中です" })
   ├─ Google Spread Sheets API 読み書き
   ├─ RAG処理(kuromoji)
   ├─ Gemini API 呼び出し
   └─ Chat API レスポンス(JSON)
   │
   ▼
Worker（Gemini / Sheets / DB）
   │
   ▼
Google Chat API（spaces.messages.create）
```
- Google Cloud
  ```bash
  https://console.cloud.google.com/apis/dashboard?authuser=1&project=gemini-chat-bot-484323&supportedpurview=project
  ```

## Node.js環境のインストール
```bash
sudo apt install npm
→Node.jsもインストールされる
```

## gcloudのインストール
- ① gcloud インストール方法（おすすめ：公式リポジトリ）
  - 方法A：snap から簡単インストール
    ```bash
    sudo snap install google-cloud-cli --classic

    --classic がないと PATH や権限で問題になることがあります
    ```
  - インストール後は gcloud version で確認
    ```bash
    gcloud version
    ```

## gcloudでの各種確認
- Chat APIが有効か確認
  ```bash
  gcloud services list --enabled | grep chat
  表示されればOK：
  chat.googleapis.com
  無ければ有効化：
  gcloud services enable chat.googleapis.com
  ```

- プロジェクト番号を確認
  ```bash
  gcloud projects describe $(gcloud config get-value project) \
  --format="value(projectNumber)"
  表示されればOK：
  ```

- Chat APIの「サービスエージェント」確認
  ```bash
  gcloud projects describe $(gcloud config get-value project) \
  --format="value(projectNumber)"
  表示されればOK：
  ```

- Cloud Run サービスに付いている IAM を確認
  ```bash
  gcloud run services get-iam-policy chat-bot \
  --region asia-northeast1
  探すべき行：
  - members:
    - serviceAccount:service-123456789012@gcp-sa-chat.iam.gserviceaccount.com
    role: roles/run.invoker
  ```
- Chat API に Cloud Run 呼び出し権限を付与（設定）
  ```bash
  gcloud run services add-iam-policy-binding chat-bot \
    --region asia-northeast1 \
    --member="allUsers" \
    --role="roles/run.invoker"

    以下だと回答のろクエストができない
    --member="serviceAccount:service-123456789012@gcp-sa-chat.iam.gserviceaccount.com"
  ```
- サービス一覧を確認
  ```bash
  gcloud run services list --region asia-northeast1
  ```

- サービスを削除
  ```bash
  gcloud run services delete nodejs \
  --region asia-northeast1
  確認なしで削除
  gcloud run services delete nodejs \
  --region asia-northeast1 \
  --quiet
  ```

## Google Cloud 側の準備（重要）
- 有効化する API
  - Cloud Console → APIとサービス → 有効化
    - Google Chat API
    - Google Sheets API
    - Generative Language API（Gemini）
- サービスアカウント
  - Cloud Run 用の デフォルト or 専用 SA に以下付与：
    - Chat Bot
    - Editor（最小なら Sheets 用に Editor or Sheets API 権限）
    - Generative Language API User
- 課金アカウントの登録(重要)
  - Google Cloud Console にログイン
  - Google Cloud Console
    - → プロジェクト選択
    - 左メニュー → 「課金」
    - 「課金アカウントをリンク」または「新規作成」
    - プロジェクト]を課金アカウントに紐付ける
    - ⚠️ 無料枠（Always Free）でも課金アカウントは必要
    - → クレジットカードの登録が必要になる場合がある
- gcloud で一発(手順)
  - ① 課金アカウントの一覧を確認
    ```bash
    gcloud beta billing accounts list

    出力例：
    ACCOUNT_ID           NAME                  OPEN
    012345-67890A-BCDEF0 My Billing Account    True
    ACCOUNT_ID をメモ（例: 012345-67890A-BCDEF0）
    ```
  - ② プロジェクトに課金アカウントを紐付け
    ```bash
    gcloud beta billing projects link gemini-chat-bot-484323 \
      --billing-account 012345-67890A-BCDEF0

    成功するとメッセージが表示されます：
    Billing account [012345-67890A-BCDEF0] has been linked to project [gemini-chat-bot-484323].
    ```
  - ③ 課金状態を確認
    ```bash
    gcloud beta billing projects describe gemini-chat-bot-484323

    出力に billingAccountName が表示されていれば OK
    ```
  - ④ Cloud Run デプロイ
    ```bash
    gcloud run deploy [project-folder] \
      --source . \
      --region asia-northeast1 \
      --allow-unauthenticated
    ```

## Cloud Runによる開発(Bot入口コード)
- 結論（超要約）
  - Cloud Run の Node.js コードは
    - 自分のPC上の任意のフォルダ
    - 普通の Node.js プロジェクトとして書きます。
    - Cloud Console の画面に直接書くものではありません。
- 全体の流れ（人間の作業視点）
  - ① ローカルPCでコードを書く
  - ② Dockerfileを書く
  - ③ gcloud コマンドで Cloud Run にデプロイ
  - ④ Cloud Run が HTTPS URL を発行
  - ⑤ その URL を Chat API に設定
- ① 作業フォルダを作る（ローカルPC）
  - 例（Linux / macOS / WSL）：
    ```bash
    mkdir [project-folder]
    cd [project-folder]
    ```
    ※ Windows でも OK（PowerShell / VSCode）
- ② Node.js プロジェクト初期化
  ```bash
  npm init -y
  ```
  すると：
  ```bash
  [project-folder]/
   └ package.json
  ```
- ③ 必要なライブラリを入れる
  ``` bash
  cd [project-folder]
  npm install express googleapis @google/generative-ai
  ```
- ④ ファイル構成（最小）
  ```bash
  chat-bot/
   ├ bot/
   ├  ├ index.js        ← ★ここに Chat Bot の処理を書く
   ├  ├ package.json
   ├  └ Dockerfile
   ├ worker/
   ├  ├ index.js        ← ★ここに ChPub/Subt Task の処理を書く
   ├  ├ package.json
   ├  └ Dockerfile
   ├ external/
       ├ index.js        ← ★ここに SpreadSheet Reload の処理を書く
       ├ package.json
       └ Dockerfile
  ```
- ⑤ Node.js（Cloud Run 用）コードを書く
  ```bash
  index.js
  import express from "express";

  const app = express();
  app.use(express.json());

  app.post("/chat", (req, res) => {
    res.json({ text: "Cloud Run からの応答です" });
  });

  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log("Server started");
  });
  ```
  この時点では
  Gemini も Spreadsheet も未使用で OK
    まず「Chat から応答が返る」事が最優先。
- ⑥ Dockerfile を書く
  ```bash
  FROM node:20-slim

  WORKDIR /app
  COPY package*.json ./
  RUN npm install

  COPY . .
  CMD ["node", "index.js"]
  ```
- ⑦ ローカルで動作確認（超重要）
  ```bash
  node index.js
  ```
  別ターミナルで：
  ```bash
  curl -X POST http://localhost:8080/ \
    -H "Content-Type: application/json" \
    -d '{"type":"MESSAGE","message":{"text":"親戚に不幸がありました"},"space":{"name":"spaces/_TKNXiAAAAE"}}'
  ```
  👇 返れば成功
  ```bash
  {"text":"Cloud Run からの応答です"}
  ```
- ⑧ Cloud SDK（gcloud）を準備

  まだなら：
  ```bash
  gcloud init
  gcloud auth login
  gcloud config set project [YOUR_PROJECT_ID]
  ```
- ⑨ Cloud Run にデプロイ
  ```bash
  cd [project-folder]
  gcloud run deploy chat-bot \
    --source . \
    --region asia-northeast1 \
    --allow-unauthenticated
  ```
  成功すると：
  ```bash
  Service URL: https://chat-bot-xxxxx.a.run.app
  ```
- ⑩ Chat API に URL を設定
  - Google Cloud Console → Google Chat API → 構成
  - エンドポイント URL:
    ```bash
    https://chat-bot-xxxxx.a.run.app/
    ```

## Cloud Runによる開発(storage)
  ```bash
  npm install @google-cloud/storage
  ```

## Cloud Runによる開発(Pub/Sub設定)
  ```bash
  npm install @google-cloud/pubsub
  gcloud pubsub topics create chat-worker-topic
  ```

##
  ```bash
  SA=617913681837-compute@developer.gserviceaccount.com
  gcloud projects add-iam-policy-binding sun-internal-chat \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.builder"

  gcloud projects add-iam-policy-binding sun-internal-chat \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/storage.admin"
  
  gcloud projects add-iam-policy-binding sun-internal-chat \
  --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
  --role="roles/run.admin"
  ```

  ```bash
  gcloud projects add-iam-policy-binding sun-internal-chat \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/viewer"

  gcloud projects get-iam-policy sun-internal-chat \
    --flatten="bindings[].members" \
    --format="table(bindings.role)" \
    --filter="bindings.members:617913681837-compute@developer.gserviceaccount.com"
  ```

## Cloud Runによる開発(Bot（非同期処理用 Cloud Run）)
  ```bash
  cd gemini-chat-bot/nodejs/bot
  gcloud run deploy chat-bot \
    --source . \
    --region asia-northeast1 \
    --platform managed \
    --service-account 617913681837-compute@developer.gserviceaccount.com \
    --allow-unauthenticated
  
   gcloud run services add-iam-policy-binding chat-bot \
     --region asia-northeast1 \
     --member="allUsers" \
     --role="roles/run.invoker"
  ```

## Cloud Runによる開発(Worker（非同期処理用 Cloud Run）)
  ```bash
  cd gemini-chat-bot/nodejs/worker
  gcloud run deploy chat-worker \
    --source . \
    --region asia-northeast1 \
    --service-account 617913681837-compute@developer.gserviceaccount.com \
    --no-allow-unauthenticated \
    --set-env-vars \
    GEMINI_API_KEY=,SPREADSHEET_ID=,FIRESTORE_DOC=,PROJECT_ID=
  ```
  ```bash
  gcloud run services add-iam-policy-binding chat-worker \
    --region asia-northeast1 \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/run.invoker"
  ```

## Cloud Runによる開発(External（非同期処理用 Cloud Run）)
  ```bash
  cd gemini-chat-bot/nodejs/external
  gcloud run deploy chat-external \
    --source . \
    --region asia-northeast1 \
    --service-account 617913681837-compute@developer.gserviceaccount.com \
    --allow-unauthenticated \
    --set-env-vars \
    TARGET_URL=https://chat-worker-617913681837.asia-northeast1.run.app/reload
  ```
  ```bash
  gcloud run services add-iam-policy-binding chat-external \
    --region asia-northeast1 \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/run.invoker"
  ```

## Cloud Runによる開発(IAM 設定（重要）)
  ```bash
  以下は場合によって必要★
  gcloud projects add-iam-policy-binding sun-internal-chat \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/chat.bot"

  以下は場合によって必要★
  gcloud projects add-iam-policy-binding sun-internal-chat \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/pubsub.publisher"
  ```

## Cloud Runによる開発(Pub/Sub → Worker 連携)
  ```bash
  gcloud pubsub subscriptions create chat-worker-sub \
    --topic chat-worker-topic \
    --push-endpoint=https://chat-worker-617913681837.asia-northeast1.run.app \
    --push-auth-service-account=617913681837-compute@developer.gserviceaccount.com
  
  gcloud pubsub subscriptions describe chat-worker-sub
  ```

## Cloud Runのログ確認
- gcloud コマンドで確認
  ```bash
  gcloud logging read \
    'resource.type="cloud_run_revision"
    resource.labels.service_name="gemini-chat-bot"' \
    --limit 50
  ```
- Cloud Runはコールドスタート
  - 無通信だと15〜20分程度で停止状態になる
  - 最小インスタンス数を1にするか、定期的にアクセスする。
  -　最小インスタンス数を1にする
    - Cloud Runの該当サービスの画面で「新しいリビジョンの編集とデプロイ」を選択
    - 「リビジョンスケーリング」タブでインスタンス最小数を1に設定
  - gcloudコマンドで設定
    ```bash
    gcloud run services update chat-worker \
      --min-instance 1 \
      --region asia-northeast1
    ```

## spreadSheetの環境設定
- Cloud RunでspreadSheetを扱うには、該当のspreadSHeetに対して以下のサービスアカウントを共有の権限として設定する必要がある。
  ```bash
  617913681837-compute@developer.gserviceaccount.com
  ```

- ローカルspreadSheetを扱うには、以下のように一時的に認証情報を環境変数とする。
  ```bash
  JSONはGoogle Cloudでのサービスアカウントの鍵で作成
  export GOOGLE_APPLICATION_CREDENTIALS=~/gemini-chat-bot-484323-40688e7b7c37.json
  node worker.js
  ```

## Firestreの環境設定
  ```bash
  npm install @google-cloud/firestore
  ```
  ```bash
  gcloud projects add-iam-policy-binding sun-internal-chat \
    --member="serviceAccount:617913681837-compute@developer.gserviceaccount.com" \
    --role="roles/datastore.user"

  gcloud projects get-iam-policy sun-internal-chat \
    --flatten="bindings[].members" \
    --filter="bindings.members:617913681837-compute@developer.gserviceaccount.com" \
    --format="table(bindings.role)"

  再デプロイ

  https://console.cloud.google.com/firestore

  https://console.firebase.google.com/u/1/project/gemini-chat-bot-484323/firestore/databases/-default-/data/~2Fchat_logs

  gcloud firestore databases delete --project=gemini-chat-bot-484323
  ```
- Google Cloud Consoleにて以下の作業が必要
  - 検索でFirestoreを入力してFirestore Studioにでデータベースを作成
  - それかCloud Shellターミナルを出力して、以下のコマンドでデータベースを作成
    ```bash
    gcloud firestore databases create --location=asia-notheast1 --database="(default)"
    ```

## Cloud Storageの環境設定
- バケットの確認
  ```bash
  gsutil ls
  gsutil ls -p gemini-chat-bot-484323
  以下が表示される
  gs://run-sources-gemini-chat-bot-484323-asia-northeast1/

  gsutil ls gs://gemini-sheet-bucket

  バケットの作成
  gsutil mb \
  -p gemini-chat-bot-484323 \
  -l asia-northeast1 \
  gs://gemini-sheet-bucket

  権限の付与
  gcloud storage buckets add-iam-policy-binding gs://gemini-sheet-bucket \
  --member="serviceAccount:chat-bot-sa@gemini-chat-bot-484323.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

  ```

## spreadSheetのリロード
  ```bash
  TOKEN=$(gcloud auth print-identity-token)
  curl -X POST -H "Authorization: Bearer $TOKEN" \
  https://chat-worker-617913681837.asia-northeast1.run.app/reload
  ```

## 日本語の形態素解析
  ```bash
  npm install kuromoji
  もしくは
  npm install tiny-segmenter
  ```

## Google API Key
- モデル一覧の確認
  ```bash
  curl -X GET https://generativelanguage.googleapis.com/v1beta/models?key=XXXXXX
  ```

## ロカルで確認試験をするために
- 環境変数
  ```bash
  export GEMINI_API_KEY=
  export SPREADSHEET_ID=
  export FIRESTORE_DOC=chat_logs
  export PROJECT_ID=sun-internal-chat
  export TARGET_URL=https://chat-worker-617913681837.asia-northeast1.run.app/reload
  export GOOGLE_APPLICATION_CREDENTIALS=~/sun-internal-chat-5cb5315565ce.json
  ```
