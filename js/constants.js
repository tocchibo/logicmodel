/* js/constants.js - アプリケーション定数 */

// タイミング関連の定数
const TIMING = {
  DEBOUNCE_DELAY: 300,        // デバウンス遅延（ミリ秒）
  MESSAGE_DURATION: 2000,     // メッセージ表示時間
  HIGHLIGHT_DURATION: 500,    // ハイライトアニメーション時間
  PANEL_OFFSET: 10           // パネル表示時の画面端からのオフセット
};

// カテゴリー定義
const CATEGORIES = {
  INPUT: 'input',
  ACTIVITY: 'activity',
  OUTPUT: 'output',
  OUTCOME: 'outcome',
  IMPACT: 'impact'
};

// 全カテゴリーのリスト
const ALL_CATEGORIES = Object.values(CATEGORIES);

// CSSクラス名
const CSS_CLASSES = {
  // ノード関連
  NODE_HOVER: 'node-hover',
  NODE_RELATED: 'node-related',
  NODE_SELECTED: 'node-selected',
  NEWLY_ADDED_NODE: 'newly-added-node',
  
  // エッジ関連
  EDGE_HOVER: 'edge-hover',
  EDGE_RELATED: 'edge-related',
  NEWLY_ADDED_EDGE: 'newly-added-edge',
  
  // パネル関連
  EDIT_PANEL_CONTENT: 'edit-panel-content',
  EDIT_PANEL_SECTION: 'edit-panel-section',
  EDIT_PANEL_BUTTONS: 'edit-panel-buttons',
  PANEL_BUTTON: 'panel-button'
};

// DOM要素ID
const ELEMENT_IDS = {
  // メイン要素
  COMMANDS: 'commands',
  OUTPUT: 'output',
  OUTPUT_CONTAINER: 'outputContainer',
  
  // 編集関連
  EDIT_PANEL: 'editPanel',
  EDITING_MENU: '.editing-menu',
  
  // ボタン
  SAVE_BUTTON: 'saveButton',
  LOAD_BUTTON: 'loadButton',
  ADD_ELEMENT_BUTTON: 'addElementButton',
  UNDO_BUTTON: 'undoButton',
  REDO_BUTTON: 'redoButton',
  HELP_BUTTON: 'helpButton',
  
  // フォーム要素
  JSON_FILE_INPUT: 'jsonFileInput',
  CORRECTION_FORM: 'correctionForm',
  CORRECTION_INSTRUCTIONS: 'correctionInstructions',
  COPY_CORRECTION_BUTTON: 'copyCorrectionButton',
  COPY_SUCCESS: 'copySuccess',
  
  // コントロール
  SPLINE_TYPE: 'splineType',
  EDGE_TYPE: 'edgeType',
  EDGE_ATTACHMENT_STYLE: 'edgeAttachmentStyle',
  
  // ツールチップ・パネル
  RELATION_TOOLTIP: 'relationTooltip',
  POWERPOINT_HELP_PANEL: 'powerpointHelpPanel'
};

// ファイル関連
const FILE_NAMES = {
  LOGIC_MODEL_JSON: 'logic_model.json',
  LOGIC_MODEL_PNG: 'logic_model.png',
  LOGIC_MODEL_SVG: 'logic_model.svg'
};

// MIMEタイプ
const MIME_TYPES = {
  JSON: 'application/json',
  SVG: 'image/svg+xml',
  SVG_CHARSET: 'image/svg+xml;charset=utf-8'
};

// Graphviz設定
const GRAPHVIZ_CONFIG = {
  FONT_NAME: 'Arial',
  TITLE_FONT_SIZE: 24,
  CLUSTER_FILL_COLOR: '#f5f5f5',
  NODE_FILL_COLOR: 'white',
  PNG_PADDING: 40,
  CANVAS_BG_COLOR: 'white'
};

// エラーメッセージ
const ERROR_MESSAGES = {
  NO_MODEL_DATA: 'ロジックモデルのデータが存在しません。',
  NO_MODEL_TO_SAVE: '保存するロジックモデルがありません。',
  NO_SVG_GENERATED: 'ロジックモデルが生成されていません',
  RENDER_ERROR: 'エラーが発生しました',
  COPY_FAILED: 'コピーに失敗しました',
  IMAGE_GENERATION_FAILED: '画像の生成に失敗しました',
  JSON_LOAD_FAILED: '読み込みに失敗しました。正しい形式のファイルを選択してください。'
};