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
