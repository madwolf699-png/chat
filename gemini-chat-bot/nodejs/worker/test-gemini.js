// Workspace Add-on通知用
import "dotenv/config";
import {
  setCachedRules,
  readFromSheet,
  searchRules,
  geminiApi,
} from "./anyFunc.js";

let answer;

const userMessage = "転職する事にしました";
//const userMessage = "PCは自分持ちですか？";
const rules = await readFromSheet();
// speadSheeetの内容から簡易検索
const related  = await searchRules(rules, userMessage);
console.log("------ related ------\n", related);
answer = await geminiApi(related, userMessage);
console.log("------ answer ------\n", answer);

