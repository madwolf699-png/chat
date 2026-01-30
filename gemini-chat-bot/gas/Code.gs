function onButtonClick_reload() {
  const url = 'https://chat-reload-750317593501.asia-northeast1.run.app';

  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());

  SpreadsheetApp.getUi().alert('リロード処理が完了しました');
}
