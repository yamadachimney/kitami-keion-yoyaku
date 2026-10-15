# 北見工大 軽音予約

軽音サークルの部室予約サイトです。

- 画面：このリポジトリのファイル（GitHub Pages で公開）
- 予約データ：Firebase Realtime Database
- 運営ログイン：Firebase Authentication（`unei@kitami-keion.example` のパスワード＝管理画面の暗証番号）

## ファイル
| ファイル | 中身 |
|---|---|
| `index.html` | 予約サイト本体 |
| `firebase-config.js` | Firebase の接続設定（公開されて大丈夫な値） |
| `database.rules.json` | データベースのセキュリティルール（Firebaseコンソールの Realtime Database →「ルール」に貼る） |
| `manifest.webmanifest` / `sw.js` / `icons/` | ホーム画面に追加（アプリ化）用 |

## 引き継ぎ
1. Firebase コンソール →プロジェクトの設定 →「ユーザーと権限」で次の担当者を追加
2. GitHub →このリポジトリの Settings → Collaborators で次の担当者を追加
3. 暗証番号を変えるときは Firebase → Authentication → ユーザー → 運営アカウントのパスワードを変更
