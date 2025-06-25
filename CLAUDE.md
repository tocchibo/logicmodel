# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要
ロジックモデル描画・編集のWebアプリケーション。コマンドベースの入力からビジュアルなロジックモデルを生成し、インタラクティブに編集できる。

**技術スタック**: HTML5, CSS3, Vanilla JavaScript, Viz.js, Font Awesome
**特徴**: フレームワークレス、シンプルな構成、個人利用前提

## アプリケーションの起動方法
index.htmlをブラウザで開くだけで動作する。ビルドプロセスは不要。

## アーキテクチャと重要な設計方針

### コア構造
- **js/app.js**: アプリケーション全体の状態管理（`logicModelData`が唯一の真実の源）
- **js/logicModel.js**: コマンド解析とGraphviz DOT形式への変換
- **js/ui.js**: DOM操作とイベントハンドリング
- **js/commandsGenerator.js**: 内部モデルからコマンド文字列への逆変換
- **js/downloads.js**: SVG/PNGエクスポート機能

### データフロー
1. コマンド入力 → `parseCommands()` → 内部モデル（JSON）→ `generateDotFromModel()` → DOT形式 → Viz.js → SVG
2. 編集操作 → 内部モデル更新 → `saveState()` → 再描画

### 内部データ構造
```javascript
{
  title: "タイトル",
  elements: {
    "input1": { id: "input1", label: "ラベル", category: "input" }
  },
  relations: [
    { from: "input1", to: "activity1" }
  ]
}
```

### 重要な実装詳細
- アンドゥ/リドゥは`undoStack`/`redoStack`でスナップショット管理
- SVG要素への動的イベントハンドラー追加（`attachSVGEventHandlers()`）
- DFSによる上下流ノード探索（`getUpstreamAll()`/`getDownstreamAll()`）
- 編集パネルの画面端はみ出し防止（`positionPanel()`）

### 開発時の注意点
- グローバル変数は最小限に（必要な関数のみ`window`に公開）
- エラーハンドリングは最小限でOK（内部利用前提）
- 可読性とメイン処理の理解しやすさを最優先
- 外部ライブラリはCDNから読み込み（Viz.js、Font Awesome）

## リファクタリング方針（2024年実装）

### アーキテクチャの改善点
1. **状態管理の統一**: `AppState`オブジェクトによる中央集権的な状態管理
2. **共通ユーティリティ**: `utils.js`で重複コードを削減
3. **定数の管理**: `constants.js`でマジックナンバーとCSSクラス名を統一
4. **イベント処理**: インラインイベントを廃止し、`addEventListener`に統一
5. **関数の責務分離**: 100行を超える関数を機能別に分割

### 新しいファイル構成
- **js/constants.js**: アプリケーション定数（タイミング、クラス名、メッセージ等）
- **js/utils.js**: 共通ユーティリティ（コピー、DOM操作、ファイルダウンロード等）
- **js/app.js**: 状態管理とメインロジック（AppStateオブジェクト中心）
- **js/ui.js**: UI操作とイベントハンドリング（責務分離済み）

### 状態管理のベストプラクティス
```javascript
// AppStateオブジェクトを経由した状態更新
AppState.logicModelData = newData;
AppState.isEdited = true;
saveState(); // 履歴管理
```

### イベント処理のガイドライン
- HTMLにはインラインイベントを記述しない
- 全イベントリスナーは`initEventListeners()`で集約
- data属性を使用してボタンアクションを識別
- イベントハンドラーは責務ごとに関数分割

### エラーハンドリングの統一
```javascript
// 統一されたエラー処理
showError(ERROR_MESSAGES.NO_MODEL_DATA);
copyToClipboard(text, onSuccess, onError);
```

### 今後の拡張時の注意
- 新機能追加時は必ずAppStateを経由して状態管理
- 新しいDOM操作はutils.jsの関数を活用
- CSSクラス操作はconstants.jsの定数を使用
- 100行を超える関数は責務ごとに分割を検討