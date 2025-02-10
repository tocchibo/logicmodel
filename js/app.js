/* js/app.js */
let lastProcessTime = 0;
const DEBOUNCE_TIME = 300;
let logicModelData = null;  // 内部的に保持するロジックモデル。空の場合は null とする
let elementCounters = {
  input: 1,
  activity: 1,
  output: 1,
  outcome: 1,
  impact: 1
};

let undoStack = [];
let redoStack = [];
let isEdited = false;

/**
 * 保存ボタンの状態を更新する
 * ・内部にロジックモデルが保持されていなければ disabled にする
 */
function updateSaveButtonState() {
  const saveBtn = document.getElementById("saveButton");
  if (!logicModelData) {
    saveBtn.disabled = true;
  } else {
    saveBtn.disabled = false;
  }
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undoButton");
  const redoBtn = document.getElementById("redoButton");
  if (undoBtn) undoBtn.disabled = (undoStack.length === 0);
  if (redoBtn) redoBtn.disabled = (redoStack.length === 0);
}

function saveState() {
  if (logicModelData) {
    undoStack.push(JSON.parse(JSON.stringify(logicModelData)));
    isEdited = true;
    redoStack = [];
    updateUndoRedoButtons();
  }
}

async function processCommands() {
  const currentTime = Date.now();
  if (currentTime - lastProcessTime < DEBOUNCE_TIME) return;
  lastProcessTime = currentTime;

  const commands = document.getElementById('commands').value;
  const editingMenu = document.querySelector('.editing-menu');
  const outputContainer = document.getElementById('outputContainer');

  document.getElementById("copySuccess").style.display = "none";
  document.getElementById("correctionInstructions").value = "";

  // コマンド入力エリアが空欄の場合、描画・修正フォームなどは非表示にし、
  // 内部のロジックモデルもクリア（null）とし、保存ボタンを disabled にする
  if (commands.trim() === '') {
    document.getElementById('output').innerHTML = '';
    document.getElementById("correctionForm").style.display = "none";
    if (editingMenu) editingMenu.style.display = 'none';
    if (outputContainer) outputContainer.style.display = 'none';
    logicModelData = null;
    updateSaveButtonState();
    return;
  } else {
    if (editingMenu) editingMenu.style.display = 'flex';
    if (outputContainer) outputContainer.style.display = 'block';
  }
  
  logicModelData = parseCommands(commands);
  isEdited = false;
  updateElementCounters();
  undoStack = [];
  redoStack = [];
  updateUndoRedoButtons();
  updateSaveButtonState();
  await renderLogicModelFromJSON(logicModelData);
}

function updateElementCounters() {
  elementCounters = { input: 1, activity: 1, output: 1, outcome: 1, impact: 1 };
  for (const id in logicModelData.elements) {
    const elem = logicModelData.elements[id];
    const cat = elem.category;
    const num = parseInt(id.replace(cat, '')) || 0;
    if (num >= elementCounters[cat]) {
      elementCounters[cat] = num + 1;
    }
  }
}

function clearCommands() {
  document.getElementById('commands').value = '';
  document.getElementById('output').innerHTML = '';
  document.getElementById("correctionForm").style.display = "none";
  document.getElementById("correctionInstructions").value = "";
  const editingMenu = document.querySelector('.editing-menu');
  const outputContainer = document.getElementById('outputContainer');
  if (editingMenu) editingMenu.style.display = 'none';
  if (outputContainer) outputContainer.style.display = 'none';
  // 内部のロジックモデルをクリア
  logicModelData = null;
  updateSaveButtonState();
  undoStack = [];
  redoStack = [];
  isEdited = false;
  updateUndoRedoButtons();
}

function undoLastAction() {
  if (undoStack.length > 0) {
    redoStack.push(JSON.parse(JSON.stringify(logicModelData)));
    logicModelData = undoStack.pop();
    updateUndoRedoButtons();
    reRenderModel();
    updateSaveButtonState();
  }
}

function redoLastAction() {
  if (redoStack.length > 0) {
    undoStack.push(JSON.parse(JSON.stringify(logicModelData)));
    logicModelData = redoStack.pop();
    updateUndoRedoButtons();
    reRenderModel();
    updateSaveButtonState();
  }
}

async function reRenderModel() {
  if (logicModelData) await renderLogicModelFromJSON(logicModelData);
}

function updateCopyCorrectionButton() {
  const btn = document.getElementById("copyCorrectionButton");
  const instructions = document.getElementById("correctionInstructions").value.trim();
  btn.disabled = (!isEdited && instructions === "");
}

function copyCorrectionInstructions() {
  const instructions = document.getElementById("correctionInstructions").value.trim();
  let textToCopy = "";
  if (isEdited) {
    textToCopy = generateCommandsFromModel(logicModelData) + "\n\n" +
                 "このようにロジックモデルを修正しました。この修正に加え、以下を修正して：" + "\n" +
                 instructions;
  } else {
    textToCopy = instructions;
  }
  navigator.clipboard.writeText(textToCopy)
    .then(() => {
      const copySuccess = document.getElementById('copySuccess');
      copySuccess.style.display = 'inline';
      setTimeout(() => {
        copySuccess.style.display = 'none';
      }, 2000);
    })
    .catch(err => {
      console.error("コピーに失敗しました:", err);
    });
}

document.addEventListener('DOMContentLoaded', function(){
  const correctionTextarea = document.getElementById("correctionInstructions");
  if (correctionTextarea) {
    correctionTextarea.addEventListener('input', updateCopyCorrectionButton);
  }
  
  // 保存・読み込みボタンのイベントリスナーを登録
  document.getElementById("saveButton").addEventListener("click", saveLogicModel);
  document.getElementById("loadButton").addEventListener("click", loadLogicModel);
  
  // 初期状態では内部にモデルがないので、保存ボタンを disabled にする
  updateSaveButtonState();
});

document.addEventListener('keydown', function(e) {
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
});

/* ---------- 新規機能：保存／読込機能 ---------- */

/**
 * 保存機能
 * 現在のロジックモデル（logicModelData）を JSON 形式でダウンロードする
 */
function saveLogicModel() {
  if (!logicModelData) {
    alert("保存するロジックモデルがありません。");
    return;
  }
  const jsonStr = JSON.stringify(logicModelData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "logic_model.json";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 読込機能
 * 隠しファイル入力を起動して JSON ファイルを選択する
 */
function loadLogicModel() {
  const fileInput = document.getElementById("jsonFileInput");
  fileInput.value = "";
  fileInput.click();
}

document.getElementById("jsonFileInput").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const loadedModel = JSON.parse(evt.target.result);
      logicModelData = loadedModel;
      
      // 読み込んだロジックモデルからコマンド文字列を生成し、コマンド入力フォームに設定
      const commandsText = generateCommandsFromModel(logicModelData);
      document.getElementById("commands").value = commandsText;
      
      // 編集メニュー、描画領域、修正フォームなどを表示
      document.querySelector(".editing-menu").style.display = "flex";
      document.getElementById("outputContainer").style.display = "block";
      document.getElementById("correctionForm").style.display = "block";
      
      updateElementCounters();
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      
      reRenderModel();
      updateSaveButtonState();
    } catch (error) {
      console.error("JSONの読み込みエラー:", error);
      alert("読み込みに失敗しました。正しい形式のファイルを選択してください。");
    }
  };
  reader.readAsText(file);
});

/* ---------- 以下、既存のUI関連のコード ---------- */

// （js/ui.js 側のコードは変更せず、こちらの app.js との連携のみ）
