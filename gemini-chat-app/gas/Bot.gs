function onMessage(e) {
  const userMessage = e.message.text;
  return {
    text: `受信しました：$(userMessage)`
  }
}

/**
 * Google Chat からの POST を受け取る
 */
function doPost(e) {
  const event = JSON.parse(e.postData.contents);

  // ユーザー入力
  const userMessage = event.message?.text || '';

  // ここで Gemini を呼ぶ（例）
  const replyText = "受信しました：\n" + userMessage;

  // Google Chat への返却形式（必須）
  const response = {
    text: replyText
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/*
function doPost(e) {
  try {
    return ContentService.createTextOutput(
      JSON.stringify({ text: "受信しました" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ text: "エラー" })
    ).setMimeType(ContentService.MimeType.JSON);
  }
  
  //console.log("doPost called");
  //console.log(e.postData.contents);

  const event = JSON.parse(e.postData.contents);

  // URL検証 or Bot追加時イベント
  if (!event.message) {
    return createChatResponse("Bot is ready.");
  }

  // ユーザー入力テキスト
  const userMessage = event.message?.text;

  if (!userMessage) {
    return createChatResponse("メッセージを入力してください。");
  }

  // Gemini API 呼び出し
  //const geminiReply = callGemini(userMessage);
  const geminiReply = "I'm chappy!"

  return createChatResponse(geminiReply);
}
*/

/**
 * Gemini API 呼び出し
 */
function callGemini(prompt) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(
    `${GEMINI_API_URL}?key=${apiKey}`,
    options
  );

  const json = JSON.parse(response.getContentText());

  return json.candidates?.[0]?.content?.parts?.[0]?.text
    || "Geminiからの応答を取得できませんでした。";
}

/**
 * Google Chat 用レスポンス生成
 */
function createChatResponse(text) {
  return ContentService
    .createTextOutput(JSON.stringify({ text }))
    .setMimeType(ContentService.MimeType.JSON);
}

