/* js/app.js */

// アプリケーション状態を統一管理
const AppState = {
  // モデルデータ
  logicModelData: null,
  
  // 要素カウンター
  elementCounters: {
    input: 1,
    activity: 1,
    output: 1,
    outcome: 1,
    impact: 1
  },
  
  // 編集履歴
  undoStack: [],
  redoStack: [],
  isEdited: false,
  
  // UI状態
  lastProcessTime: 0,
  isWaitingForRelationEnd: false,
  startingNodeForRelation: null,
  selectedNodesForRelation: [],
  currentEditingType: null,
  currentEditingId: null,
  currentEditingEdge: null
};

// グローバル参照（後方互換性のため一時的に残す）
let logicModelData = null;
let elementCounters = AppState.elementCounters;
let undoStack = AppState.undoStack;
let redoStack = AppState.redoStack;
let isEdited = false;

/**
 * 保存ボタンの状態を更新する
 * ・内部にロジックモデルが保持されていなければ disabled にする
 */
function updateSaveButtonState() {
  const saveBtn = document.getElementById(ELEMENT_IDS.SAVE_BUTTON);
  if (!AppState.logicModelData) {
    saveBtn.disabled = true;
  } else {
    saveBtn.disabled = false;
  }
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById(ELEMENT_IDS.UNDO_BUTTON);
  const redoBtn = document.getElementById(ELEMENT_IDS.REDO_BUTTON);
  if (undoBtn) undoBtn.disabled = (AppState.undoStack.length === 0);
  if (redoBtn) redoBtn.disabled = (AppState.redoStack.length === 0);
}

function saveState() {
  if (AppState.logicModelData) {
    AppState.undoStack.push(deepClone(AppState.logicModelData));
    AppState.isEdited = true;
    isEdited = true; // 後方互換性
    AppState.redoStack = [];
    updateUndoRedoButtons();
  }
}

async function processCommands() {
  const currentTime = Date.now();
  if (currentTime - AppState.lastProcessTime < TIMING.DEBOUNCE_DELAY) return;
  AppState.lastProcessTime = currentTime;

  const commands = document.getElementById(ELEMENT_IDS.COMMANDS).value;
  const editingMenu = document.querySelector(ELEMENT_IDS.EDITING_MENU);
  const outputContainer = document.getElementById(ELEMENT_IDS.OUTPUT_CONTAINER);

  toggleDisplay(ELEMENT_IDS.COPY_SUCCESS, false);
  document.getElementById(ELEMENT_IDS.CORRECTION_INSTRUCTIONS).value = "";

  // コマンド入力エリアが空欄の場合、描画・修正フォームなどは非表示にし、
  // 内部のロジックモデルもクリア（null）とし、保存ボタンを disabled にする
  if (commands.trim() === '') {
    document.getElementById(ELEMENT_IDS.OUTPUT).innerHTML = '';
    setMultipleDisplays({
      [ELEMENT_IDS.CORRECTION_FORM]: false,
      [ELEMENT_IDS.EDITING_MENU]: false,
      [ELEMENT_IDS.OUTPUT_CONTAINER]: false
    });
    AppState.logicModelData = null;
    logicModelData = null; // 後方互換性
    updateSaveButtonState();
    return;
  } else {
    if (editingMenu) editingMenu.style.display = 'flex';
    if (outputContainer) outputContainer.style.display = 'block';
  }
  
  AppState.logicModelData = parseCommands(commands);
  logicModelData = AppState.logicModelData; // 後方互換性
  AppState.isEdited = false;
  isEdited = false; // 後方互換性
  updateElementCounters();
  AppState.undoStack = [];
  AppState.redoStack = [];
  updateUndoRedoButtons();
  updateSaveButtonState();
  await renderLogicModelFromJSON(AppState.logicModelData);
}

