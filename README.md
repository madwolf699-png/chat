## GitHub認証
- Token(classic)
  ```bash
  ここに実際のトークンを記載してはだめ！
  ```

- 認証情報保存
  ```bash
  git config --global credential.helper store
  ```

## Git新規登録
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/madwolf699-png/chat.git
git push -u origin main
```
