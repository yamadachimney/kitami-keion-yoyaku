# 北見軽音予約 引き継ぎメモ

北見工大 軽音サークルの部室予約サイト（＋ライブ運営・備品リクエスト）の現状まとめ。
別のチャット・別の担当者がこのまま続きから作業できるように書いています。
**暗証番号（運営パスワード）はここには書きません。** 必要なら本人に聞いてください。

---

## 1. どこに何があるか

| もの | 場所 |
|---|---|
| 本番サイト | https://yamadachimney.github.io/kitami-keion-yoyaku/ |
| LINE固定用URL | https://yamadachimney.github.io/kitami-keion-yoyaku/?openExternalBrowser=1&v=4 （`v=` はLINEのリンク画像キャッシュ回避用。画像を変えたら数字を上げる） |
| ティア表 | https://yamadachimney.github.io/kitami-keion-yoyaku/tier/ （部室予約とは別ページ。同じFirebaseを使う。→ 7章） |
| テスト版 | https://yamadachimney.github.io/kitami-keion-yoyaku/beta/ （本番と同じDBを使う。新機能はまずここで確認） |
| GitHub | アカウント `yamadachimney` / リポジトリ `kitami-keion-yoyaku`（main ブランチ → GitHub Pages、ルート配信） |
| Firebase | プロジェクト `kitami-keion`（Sparkプラン＝無料） |
| Realtime Database | `https://kitami-keion-default-rtdb.asia-southeast1.firebasedatabase.app`（シンガポール） |
| 認証 | 匿名ログイン（メンバー、端末ごとのuid）＋ メール/パスワード（運営共通アカウント） |
| 運営アカウント | `unei@kitami-keion.example`（実在しないアドレス）。**パスワード＝サイトの運営暗証番号**（6文字以上） |
| 旧版（もう使っていない） | Google Apps Script 版。スプレッドシート「練習表」に古い予約が残っている |

- GitHub への push は、Claude の GitHub App がこのリポジトリに入っているのでチャットから直接できる。**新しいリポジトリを作る場合は、そのリポジトリにも Claude の GitHub App のアクセスを追加する必要がある。**
- GitHub Pages の設定変更（API）はチャットからはできない。必要ならユーザーに GitHub の Settings → Pages で操作してもらう。
- Firebase コンソールの操作（ルールの貼り付け、ユーザー追加）はユーザーにやってもらう必要がある。

## 2. 仕組み

- 1ファイルの静的サイト（`index.html`）＋ PWA（`manifest.webmanifest`, `sw.js`, `icons/`）
- Firebase JS SDK compat 10.12.2（gstatic から読み込み）。設定は `firebase-config.js`（公開して問題ない値）
- 予約の計算（優先度順の自動配置・被り判定）はブラウザ側でやっている
- **二重予約の防止**：確定した予約は `slots/<曜日>_<コマ>` に予約IDの「札」を置く。ルールで「札は空いているときだけ置ける」ので、同時に押してもどちらか一方しか入らない
- 書き込みはすべて「複数パス同時更新（update）」。**同じ update の中で親と子のパスを両方書くとエラーになる**ので注意
- 画面を閉じて60秒で接続を切る（同時接続数の節約）

### データの形（Realtime Database）