function updateElementCounters() {
  AppState.elementCounters = { input: 1, activity: 1, output: 1, outcome: 1, impact: 1 };
  for (const id in AppState.logicModelData.elements) {
    const elem = AppState.logicModelData.elements[id];
    const cat = elem.category;
    const num = parseInt(id.replace(cat, '')) || 0;
    if (num >= AppState.elementCounters[cat]) {
      AppState.elementCounters[cat] = num + 1;
    }
  }
  elementCounters = AppState.elementCounters; // 後方互換性
}

function clearCommands() {
  document.getElementById(ELEMENT_IDS.COMMANDS).value = '';
  document.getElementById(ELEMENT_IDS.OUTPUT).innerHTML = '';
  document.getElementById(ELEMENT_IDS.CORRECTION_INSTRUCTIONS).value = '';
  
  setMultipleDisplays({
    [ELEMENT_IDS.CORRECTION_FORM]: false,
    [ELEMENT_IDS.EDITING_MENU]: false,
    [ELEMENT_IDS.OUTPUT_CONTAINER]: false
  });
  
  // 内部のロジックモデルをクリア
  AppState.logicModelData = null;
  logicModelData = null; // 後方互換性
  updateSaveButtonState();
  AppState.undoStack = [];
  AppState.redoStack = [];
  AppState.isEdited = false;
  isEdited = false; // 後方互換性
  updateUndoRedoButtons();
}

function undoLastAction() {
  if (AppState.undoStack.length > 0) {
    AppState.redoStack.push(deepClone(AppState.logicModelData));
    AppState.logicModelData = AppState.undoStack.pop();
    logicModelData = AppState.logicModelData; // 後方互換性
    updateUndoRedoButtons();
    reRenderModel();
    updateSaveButtonState();
  }
}

function redoLastAction() {
  if (AppState.redoStack.length > 0) {
    AppState.undoStack.push(deepClone(AppState.logicModelData));
    AppState.logicModelData = AppState.redoStack.pop();
    logicModelData = AppState.logicModelData; // 後方互換性
    updateUndoRedoButtons();
    reRenderModel();
    updateSaveButtonState();
  }
}

async function reRenderModel() {
  if (AppState.logicModelData) await renderLogicModelFromJSON(AppState.logicModelData);
}

function updateCopyCorrectionButton() {
  const btn = document.getElementById(ELEMENT_IDS.COPY_CORRECTION_BUTTON);
  const instructions = document.getElementById(ELEMENT_IDS.CORRECTION_INSTRUCTIONS).value.trim();
  btn.disabled = (!AppState.isEdited && instructions === "");
}

function copyCorrectionInstructions() {
  const instructions = document.getElementById(ELEMENT_IDS.CORRECTION_INSTRUCTIONS).value.trim();
  let textToCopy = "";
  if (AppState.isEdited) {
    textToCopy = generateCommandsFromModel(AppState.logicModelData) + "\n\n" +
                 "このようにロジックモデルを修正しました。この修正に加え、以下を修正して：" + "\n" +
                 instructions;
  } else {
    textToCopy = instructions;
  }
  
  copyToClipboard(textToCopy,
    () => showTemporaryMessage(ELEMENT_IDS.COPY_SUCCESS, TIMING.MESSAGE_DURATION),
    (err) => showError(ERROR_MESSAGES.COPY_FAILED, err)
  );
}

