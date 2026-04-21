/* js/ui.js */

// ローカル変数（AppStateに統合済み）
let relationTooltip = null;
let isCtrlPressed = false;

/**
 * 画面端にはみ出す場合、パネルの位置を調整する関数
 */
function positionPanel(panel, x, y) {
  panel.style.left = x + "px";
  panel.style.top = y + "px";
  panel.style.visibility = "hidden";
  panel.style.display = "block";
  const rect = panel.getBoundingClientRect();
  panel.style.visibility = "visible";
  let adjustedX = x;
  let adjustedY = y;
  if (rect.right > window.innerWidth) {
    adjustedX = x - (rect.right - window.innerWidth) - 10;
  }
  if (rect.bottom > window.innerHeight) {
    adjustedY = y - (rect.bottom - window.innerHeight) - 10;
  }
  panel.style.left = adjustedX + "px";
  panel.style.top = adjustedY + "px";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * SVG描画後、ノード・エッジにイベントを設定する
 */
function attachSvgEventHandlers() {
  const svg = document.querySelector('#output svg');
  if (!svg) return;

  attachNodeEventHandlers(svg);
  attachEdgeEventHandlers(svg);
  attachSvgClickHandler(svg);
}

function attachNodeEventHandlers(svg) {
  const nodes = svg.querySelectorAll('g.node');
  nodes.forEach(node => {
    node.style.cursor = "pointer";
    const nodeId = node.querySelector('title').textContent.trim();

    // ホバーイベント
    node.addEventListener('mouseenter', () => highlightRelatedElements(nodeId));
    node.addEventListener('mouseleave', () => clearRelatedHighlights());
    
    // クリックイベント
    node.addEventListener('click', e => handleNodeClick(e, node, nodeId));
  });
}

function handleNodeClick(e, node, nodeId) {
  e.stopPropagation();
  
  // 関係線待機モード
  if (AppState.isWaitingForRelationEnd) {
    handleRelationEndClick(nodeId);
    return;
  }
  
  // Ctrl+クリック（複数選択）
  if (e.ctrlKey) {
    handleNodeRelationSelection(node, nodeId);
  } else {
    // 通常クリック（編集パネル表示）
    AppState.currentEditingType = "element";
    AppState.currentEditingId = nodeId;
    showEditPanelForElement(node, nodeId, e);
  }
}

function handleRelationEndClick(nodeId) {
  const startingNode = AppState.startingNodeForRelation;
  if (startingNode && startingNode !== nodeId) {
    const relationAdded = addRelation(startingNode, nodeId);
    resetRelationWaitingState();
    clearSelection();
    hideTooltip();
    reRenderModel().then(() => {
      if (relationAdded) highlightNewRelation(startingNode, nodeId);
    });
  } else {
    resetRelationWaitingState();
    clearSelection();
    hideTooltip();
  }
}

function resetRelationWaitingState() {
  AppState.isWaitingForRelationEnd = false;
  AppState.startingNodeForRelation = null;
}

function attachEdgeEventHandlers(svg) {
  const edges = svg.querySelectorAll('g.edge');
  edges.forEach(edge => {
    edge.style.cursor = "pointer";
    edge.addEventListener('mouseover', () => edge.classList.add(CSS_CLASSES.EDGE_HOVER));
    edge.addEventListener('mouseout', () => edge.classList.remove(CSS_CLASSES.EDGE_HOVER));
    edge.addEventListener('click', e => handleEdgeClick(e, edge));
  });
}

function handleEdgeClick(e, edge) {
  e.stopPropagation();
  const edgeIdAttr = edge.getAttribute('id');
  if (edgeIdAttr && edgeIdAttr.startsWith('edge_')) {
    const parts = edgeIdAttr.substring(5).split('_');
    if (parts.length >= 2) {
      const edgeData = { from: parts[0], to: parts[1] };
      AppState.currentEditingType = "edge";
      AppState.currentEditingEdge = edgeData;
      showEditPanelForEdge(edge, edgeData, e);
    }
  }
}

function attachSvgClickHandler(svg) {
  svg.addEventListener('click', () => {
    if (AppState.isWaitingForRelationEnd) {
      resetRelationWaitingState();
      clearSelection();
      hideTooltip();
    }
    hideEditPanel();
  });
}

/* ---------- DFSによる上下流探索（各経路ごとに探索） ---------- */

/**
 * 上流方向（逆向き）の全単純パスを探索する関数
 * ・currentPath は現在の経路に含まれるノードの集合（再帰毎にコピー）
 * ・返り値は { nodes, edges } で、edges は "from->to" 形式の文字列集合
 */
function getUpstreamAll(nodeId, currentPath = new Set()) {
  let nodes = new Set();
  let edges = new Set();
  const modelData = AppState.logicModelData;
  if (!modelData) return { nodes, edges };
  
  for (let rel of modelData.relations) {
    if (rel.to === nodeId) {
      if (!currentPath.has(rel.from)) {
        edges.add(rel.from + "->" + rel.to);
        nodes.add(rel.from);
        let newPath = new Set(currentPath);
        newPath.add(rel.from);
        let result = getUpstreamAll(rel.from, newPath);
        result.nodes.forEach(n => nodes.add(n));
        result.edges.forEach(e => edges.add(e));
      }
    }
  }
  return { nodes, edges };
}

/**
 * 下流方向（順方向）の全単純パスを探索する関数
 * ・currentPath は現在の経路に含まれるノードの集合（再帰毎にコピー）
 * ・返り値は { nodes, edges } で、edges は "from->to" 形式の文字列集合
 */
function getDownstreamAll(nodeId, currentPath = new Set()) {
  let nodes = new Set();
  let edges = new Set();
  const modelData = AppState.logicModelData;
  if (!modelData) return { nodes, edges };
  
  for (let rel of modelData.relations) {
    if (rel.from === nodeId) {
      if (!currentPath.has(rel.to)) {
        edges.add(rel.from + "->" + rel.to);
        nodes.add(rel.to);
        let newPath = new Set(currentPath);
        newPath.add(rel.to);
        let result = getDownstreamAll(rel.to, newPath);
        result.nodes.forEach(n => nodes.add(n));
        result.edges.forEach(e => edges.add(e));
      }
    }
  }
  return { nodes, edges };
}

/**
 * ホバーされたノードを中心に、上下流方向の単純パス上のノードとエッジのみをハイライトする
 * - ホバーされたノードは塗りつぶし変更 (.node-hover)
 * - 上下流のノードは枠のみ変更 (.node-related)
 * - エッジは DFS で通ったもの（すべての経路の union）に含まれるもののみハイライト (.edge-related)
 */
function highlightRelatedElements(hoveredNodeId) {
  const modelData = AppState.logicModelData;
  if (!modelData) return;
  
  // 上流・下流をそれぞれ探索（各経路を全て考慮）
  const upstreamRes = getUpstreamAll(hoveredNodeId);
  const downstreamRes = getDownstreamAll(hoveredNodeId);
  
  // 関連ノード集合：ホバー対象＋上流・下流のノード
  const relatedNodes = new Set([hoveredNodeId]);
  upstreamRes.nodes.forEach(n => relatedNodes.add(n));
  downstreamRes.nodes.forEach(n => relatedNodes.add(n));
  
  // DFSで通ったエッジ集合（"from->to" 形式）の union
  const dfsEdges = new Set([...upstreamRes.edges, ...downstreamRes.edges]);
  
  const svg = document.querySelector('#output svg');
  if (!svg) return;
  
  // ノードのハイライト更新
  svg.querySelectorAll('g.node').forEach(node => {
    const id = node.querySelector('title').textContent.trim();
    if (id === hoveredNodeId) {
      node.classList.add(CSS_CLASSES.NODE_HOVER);
      node.classList.remove(CSS_CLASSES.NODE_RELATED);
    } else if (relatedNodes.has(id)) {
      node.classList.add(CSS_CLASSES.NODE_RELATED);
      node.classList.remove(CSS_CLASSES.NODE_HOVER);
    } else {
      node.classList.remove(CSS_CLASSES.NODE_HOVER, CSS_CLASSES.NODE_RELATED);
    }
  });
  
  // エッジのハイライト更新：DFSで通ったエッジのみ対象
  svg.querySelectorAll('g.edge').forEach(edge => {
    const edgeIdAttr = edge.getAttribute('id');
    if (edgeIdAttr && edgeIdAttr.startsWith('edge_')) {
      const parts = edgeIdAttr.substring(5).split('_');
      if (parts.length >= 2) {
        const from = parts[0];
        const to = parts[1];
        const key = from + "->" + to;
        if (dfsEdges.has(key)) {
          edge.classList.add(CSS_CLASSES.EDGE_RELATED);
        } else {
          edge.classList.remove(CSS_CLASSES.EDGE_RELATED);
        }
      }
    }
  });
}

/**
 * すべての上下流ハイライトを解除する
 */
function clearRelatedHighlights() {
  const svg = document.querySelector('#output svg');
  if (!svg) return;
  svg.querySelectorAll('g.node').forEach(node => {
    node.classList.remove(CSS_CLASSES.NODE_HOVER, CSS_CLASSES.NODE_RELATED);
  });
  svg.querySelectorAll('g.edge').forEach(edge => {
    edge.classList.remove(CSS_CLASSES.EDGE_RELATED);
  });
}

/* ---------- ここまで DFSによる上下流探索 ---------- */

/**
 * Ctrl＋クリックによる複数ノード選択での関係追加
 */
function handleNodeRelationSelection(node, nodeId) {
  if (AppState.selectedNodesForRelation.includes(nodeId)) {
    AppState.selectedNodesForRelation = AppState.selectedNodesForRelation.filter(id => id !== nodeId);
    node.classList.remove('node-selected');
  } else {
    AppState.selectedNodesForRelation.push(nodeId);
    node.classList.add('node-selected');
  }
  if (AppState.selectedNodesForRelation.length === 2) {
    const [from, to] = AppState.selectedNodesForRelation;
    const relationAdded = addRelation(from, to);
    clearSelection();
    reRenderModel().then(() => {
      if (relationAdded) highlightNewRelation(from, to);
    });
  }
}

/**
 * 関係追加
 */
function addRelation(from, to) {
  if (!AppState.logicModelData) return false;
  const exists = AppState.logicModelData.relations.some(rel => rel.from === from && rel.to === to);
  if (!exists) {
    saveState();
    AppState.logicModelData.relations.push({ from, to });
    return true;
  }
  return false;
}

/**
 * 選択状態を解除
 */
function clearSelection() {
  AppState.selectedNodesForRelation = [];
  const svg = document.querySelector('#output svg');
  if (svg) {
    svg.querySelectorAll('g.node').forEach(node => node.classList.remove('node-selected'));
  }
}

/**
 * 要素編集パネルの表示
 */
function showEditPanelForElement(svgNode, nodeId, event) {
  const panel = document.getElementById('editPanel');
  positionPanel(panel, event.clientX, event.clientY);
  const element = AppState.logicModelData?.elements[nodeId];
  if (!element) return;
  const labelText = element.label.replace(/\\n/g, "\n");
  const rows = Math.max(3, labelText.split("\n").length);
  panel.innerHTML = `
    <div class="edit-panel-content">
      <div class="edit-panel-section">
        <label for="editLabel">ラベル</label>
        <textarea id="editLabel" rows="${rows}">${escapeHtml(labelText)}</textarea>
      </div>
      <div class="edit-panel-section">
        <label for="editCategory">カテゴリー</label>
        <select id="editCategory">
          <option value="input" ${element.category==='input'?'selected':''}>input</option>
          <option value="activity" ${element.category==='activity'?'selected':''}>activity</option>
          <option value="output" ${element.category==='output'?'selected':''}>output</option>
          <option value="outcome" ${element.category==='outcome'?'selected':''}>outcome</option>
          <option value="impact" ${element.category==='impact'?'selected':''}>impact</option>
        </select>
      </div>
      <div class="edit-panel-buttons">
        <button type="button" data-action="apply-element" data-node-id="${escapeHtml(nodeId)}" class="panel-button">適用</button>
        <button type="button" data-action="delete-element" data-node-id="${escapeHtml(nodeId)}" class="panel-button">削除</button>
        <button type="button" data-action="start-relation" data-node-id="${escapeHtml(nodeId)}" class="panel-button">ここから始まる関係線を追加</button>
        <button type="button" data-action="close-edit-panel" class="panel-button">キャンセル</button>
      </div>
    </div>
  `;
  panel.style.display = "block";
}

/**
 * 要素編集適用
 */
function applyElementEdit(nodeId) {
  const newLabel = document.getElementById('editLabel').value;
  const newCategory = document.getElementById('editCategory').value;
  if (AppState.logicModelData?.elements[nodeId]) {
    saveState();
    AppState.logicModelData.elements[nodeId].label = newLabel.replace(/\r\n|\r|\n/g, '\\n');
    AppState.logicModelData.elements[nodeId].category = newCategory;
  }
  hideEditPanel();
  reRenderModel();
}

/**
 * 要素削除
 */
function deleteElement(nodeId) {
  if (AppState.logicModelData?.elements[nodeId]) {
    saveState();
    delete AppState.logicModelData.elements[nodeId];
    AppState.logicModelData.relations = AppState.logicModelData.relations.filter(rel => rel.from !== nodeId && rel.to !== nodeId);
  }
  hideEditPanel();
  reRenderModel();
}

/**
 * 関係編集パネルの表示（削除・キャンセルボタンのみ）
 */
function showEditPanelForEdge(edgeElement, edgeData, event) {
  const panel = document.getElementById('editPanel');
  positionPanel(panel, event.clientX, event.clientY);
  panel.innerHTML = `
    <div class="edit-panel-content">
      <div class="edit-panel-buttons">
        <button type="button" data-action="delete-edge" data-from="${escapeHtml(edgeData.from)}" data-to="${escapeHtml(edgeData.to)}" class="panel-button">削除</button>
        <button type="button" data-action="close-edit-panel" class="panel-button">キャンセル</button>
      </div>
    </div>
  `;
  panel.style.display = "block";
}

/**
 * 関係削除
 */
function deleteEdge(from, to) {
  saveState();
  AppState.logicModelData.relations = AppState.logicModelData.relations.filter(rel => !(rel.from === from && rel.to === to));
  hideEditPanel();
  reRenderModel();
}

/**
 * 編集パネルを非表示にする
 */
function hideEditPanel() {
  const panel = document.getElementById('editPanel');
  panel.style.display = "none";
  AppState.currentEditingId = null;
  AppState.currentEditingEdge = null;
  AppState.currentEditingType = null;
  hideTooltip();
}

function handleEditPanelAction(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  e.stopPropagation();

  switch (button.dataset.action) {
    case "apply-element":
      applyElementEdit(button.dataset.nodeId);
      break;
    case "delete-element":
      deleteElement(button.dataset.nodeId);
      break;
    case "start-relation":
      startRelationFrom(button.dataset.nodeId);
      break;
    case "delete-edge":
      deleteEdge(button.dataset.from, button.dataset.to);
      break;
    case "add-new-element":
      addNewElement();
      break;
    case "close-edit-panel":
      hideEditPanel();
      break;
    default:
      break;
  }
}

function handlePowerpointHelpPanelAction(e) {
  const button = e.target.closest('button[data-action="close-powerpoint-help"]');
  if (!button) return;
  e.stopPropagation();
  hidePowerpointHelpPanel();
}

/**
 * 「ここから始まる関係線を追加」ボタンの処理
 */
function startRelationFrom(nodeId) {
  if (AppState.currentEditingType === 'element' && AppState.currentEditingId === nodeId) {
    applyElementEdit(nodeId);
  }
  AppState.startingNodeForRelation = nodeId;
  AppState.isWaitingForRelationEnd = true;
  hideEditPanel();
  const svgNode = document.getElementById("node_" + nodeId);
  if (svgNode) {
    svgNode.classList.add("node-selected");
  }
  if (relationTooltip) {
    relationTooltip.style.display = "block";
  }
}

/**
 * 「要素追加」パネルの表示  
 * ※ ラベル入力エリアは <textarea> に変更して改行が使えるようにしています
 */
document.getElementById('addElementButton').addEventListener('click', function(e) {
  e.stopPropagation();
  const panel = document.getElementById('editPanel');
  positionPanel(panel, e.clientX, e.clientY);
  panel.innerHTML = `
    <div class="edit-panel-content">
      <div class="edit-panel-section">
        <label for="newElementLabel">ラベル</label>
        <textarea id="newElementLabel" rows="3"></textarea>
      </div>
      <div class="edit-panel-section">
        <label for="newElementCategory">カテゴリー</label>
        <select id="newElementCategory">
          <option value="input">input</option>
          <option value="activity">activity</option>
          <option value="output">output</option>
          <option value="outcome">outcome</option>
          <option value="impact">impact</option>
        </select>
      </div>
      <div class="edit-panel-buttons">
        <button type="button" data-action="add-new-element" class="panel-button">追加</button>
        <button type="button" data-action="close-edit-panel" class="panel-button">キャンセル</button>
      </div>
    </div>
  `;
  // デフォルトのカテゴリーは直前に追加した要素のカテゴリー（なければ "input"）
  const lastCategory = AppState.lastAddedCategory || "input";
  document.getElementById("newElementCategory").value = lastCategory;
  panel.style.display = "block";
  document.getElementById("newElementLabel").focus();
});

/**
 * 新規要素追加
 */
function addNewElement() {
  if (!AppState.logicModelData) {
    AppState.logicModelData = { title: "", elements: {}, relations: [] };
  }
  const label = document.getElementById('newElementLabel').value.trim();
  const category = document.getElementById('newElementCategory').value;
  if (!label) return;
  saveState();
  const id = category + AppState.elementCounters[category];
  AppState.elementCounters[category]++;
  // ラベル内の改行はそのまま保存（後で生成時に "\\n" に変換される）
  AppState.logicModelData.elements[id] = { id, label: label, category };
  // 最後に追加した要素のカテゴリーを保存
  AppState.lastAddedCategory = category;
  hideEditPanel();
  reRenderModel().then(() => {
    highlightNewNode(id);
  });
}

document.getElementById('editPanel').addEventListener('click', handleEditPanelAction);
document.getElementById('powerpointHelpPanel').addEventListener('click', handlePowerpointHelpPanelAction);

/**
 * 編集パネル外クリックでパネル・待機状態解除
 */
document.addEventListener('click', function(e) {
  if (!e.target.closest('#editPanel')) {
    clearSelection();
    if (AppState.isWaitingForRelationEnd) {
      AppState.isWaitingForRelationEnd = false;
      AppState.startingNodeForRelation = null;
      hideTooltip();
    }
    hideEditPanel();
  }
});

/**
 * ヘルプパネルの表示（編集ヘルプ）
 */
document.getElementById('helpButton').addEventListener('click', function(e) {
  e.stopPropagation();
  const panel = document.getElementById('editPanel');
  positionPanel(panel, e.clientX, e.clientY);
  panel.innerHTML = `
    <div class="edit-panel-content">
      <div class="edit-panel-section">
        <h3>編集ヘルプ</h3>
      </div>
      <div class="edit-panel-section">
        <table border="1" cellpadding="4" cellspacing="0" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th>目的</th>
              <th>方法</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>新規要素追加</td>
              <td>「要素追加」ボタンをクリックし、フォームに入力して追加</td>
            </tr>
            <tr>
              <td>要素編集・削除</td>
              <td>対象要素をクリックして表示されるパネルで操作</td>
            </tr>
            <tr>
              <td>関係線追加</td>
              <td>編集パネル内の「ここから始まる関係線を追加」ボタンまたはCtrl＋クリックで追加</td>
            </tr>
            <tr>
              <td>関係線削除</td>
              <td>対象関係（エッジ）をクリックし、パネルで「削除」ボタンを選択</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="edit-panel-buttons">
        <button type="button" data-action="close-edit-panel" class="panel-button">閉じる</button>
      </div>
    </div>
  `;
  panel.style.display = "block";
});

/**
 * Relation Tooltip 用ハンドラ
 */
document.addEventListener("DOMContentLoaded", function() {
  relationTooltip = document.getElementById("relationTooltip");
  document.addEventListener("keydown", function(e) {
    if (e.key === "Control") {
      isCtrlPressed = true;
      updateRelationTooltip(e);
      relationTooltip.style.display = "block";
    }
  });
  document.addEventListener("keyup", function(e) {
    if (e.key === "Control") {
      isCtrlPressed = false;
      if (!AppState.isWaitingForRelationEnd) {
        relationTooltip.style.display = "none";
      }
    }
  });
  document.addEventListener("mousemove", function(e) {
    if (isCtrlPressed || AppState.isWaitingForRelationEnd) {
      updateRelationTooltip(e);
    }
  });
});

/**
 * Relation Tooltip 更新
 */
function updateRelationTooltip(e) {
  if (!relationTooltip) return;
  let tooltipText = "";
  if (AppState.isWaitingForRelationEnd) {
    tooltipText = "終点要素をクリック";
  } else if (AppState.selectedNodesForRelation.length === 0) {
    tooltipText = "追加したい関係の始点要素をクリック";
  } else {
    tooltipText = "終点要素をクリック";
  }
  relationTooltip.textContent = tooltipText;
  relationTooltip.style.left = (e.pageX + 10) + "px";
  relationTooltip.style.top = (e.pageY + 10) + "px";
}

/**
 * Tooltip 非表示
 */
function hideTooltip() {
  if (relationTooltip) {
    relationTooltip.style.display = "none";
  }
}

/**
 * 新規追加時のハイライト（関係追加用）
 */
function highlightNewRelation(from, to) {
  const nodeFrom = document.getElementById("node_" + from);
  const nodeTo = document.getElementById("node_" + to);
  const edge = document.getElementById("edge_" + from + "_" + to);
  if (nodeFrom) nodeFrom.classList.add("newly-added-node");
  if (nodeTo) nodeTo.classList.add("newly-added-node");
  if (edge) edge.classList.add("newly-added-edge");
  setTimeout(() => {
    if (nodeFrom) nodeFrom.classList.remove("newly-added-node");
    if (nodeTo) nodeTo.classList.remove("newly-added-node");
    if (edge) edge.classList.remove("newly-added-edge");
  }, 500);
}

/**
 * 新規要素追加時のノードハイライト
 */
function highlightNewNode(id) {
  const node = document.getElementById("node_" + id);
  if (node) {
    node.classList.add("newly-added-node");
    setTimeout(() => {
      node.classList.remove("newly-added-node");
    }, 500);
  }
}

/**
 * ESCキーで待機状態を解除
 */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && AppState.isWaitingForRelationEnd) {
    AppState.isWaitingForRelationEnd = false;
    AppState.startingNodeForRelation = null;
    clearSelection();
    hideTooltip();
  }
});

