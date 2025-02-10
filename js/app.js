/* js/app.js */
let lastProcessTime = 0;
const DEBOUNCE_TIME = 300;
let logicModelData = null;
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

  if (commands.trim() === '') {
    document.getElementById('output').innerHTML = '';
    document.getElementById("correctionForm").style.display = "none";
    if (editingMenu) editingMenu.style.display = 'none';
    if (outputContainer) outputContainer.style.display = 'none';
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
  const editingMenu = document.querySelector('.editing-menu');
  const outputContainer = document.getElementById('outputContainer');
  if (editingMenu) editingMenu.style.display = 'none';
  if (outputContainer) outputContainer.style.display = 'none';
  logicModelData = { title: "", elements: {}, relations: [] };
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
  }
}

function redoLastAction() {
  if (redoStack.length > 0) {
    undoStack.push(JSON.parse(JSON.stringify(logicModelData)));
    logicModelData = redoStack.pop();
    updateUndoRedoButtons();
    reRenderModel();
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
});
