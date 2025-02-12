/* js/ui.js */

// グローバル変数
let selectedNodesForRelation = [];
let isCtrlPressed = false;
let relationTooltip = null;
window.startingNodeForRelation = null;
window.isWaitingForRelationEnd = false;

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

/**
 * SVG描画後、ノード・エッジにイベントを設定する
 */
function attachSvgEventHandlers() {
  const svg = document.querySelector('#output svg');
  if (!svg) return;

  // ノード処理
  const nodes = svg.querySelectorAll('g.node');
  nodes.forEach(node => {
    node.style.cursor = "pointer";
    const nodeId = node.querySelector('title').textContent.trim();

    // マウスエンター／リーブで上流／下流のハイライトを実現
    node.addEventListener('mouseenter', () => {
      highlightRelatedElements(nodeId);
    });
    node.addEventListener('mouseleave', () => {
      clearRelatedHighlights();
    });

    node.addEventListener('click', e => {
      e.stopPropagation();
      if (window.isWaitingForRelationEnd) {
        if (window.startingNodeForRelation && window.startingNodeForRelation !== nodeId) {
          const fromNode = window.startingNodeForRelation;
          const relationAdded = addRelation(fromNode, nodeId);
          window.isWaitingForRelationEnd = false;
          window.startingNodeForRelation = null;
          clearSelection();
          hideTooltip();
          reRenderModel().then(() => {
            if (relationAdded) highlightNewRelation(fromNode, nodeId);
          });
        } else {
          window.isWaitingForRelationEnd = false;
          window.startingNodeForRelation = null;
          clearSelection();
          hideTooltip();
        }
        return;
      }
      if (e.ctrlKey) {
        handleNodeRelationSelection(node, nodeId);
      } else {
        window.currentEditingType = "element";
        window.currentEditingId = nodeId;
        showEditPanelForElement(node, nodeId, e);
      }
    });
  });

  // エッジ処理
  const edges = svg.querySelectorAll('g.edge');
  edges.forEach(edge => {
    edge.style.cursor = "pointer";
    edge.addEventListener('mouseover', () => edge.classList.add('edge-hover'));
    edge.addEventListener('mouseout', () => edge.classList.remove('edge-hover'));
    edge.addEventListener('click', e => {
      e.stopPropagation();
      const edgeIdAttr = edge.getAttribute('id');
      if (edgeIdAttr && edgeIdAttr.startsWith('edge_')) {
        const parts = edgeIdAttr.substring(5).split('_');
        if (parts.length >= 2) {
          window.currentEditingType = "edge";
          window.currentEditingEdge = { from: parts[0], to: parts[1] };
          showEditPanelForEdge(edge, window.currentEditingEdge, e);
        }
      }
    });
  });

  // SVG全体クリックでパネル非表示
  svg.addEventListener('click', () => {
    if (window.isWaitingForRelationEnd) {
      window.isWaitingForRelationEnd = false;
      window.startingNodeForRelation = null;
      clearSelection();
      hideTooltip();
    }
    hideEditPanel();
  });
}

/* ---------- 新規追加：上流／下流のみをたどるハイライト処理 ---------- */

/**
 * 上流方向（逆向き）の連続したノードを取得
 */
function getUpstreamNodes(nodeId, visited = new Set()) {
  let upstream = new Set();
  logicModelData.relations.forEach(rel => {
    if (rel.to === nodeId && !visited.has(rel.from)) {
      visited.add(rel.from);
      upstream.add(rel.from);
      const ancestors = getUpstreamNodes(rel.from, visited);
      ancestors.forEach(n => upstream.add(n));
    }
  });
  return upstream;
}

/**
 * 下流方向（順方向）の連続したノードを取得
 */
function getDownstreamNodes(nodeId, visited = new Set()) {
  let downstream = new Set();
  logicModelData.relations.forEach(rel => {
    if (rel.from === nodeId && !visited.has(rel.to)) {
      visited.add(rel.to);
      downstream.add(rel.to);
      const descendants = getDownstreamNodes(rel.to, visited);
      descendants.forEach(n => downstream.add(n));
    }
  });
  return downstream;
}

