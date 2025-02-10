/* js/app.js */
let lastProcessTime = 0;
const DEBOUNCE_TIME = 300;
let logicModelData = null;  // 内部で保持するJSON形式のロジックモデル
// 各カテゴリーごとのユニークなID生成用カウンター
let elementCounters = {
  input: 1,
  activity: 1,
  output: 1,
  outcome: 1,
  impact: 1
};

// Undo用スタックと編集フラグ
let undoStack = [];
let isEdited = false;

function updateUndoButton() {
  const btn = document.getElementById("undoButton");
  if (btn) {
    btn.disabled = (undoStack.length === 0);
  }
}

function saveState() {
  if (logicModelData) {
    // 深いコピーで現在の状態を保存
    undoStack.push(JSON.parse(JSON.stringify(logicModelData)));
    isEdited = true;
    updateUndoButton();
  }
}

async function processCommands() {
  const currentTime = Date.now();
  if (currentTime - lastProcessTime < DEBOUNCE_TIME) {
    return;
  }
  lastProcessTime = currentTime;

  const commands = document.getElementById('commands').value;
  if (commands.trim() === '') {
    document.getElementById('output').innerHTML = '';
    document.getElementById("correctionForm").style.display = "none";
    return;
  }
  // コマンドをパースして内部JSONモデルに変換
  logicModelData = parseCommands(commands);
  isEdited = false;
  updateElementCounters();
  // Undoスタックをリセット
  undoStack = [];
  updateUndoButton();
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
  logicModelData = { title: "", elements: {}, relations: [] };
  undoStack = [];
  isEdited = false;
  updateUndoButton();
}

// splineType や edgeType の変更時に再描画
async function reRenderModel() {
  if (logicModelData) {
    await renderLogicModelFromJSON(logicModelData);
  }
}

function undoLastAction() {
  if (undoStack.length > 0) {
    logicModelData = undoStack.pop();
    updateUndoButton();
    reRenderModel();
  }
}

// 修正指示フォーム関連の関数
function updateCopyCorrectionButton() {
  const btn = document.getElementById("copyCorrectionButton");
  const instructions = document.getElementById("correctionInstructions").value.trim();
  if (!isEdited && instructions === "") {
    btn.disabled = true;
  } else {
    btn.disabled = false;
  }
}

function copyCorrectionInstructions() {
  const instructions = document.getElementById("correctionInstructions").value.trim();
  let textToCopy = "";
  if (isEdited) {
    textToCopy = generateCommandsFromModel(logicModelData) + "\n\n" +
                 "このようにロジックモデルを修正しました。この修正に加え、以下を修正：" + "\n" +
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

// イベントリスナーを登録（修正指示フォームの入力内容でボタンを更新）
document.addEventListener('DOMContentLoaded', function(){
  const correctionTextarea = document.getElementById("correctionInstructions");
  if (correctionTextarea) {
    correctionTextarea.addEventListener('input', updateCopyCorrectionButton);
  }
});
