import express from 'express';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const TARGET_URL = process.env.TARGET_URL;
//const TARGET_URL = 'https://chat-worker-750317593501.asia-northeast1.run.app/reload';

app.get('/reload', async (req, res) => {
  try {
    // IDトークン生成（audience 指定）
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(TARGET_URL);
    const headers = await client.getRequestHeaders();

    // 本命 Cloud Run 呼び出し
    const response = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    const text = await response.text();

    res.status(response.status).send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`reload service listening on ${port}`);
});
