# --- Stage 1: Build (コンパイル用) ---
FROM golang:1.25-alpine AS builder

# ビルドに必要な最小限のパッケージ
RUN apk add --no-cache git gcc musl-dev

WORKDIR /build

# 1. 依存関係ファイルをコピー (rootからの相対パスを指定)
# ビルドコンテキストが root なので、backend-go/ を起点にする
COPY go.mod go.sum* ./

# 依存ライブラリのダウンロード
RUN go mod download

# ソースコードのコピーとビルド
COPY . .

# CGOを無効化し、静的バイナリを作成することで実行環境の互換性を高める
#RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /app/server ./app/main.go
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /build/server ./main.go

# --- Stage 2: Runtime (実行用) ---
# 実行時はOSを含まない、または最小限のイメージ(alpine等)を使用
FROM alpine:3.20

# タイムゾーンの設定と、HTTPS通信に必要な証明書のインストール
RUN apk add --no-cache curl tzdata ca-certificates && \
    cp /usr/share/zoneinfo/Asia/Tokyo /etc/localtime && \
    echo "Asia/Tokyo" > /etc/timezone

ENV LANG=ja_JP.UTF-8
ENV LANGUAGE=ja_JP:ja
ENV LC_ALL=ja_JP.UTF-8

WORKDIR /app

# ビルダーから実行バイナリのみをコピー
COPY --from=builder /build/server .

# ポート指定 (K8sのService等と合わせる)
EXPOSE 8080

# アプリケーションの実行
CMD ["./server"]
