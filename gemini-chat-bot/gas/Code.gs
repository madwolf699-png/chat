function onButtonClick_reload() {
  const url = 'https://chat-external-750317593501.asia-northeast1.run.app/reload';

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());

  SpreadsheetApp.getUi().alert('リロード処理が完了しました');
}