```
weeks/<月曜の日付 YYYY-MM-DD>/
  cfg   {phase: closed|request|free, order: [band,drum,other], maxSlots}
  reqs/<id> {uid, band, rep, kind, day(0=月), s, e, dur, status: pending|confirmed|rejected, createdAt, ws?, we?}
  slots/<day>_<slot> = <reqId>      ※ s,e,slot は 9:00=0 の30分刻み（0〜23）
liveIdx/<liveId> {name, date, dates(カンマ区切り), venue}
lives/<liveId>/
  cfg     {name, venue, days:[{date, anchor: open|reh, open|rehStart, gap, start?, end?}], date, open,
           rehMin, changeMin, slotMode: setlist|fixed, fixedMin, estMin, locked, rehMode, order[], rehOrder[], tpl}
  entries/<id> {uid, band, members[{name, parts[], other}], songs[{t, sec, req}], gear[{k: club|own|venue, t}], note, day, createdAt, updatedAt}
  items/<k> {name, qty, pri: high|mid|low, opt, ord}   ※ このライブの持ち出しリスト
  checks/<k> {out, back}
  run     {reh/<entryId>: ms, show/<entryId>: ms, end/<dayIndex>: ms}
tpls/<id> {name, items/<k>{...}}   ※ 外ステージ用（outdoor）・講堂用（hall）
supplies/<id> {uid, item, note, who, status: new|seen|ordered|done, createdAt}
tierTopics/<tid> {name, by, uid, createdAt}          ※ ティア表のお題
tierItems/<tid>/<iid> {t, uid, createdAt}            ※ お題のアイテム（だれでも追加）
tierLists/<tid>/<uid> {who, uid, r{<iid>: S|A|B|C|D}, createdAt, updatedAt}   ※ 1端末1つ
```

時刻（ライブ側）は「その日の0時からの分」。

### ルール（`database.rules.json`）

- 読むのは誰でも可（`weeks`, `liveIdx`, `lives`, `tpls`, `supplies`）
- 運営アカウント（上のメール）だけ：週の設定、ライブの設定・進行・機材リスト、テンプレート、備品の状態変更
- メンバー：自分の uid のものだけ作成・削除。希望は「希望募集中」のときだけ、自由予約は「自由予約」のときだけ確定で入れられる
- **ルールを変えたら、Firebase コンソール → Realtime Database →「ルール」に貼り直して「公開」してもらう必要がある**（GitHub に push しただけでは反映されない）

## 3. 機能（いま本番に入っているもの）

**部室予約**
- 週間表（9:00〜20:30、月〜日）。毎週土曜の部会で翌週分を募集
- 流れ：準備中 → 希望募集中 → 部会で運営が「確定」 → 自由予約（先着）
- 希望＝「練習できる時間帯」＋「練習時間（上限は既定2時間、運営が変更可）」。ずらして全員入るなら被り扱いしない
- 優先度：バンド練習 > ドラム練習 > その他（運営が入れ替え可）。同じなら先に出した順
- 被りは「誰と何時が被っているか」を表示。出す前に「入れそうか」も表示
- 「＋ 希望を出す」ボタン（週間表が埋まっていても出せる）
- 運営：調整の提案（30分ずつ削って全員入る案。1時間が下限）、部会ボタン（土 12:30〜13:30、「部会中」表示）、練習表の画像保存
- 希望一覧・自分の予約は曜日ごと・時間順
- 今日画面（いま使用中・次・空き）、カレンダー追加（Google／.ics、1時間前通知）
- 色は種別ではなく、となり合う予約が見分けやすいよう自動
- 変更・削除は予約した端末（同じブラウザ）からだけ

**ライブ**（右上メニュー →「ライブ」）
- ライブ名は自由入力。本番の日は複数日OK、バンドを日に振り分け
- 日ごとに「開演」か「リハ開始」のどちらかを決めると、もう一方をバンド数×リハ時間＋休憩から自動計算
- 使える時間（開始〜終わり）を入れると「最大何バンド入るか」を表示
- セトリ提出（紙と同じ項目：メンバー構成 Vo./Cho./MC/EGt./Ba./Dr./Key./その他、曲名・予想時間・要望、合計自動。＋使うドラム・機材（部のもの／私物／会場のもの）、備考）。受付の締め切りあり
- 持ち時間は「セトリの合計」か「〇分固定」をライブごとに選択
- タイムテーブル自動作成。リハは逆リハ／本番順／手動。LINE用コピー
- 当日画面（全員閲覧）：本番中・次・リハ中・〇分押し。運営が「開始」を押す／実際の開始時間を入れると後ろが全部ずれる
- 持ち出し機材チェック（行き・帰り）。テンプレート（外ステージ用・講堂用）は運営が編集可

