// HTML表示
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Gemini Chat Demo');
}