/**
 * ホバーされたノードを中心に、上流および下流方向の連続したノード・エッジのみをハイライトする
 * ・ホバーされたノードは塗りつぶし変更（.node-hover）
 * ・上流／下流のノードは枠のみ変更（.node-related）
 */
function highlightRelatedElements(hoveredNodeId) {
  if (!logicModelData) return;
  
  const upstream = getUpstreamNodes(hoveredNodeId);
  const downstream = getDownstreamNodes(hoveredNodeId);
  
  // 対象ノード集合：ホバーされたノード、自身の上流・下流
  const relatedSet = new Set([hoveredNodeId]);
  upstream.forEach(n => relatedSet.add(n));
  downstream.forEach(n => relatedSet.add(n));
  
  const svg = document.querySelector('#output svg');
  if (!svg) return;
  
  // ノードのハイライト更新
  svg.querySelectorAll('g.node').forEach(node => {
    const id = node.querySelector('title').textContent.trim();
    if (id === hoveredNodeId) {
      node.classList.add('node-hover');      // ホバー中のノードは塗りつぶし変更
      node.classList.remove('node-related');
    } else if (relatedSet.has(id)) {
      node.classList.add('node-related');      // 上流／下流のノードは枠のみ変更（塗りは白）
      node.classList.remove('node-hover');
    } else {
      node.classList.remove('node-hover', 'node-related');
    }
  });
  
  // エッジのハイライト更新：両端が対象ノード集合内の場合のみハイライト
  svg.querySelectorAll('g.edge').forEach(edge => {
    const edgeIdAttr = edge.getAttribute('id');
    if (edgeIdAttr && edgeIdAttr.startsWith('edge_')) {
      const parts = edgeIdAttr.substring(5).split('_');
      if (parts.length >= 2) {
        const from = parts[0];
        const to = parts[1];
        if (relatedSet.has(from) && relatedSet.has(to)) {
          edge.classList.add('edge-related');
        } else {
          edge.classList.remove('edge-related');
        }
      }
    }
  });
}

/**
 * すべての上流／下流ハイライトを解除する
 */
function clearRelatedHighlights() {
  const svg = document.querySelector('#output svg');
  if (!svg) return;
  svg.querySelectorAll('g.node').forEach(node => {
    node.classList.remove('node-hover', 'node-related');
  });
  svg.querySelectorAll('g.edge').forEach(edge => {
    edge.classList.remove('edge-related');
  });
}
/* ---------- ここまで上流／下流ハイライト ---------- */

/**
 * Ctrl＋クリックによる複数ノード選択での関係追加
 */