**備品リクエスト**（メニュー →「備品リクエスト」）
- 誰でも申請 → 運営が「確認した → 注文済み → 届いた」

## 4. 直し方・出し方

ソースは `dev/src/` に分割して置いてある。`index.html` は組み立てた結果なので直接いじらない。

```
python3 dev/build.py        # 本番用 index.html を作る
python3 dev/build.py beta   # テスト版 beta/index.html を作る
node --check dev/built_check.js   # 文法チェック
```

- 組み立て順：part2 → part2db → part3 → part3b → part3c → part3d → part4a → part4b → part4d → part5 → part4c（part4c に boot がある）
- 主なファイル：`part1.html`（HTMLとCSS）、`part2.js`（共通・計算）、`part2db.js`（Firebase）、`part3*.js`（週間表・一覧・今日）、`part4a.js`（運営画面）、`part4b.js`（予約フォーム）、`part4d.js`（調整の提案）、`part5.js`（メニュー・ライブ・備品）、`part4c.js`（描画と起動）
- 本番に出すとき：`sw.js` の `VERSION` を1つ上げる（古い画面が残らないように）→ main に push → 1〜2分で反映
- テスト：`dev/test/` にルールのテスト（`node live_rules_test.js`, `node rules_test.js`）。`rtdb-mock.js` は Firebase のメモリ上の偽物（ルール評価つき）
- 新機能はまず `beta/` に出して、ユーザーにOKをもらってから本番に出す、という進め方にしている

## 5. 制限・注意

- 無料プラン：DB 1GB／同時接続100／1日の読み書きに上限。Cloud Functions は使えない（サーバー側で自動で動く処理、LINEへの自動通知などは不可）
- LINE Notify は終了済み。Messaging API の無料枠は月200通（人数ぶん数えられるので、グループ通知には足りない）
- LINE はリンク画像をキャッシュするので、画像を変えたら URL の `v=` を変える
- メンバーは匿名ログインなので、別の端末・別のブラウザからは自分の予約を直せない（運営なら直せる）

## 6. 進め方の好み（ユーザー）

- 見やすさ・わかりやすさが最優先。説明はカジュアルな口調で、かしこまりすぎない
- 使い方の画像（スライド）は「！」を使わない
- 大きな変更は「話がまとまるまで変えない」→ テスト版で確認 →「反映して」で本番へ
- 暗証番号・パスワードはチャットに書かない／書かせない

## 7. ティア表（tier/）

- 身内用のティア表。お題を作る → アイテムはだれでも追加 → S〜D（固定）に並べて名前つきで保存 → みんなのを見られる＋「みんなの平均」（S=5〜D=1点の平均。置いてない人は数えない）
- 自分の表は作った端末だけ直せる・消せる（キーが匿名uidなので1端末1つ）。お題とアイテムはだれでも消せる（身内用なのでこうした。お題を消すと中の表も全部消える）。運営は他人の表も消せる（ページ下の「運営」から暗証番号でログイン）
- `?seed=gakushoku` で開くと見本「学食情弱ティア表」を作る（もうあれば何もしない）
- 画像で保存（canvasで描く。スマホは共有シート、無理なら長押し保存の画面）、リンクをコピー（`?t=お題&l=uid|avg`、LINE用に `openExternalBrowser=1` つき）
- ソースは `dev/tier/`（`tier.css`, `tier.js`）。`python3 dev/tier/build.py` で `tier/index.html` を作る。予約サイトの `dev/build.py` とは別
- ルールのテスト：`node dev/test/tier_rules_test.js`
- 予約サイトの sw.js はルート全体にかかるが、ページ本体は「最新を優先」なのでティア表にも悪さはしない
