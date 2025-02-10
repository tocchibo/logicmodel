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

// Undo用スタック
let undoStack = [];

function saveState() {
  // 深いコピーで現在の状態を保存
  if (logicModelData) {
    undoStack.push(JSON.parse(JSON.stringify(logicModelData)));
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
        return;
    }
    // コマンドをパースして内部JSONモデルに変換
    logicModelData = parseCommands(commands);
    // 既存要素からカウンターを更新
    updateElementCounters();
    // クリア時にはUndoスタックもリセット
    undoStack = [];
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
  logicModelData = { title: "", elements: {}, relations: [] };
  undoStack = [];
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
    reRenderModel();
  } else {
    alert("これ以上戻せません");
  }
}

// Global delete キーイベント（編集中の対象を削除）
document.addEventListener('keydown', function(e) {
    if (e.key === "Delete") {
        if (window.currentEditingType === "element" && window.currentEditingId) {
            deleteElement(window.currentEditingId);
        } else if (window.currentEditingType === "edge" && window.currentEditingEdge) {
            deleteEdge(window.currentEditingEdge.from, window.currentEditingEdge.to);
        }
    }
});