function handleNodeRelationSelection(node, nodeId) {
  if (selectedNodesForRelation.includes(nodeId)) {
    selectedNodesForRelation = selectedNodesForRelation.filter(id => id !== nodeId);
    node.classList.remove('node-selected');
  } else {
    selectedNodesForRelation.push(nodeId);
    node.classList.add('node-selected');
  }
  if (selectedNodesForRelation.length === 2) {
    const [from, to] = selectedNodesForRelation;
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
  const exists = logicModelData.relations.some(rel => rel.from === from && rel.to === to);
  if (!exists) {
    saveState();
    logicModelData.relations.push({ from, to });
    return true;
  }
  return false;
}

/**
 * 選択状態を解除
 */
function clearSelection() {
  selectedNodesForRelation = [];
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
  const element = logicModelData.elements[nodeId];
  if (!element) return;
  // もしラベル内にリテラル "\n" が含まれていれば、実際の改行に変換する
  let labelText = element.label;
  if (labelText.indexOf('\\n') !== -1) {
    labelText = labelText.replace(/\\n/g, "\n");
  }
  const rows = Math.max(3, labelText.split("\n").length);
  panel.innerHTML = `
    <div class="edit-panel-content">
      <div class="edit-panel-section">
        <label for="editLabel">ラベル</label>
        <textarea id="editLabel" rows="${rows}">${labelText}</textarea>
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
        <button onclick="applyElementEdit('${nodeId}')" class="panel-button">適用</button>
        <button onclick="deleteElement('${nodeId}')" class="panel-button">削除</button>
        <button onclick="startRelationFrom('${nodeId}')" class="panel-button">ここから始まる関係線を追加</button>
        <button onclick="hideEditPanel()" class="panel-button">キャンセル</button>
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
  if (logicModelData.elements[nodeId]) {
    saveState();
    // 実際の改行をリテラル "\n" に変換して保存
    logicModelData.elements[nodeId].label = newLabel.replace(/\r\n|\r|\n/g, '\\n');
    logicModelData.elements[nodeId].category = newCategory;
  }
  hideEditPanel();
  reRenderModel();
}

/**
 * 要素削除
 */
function deleteElement(nodeId) {
  if (logicModelData.elements[nodeId]) {
    saveState();
    delete logicModelData.elements[nodeId];
    logicModelData.relations = logicModelData.relations.filter(rel => rel.from !== nodeId && rel.to !== nodeId);
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
        <button onclick="deleteEdge('${edgeData.from}', '${edgeData.to}')" class="panel-button">削除</button>
        <button onclick="hideEditPanel()" class="panel-button">キャンセル</button>
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
  logicModelData.relations = logicModelData.relations.filter(rel => !(rel.from === from && rel.to === to));
  hideEditPanel();
  reRenderModel();
}

/**
 * 編集パネルを非表示にする
 */
function hideEditPanel() {
  const panel = document.getElementById('editPanel');
  panel.style.display = "none";
  window.currentEditingId = null;
  window.currentEditingEdge = null;
  window.currentEditingType = null;
  hideTooltip();
}

/**
 * 「ここから始まる関係線を追加」ボタンの処理
 */
function startRelationFrom(nodeId) {
  if (window.currentEditingType === 'element' && window.currentEditingId === nodeId) {
    applyElementEdit(nodeId);
  }
  window.startingNodeForRelation = nodeId;
  window.isWaitingForRelationEnd = true;
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
        <button onclick="addNewElement()" class="panel-button">追加</button>
        <button onclick="hideEditPanel()" class="panel-button">キャンセル</button>
      </div>
    </div>
  `;
  // デフォルトのカテゴリーは直前に追加した要素のカテゴリー（なければ "input"）
  const lastCategory = window.lastAddedCategory || "input";
  document.getElementById("newElementCategory").value = lastCategory;
  panel.style.display = "block";
  document.getElementById("newElementLabel").focus();
});

/**
 * 新規要素追加
 */
function addNewElement() {
  if (!logicModelData) {
    logicModelData = { title: "", elements: {}, relations: [] };
  }
  const label = document.getElementById('newElementLabel').value.trim();
  const category = document.getElementById('newElementCategory').value;
  if (!label) return;
  saveState();
  const id = category + elementCounters[category];
  elementCounters[category]++;
  // 保存時は改行をリテラル "\n" に変換する
  logicModelData.elements[id] = { id, label: label.replace(/\r\n|\r|\n/g, '\\n'), category };
  // 最後に追加した要素のカテゴリーを保存
  window.lastAddedCategory = category;
  hideEditPanel();
  reRenderModel().then(() => {
    highlightNewNode(id);
  });
}

/**
 * 編集パネル外クリックでパネル・待機状態解除
 */
document.addEventListener('click', function(e) {
  if (!e.target.closest('#editPanel')) {
    clearSelection();
    if (window.isWaitingForRelationEnd) {
      window.isWaitingForRelationEnd = false;
      window.startingNodeForRelation = null;
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
        <button onclick="hideEditPanel()" class="panel-button">閉じる</button>
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
      if (!window.isWaitingForRelationEnd) {
        relationTooltip.style.display = "none";
      }
    }
  });
  document.addEventListener("mousemove", function(e) {
    if (isCtrlPressed || window.isWaitingForRelationEnd) {
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
  if (window.isWaitingForRelationEnd) {
    tooltipText = "終点要素をクリック";
  } else if (selectedNodesForRelation.length === 0) {
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
  if (e.key === 'Escape' && window.isWaitingForRelationEnd) {
    window.isWaitingForRelationEnd = false;
    window.startingNodeForRelation = null;
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
  e.stopPropagation();
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
        <button onclick="hidePowerpointHelpPanel()" class="panel-button">閉じる</button>
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