/* ---------- 新規機能：パワーポイント貼付ヘルプパネル ---------- */
/**
 * パワーポイント貼付ヘルプパネルを画面中央に大きめで表示する
 * ※ クリックイベントの伝播を止め、外側クリックで自動的に閉じるようにする
 */
function showPowerpointHelpPanel(e) {
  e.stopPropagation(); // パネル表示時のクリック伝播を防止
  const panel = document.getElementById("powerpointHelpPanel");
  panel.style.position = "fixed";
  panel.style.left = "50%";
  panel.style.top = "50%";
  panel.style.transform = "translate(-50%, -50%)";
  panel.style.width = "600px";
  panel.style.maxWidth = "90%";
  panel.style.maxHeight = "90%";
  panel.style.overflowY = "auto";
  panel.innerHTML = `
    <div class="edit-panel-content">
      <div class="edit-panel-section">
        <h3>パワポ貼付ヘルプ</h3>
        <ol>
          <li>
            <strong>SVGのダウンロード</strong><br>
            SVGダウンロードボタンをクリックして、SVGファイルをダウンロードします。
          </li>
          <li>
            <strong>PowerPointへ貼り付け</strong><br>
            ダウンロードしたSVGファイルをコピーして、PowerPoint上に貼り付けます。
          </li>
          <li>
            <strong>図形に変換</strong><br>
            貼り付けたSVG画像上で右クリックし、「図形に変換」を選択します。<br>
            <img src="pics/zukei_ni_henkan.png" alt="図形に変換のスクリーンショット" style="max-width:100%; height:auto;">
          </li>
          <li>
            <strong>グループ解除</strong><br>
            変換後、再度右クリックして「グループ解除」を選択します。<br>
            <img src="pics/group_kaijo.png" alt="グループ解除のスクリーンショット" style="max-width:100%; height:auto;">
          </li>
        </ol>
        <p>
          これで、書式などを編集可能な状態でPowerPointに貼り付けることができます。
        </p>
      </div>
      <div class="edit-panel-buttons">
        <button type="button" data-action="close-powerpoint-help" class="panel-button">閉じる</button>
      </div>
    </div>
  `;
  panel.style.display = "block";
}

/**
 * パワーポイント貼付ヘルプパネルを非表示にする
 */
function hidePowerpointHelpPanel() {
  const panel = document.getElementById("powerpointHelpPanel");
  panel.style.display = "none";
}

/**
 * グローバルクリックで、パワーポイントヘルプパネル外をクリックした場合に自動で閉じる
 */
document.addEventListener('click', function(e) {
  const panel = document.getElementById("powerpointHelpPanel");
  if (panel.style.display === "block" && !panel.contains(e.target)) {
    hidePowerpointHelpPanel();
  }
});
