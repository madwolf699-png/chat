const GEMINI_API_KEY = 'AIzaSyB_EJJmnSllXeJEGvgvHFFTtxEx9AMqv3Q';
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='
  + GEMINI_API_KEY;

const SPREADSHEET_ID = '';
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
const INTERNAL_RULES = `
【社内規定データ】
・慶弔休暇：配偶者・一親等親族が亡くなった場合、3日間取得可能
・有給休暇：入社6か月後より付与
`; // ← 実際はSpreadsheet等から取得してもOK

// メッセージを受け取りBot応答を返す
function sendMessage(message) {
  const now = new Date();
  const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm");

  // シンプルなBot応答例（文字を反転）
  //const botReply = message.split('').reverse().join('');
  // Gemini
  const botReply = sendMessageToGemini(message);

  return {
    user: { text: message, time: timestamp },
    bot: { text: botReply, time: timestamp }
  };
}

// メッセージ送信関数
function sendMessageToGemini(userMessage) {
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

  //const internalRules = getInternalRulesText();

  const payload = {
    systemInstruction: {
      role: "system",
      parts: [{ text: SYSTEM_PROMPT + FIXED_PHRASE }]
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: INTERNAL_RULES + "\n\n【質問】\n" + userMessage }
        ]
      }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  try {
    const response = UrlFetchApp.fetch(GEMINI_API_URL, options);
    const data = JSON.parse(response.getContentText());

    // レスポンスからテキストを抽出
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || "応答が取得できませんでした";
    return text;

  } catch (e) {
    return "Error: " + e.message;
  }
}

// 規定データを取得・整形
function getInternalRulesText() {
  const ss = SpreadsheetApp.openById('SPREADSHEET_ID');
  const sheet = ss.getSheetByName('Rules');
  const values = sheet.getDataRange().getValues();

  // ヘッダ行を除外
  values.shift();

  let text = '【社内規定データ】\n';

  values.forEach(row => {
    const [category, term, description] = row;
    if (term && description) {
      text += `・${term}：${description}\n`;
    }
  });

  return text;
}