// イベントリスナーの初期化
function initEventListeners() {
  // コマンド入力
  const commandsTextarea = document.getElementById(ELEMENT_IDS.COMMANDS);
  if (commandsTextarea) {
    commandsTextarea.addEventListener('input', debounce(processCommands, TIMING.DEBOUNCE_DELAY));
  }
  
  // 修正指示
  const correctionTextarea = document.getElementById(ELEMENT_IDS.CORRECTION_INSTRUCTIONS);
  if (correctionTextarea) {
    correctionTextarea.addEventListener('input', updateCopyCorrectionButton);
  }
  
  // 保存・読み込み
  document.getElementById(ELEMENT_IDS.SAVE_BUTTON).addEventListener('click', saveLogicModel);
  document.getElementById(ELEMENT_IDS.LOAD_BUTTON).addEventListener('click', loadLogicModel);
  document.getElementById(ELEMENT_IDS.JSON_FILE_INPUT).addEventListener('change', handleFileLoad);
  
  // アンドゥ・リドゥ
  document.getElementById(ELEMENT_IDS.UNDO_BUTTON).addEventListener('click', undoLastAction);
  document.getElementById(ELEMENT_IDS.REDO_BUTTON).addEventListener('click', redoLastAction);
  
  // コントロール
  document.getElementById(ELEMENT_IDS.SPLINE_TYPE).addEventListener('change', reRenderModel);
  document.getElementById(ELEMENT_IDS.EDGE_TYPE).addEventListener('change', reRenderModel);
  document.getElementById(ELEMENT_IDS.EDGE_ATTACHMENT_STYLE).addEventListener('change', reRenderModel);
  
  // ダウンロード
  document.getElementById('pngDownloadButton').addEventListener('click', downloadPNG);
  document.getElementById('svgDownloadButton').addEventListener('click', downloadSVG);
  document.getElementById(ELEMENT_IDS.POWERPOINT_HELP_BUTTON).addEventListener('click', showPowerpointHelpPanel);
  
  // 修正指示コピー
  document.getElementById(ELEMENT_IDS.COPY_CORRECTION_BUTTON).addEventListener('click', copyCorrectionInstructions);
  
  // キーボードショートカット
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

document.addEventListener('DOMContentLoaded', function() {
  initEventListeners();
  updateSaveButtonState();
});

function handleKeyboardShortcuts(e) {
  // テキストフィールド（INPUT, TEXTAREA, contentEditable）の編集中の場合は除外
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
    return;
  }

  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undoLastAction();
  } else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
    e.preventDefault();
    redoLastAction();
  }
}

/* ---------- 新規機能：保存／読込機能 ---------- */

/**
 * 保存機能
 * 現在のロジックモデル（logicModelData）を JSON 形式でダウンロードする
 */
function saveLogicModel() {
  if (!AppState.logicModelData) {
    showError(ERROR_MESSAGES.NO_MODEL_TO_SAVE);
    return;
  }
  const jsonStr = JSON.stringify(AppState.logicModelData, null, 2);
  downloadFile(jsonStr, FILE_NAMES.LOGIC_MODEL_JSON, MIME_TYPES.JSON);
}

/**
 * 読込機能
 * 隠しファイル入力を起動して JSON ファイルを選択する
 */
function loadLogicModel() {
  const fileInput = document.getElementById(ELEMENT_IDS.JSON_FILE_INPUT);
  fileInput.value = "";
  fileInput.click();
}

function handleFileLoad(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const loadedModel = JSON.parse(evt.target.result);
      AppState.logicModelData = loadedModel;
      logicModelData = AppState.logicModelData; // 後方互換性
      
      // 読み込んだロジックモデルからコマンド文字列を生成し、コマンド入力フォームに設定
      const commandsText = generateCommandsFromModel(AppState.logicModelData);
      document.getElementById(ELEMENT_IDS.COMMANDS).value = commandsText;
      
      // 編集メニュー、描画領域、修正フォームなどを表示
      setMultipleDisplays({
        [ELEMENT_IDS.EDITING_MENU]: true,
        [ELEMENT_IDS.OUTPUT_CONTAINER]: true,
        [ELEMENT_IDS.CORRECTION_FORM]: true
      });
      document.querySelector(ELEMENT_IDS.EDITING_MENU).style.display = "flex"; // flexのため特別処理
      
      updateElementCounters();
      AppState.undoStack = [];
      AppState.redoStack = [];
      updateUndoRedoButtons();
      
      reRenderModel();
      updateSaveButtonState();
    } catch (error) {
      showError(ERROR_MESSAGES.JSON_LOAD_FAILED, error);
    }
  };
  reader.readAsText(file);
}

/* ---------- 以下、既存のUI関連のコード ---------- */

// （js/ui.js 側のコードは変更せず、こちらの app.js との連携のみ）
