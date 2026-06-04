# 課題構造マップアプリ 引継ぎメモ

## 現在のブランチ

`issue-map-renderer-spike`

このブランチは、課題構造マップの描画・編集UIを既存ロジックモデルアプリとは分離して検討するためのブランチ。

## 直近のコミット

- `e9f3096 Add issue map renderer prototype`
  - 課題構造マップUIのプロトタイプを追加。
  - 追加ファイル:
    - `issue-map.html`
    - `css/issue-map.css`
    - `js/issueMapApp.js`
- `9822fd3 Add issue map design docs and sample data`
  - 設計方針、AIシステムプロンプト、テストJSONを追加。
  - 追加ファイル:
    - `docs/issue-structure-map-app-design.md`
    - `docs/issue-map-ai-system-prompt.md`
    - `docs/test_issue_map.json`

## 既存アプリへの影響

既存のロジックモデルアプリは変更していない。

触っていない主要ファイル:

- `index.html`
- `css/style.css`
- `js/app.js`
- `js/logicModel.js`
- `js/ui.js`
- `js/commandsGenerator.js`
- `js/downloads.js`
- `js/constants.js`
- `js/utils.js`

`issue-map.html` は別ページとして追加されている。

## 現在のプロトタイプの状態

`issue-map.html` は、AIが生成した `issue-map/v1` JSONを貼り付けて表示・編集するための別ページ。

主な機能:

- `docs/test_issue_map.json` のサンプル読込
- JSONバリデーション
- ノード、関係、ループ、根拠の表示
- ノード追加、関係追加
- 選択したノード・関係の編集
- JSON保存、JSON読込、JSONコピー
- AI修正用プロンプトコピー
- 16:9想定のSVG表示とSVG保存

ただし、描画は独自SVG実装であり、関係線のルーティングと可読性に限界が出ている。

## 検証でわかったこと

スクラッチ実装では、以下が難しい。

- 全関係を表示したときの線の混雑制御
- ノードを避ける矢印ルーティング
- 矢印の始点・終点を常に視認できる状態に保つこと
- PowerPointに貼れる見やすい16:9図面として整えること
- 手動調整、ズーム、パン、選択、ドラッグの実装品質を上げること

SIIFの課題構造マップ例からは、次が重要だと整理した。

- 全体の所在を観点帯で見せる
- 関係を一意に復元できるようにする
- 線だけに意味を背負わせず、IDや一覧と組み合わせる
- ループや重要関係は必要に応じて強調する
- 最終的な美観は人が手修正できる余地を残す

## 次の方針

描画層をスクラッチSVGから Cytoscape.js に切り替える。

理由:

- CDNで静的サイトに組み込める
- ノード、エッジ、矢印、ラベル、選択、ドラッグ、パン、ズームが揃っている
- 複雑なネットワークの操作に向いている
- PNG出力に対応しており、PowerPoint貼り付け用途に使いやすい

想定するCDN:

```html
<script src="https://unpkg.com/cytoscape/dist/cytoscape.min.js"></script>
```

必要ならレイアウト拡張もCDNで追加する。

候補:

- `cytoscape-cose-bilkent`
- `cytoscape-dagre`

## Cytoscape.js移行時の実装メモ

既存のJSONスキーマは維持する。

変換方針:

- `nodes[]` を Cytoscape の node elements に変換する
- `edges[]` を Cytoscape の edge elements に変換する
- node `data` には `id`, `label`, `type`, `perspective`, `layer`, `status`, `evidenceIds` を入れる
- edge `data` には `id`, `source`, `target`, `polarity`, `confidence`, `rationale` を入れる

表示方針:

- 初期状態は全関係を表示する
- ノードは観点ごとの色で区別する
- エッジは薄めに表示し、選択時に太く強調する
- 右側の関係一覧で `E01 N002 -> N001 +` のように関係を一意に復元できるようにする
- ノードドラッグ後の位置は `layout.positions` に保持する
- PowerPoint用には `cy.png({ full: true, scale: 2 or 3 })` でPNG保存する

## 移行時に残せるもの

`js/issueMapApp.js` のうち、以下は流用できる。

- JSON読込、保存、コピー
- バリデーション
- 正規化
- 編集フォーム
- 関係一覧
- ループ一覧
- 根拠一覧
- AI修正用コピー

置き換えるべきもの:

- `createSlideSvg`
- `calculateSlideLayout`
- `appendPerspectiveBands`
- `appendEdges`
- `appendNodes`
- 独自エッジルーティング関数群

## 開発時の注意

- 既存の `index.html` アプリは壊さない。
- 課題構造マップは引き続き `issue-map.html` の別ページとして実装する。
- このリポジトリではPythonを使う場合は必ず `uv` 経由にする。
- 静的サイトとしてGitHub Pagesで動く状態を維持する。
- バックエンド、APIキー、ビルドステップは追加しない。

## ローカル確認

サーバー起動:

```bat
uv run python -m http.server 8000
```

確認URL:

- `http://localhost:8000/index.html`
- `http://localhost:8000/issue-map.html`

