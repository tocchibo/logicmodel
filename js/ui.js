/* js/ui.js */

// Global variables for relation tooltip and waiting mode for relation addition
let selectedNodesForRelation = [];
let isCtrlPressed = false;
let relationTooltip = null;
window.startingNodeForRelation = null;
window.isWaitingForRelationEnd = false;

// SVG描画後に各ノード・エッジにイベントを設定
function attachSvgEventHandlers() {
    const svg = document.querySelector('#output svg');
    if (!svg) return;
    
    // ノード（通常は g.node）の処理
    const nodes = svg.querySelectorAll('g.node');
    nodes.forEach(node => {
        node.style.cursor = "pointer";
        
        // ノードの ID を取得
        const nodeId = node.querySelector('title').textContent.trim();
        // waiting mode 中かつ、このノードが始点ならスタイルを付与する
        if (window.isWaitingForRelationEnd && window.startingNodeForRelation === nodeId) {
            node.classList.add("node-selected");
        }
        
        node.addEventListener('mouseover', function() {
            node.classList.add('node-hover');
        });
        node.addEventListener('mouseout', function() {
            node.classList.remove('node-hover');
        });
        node.addEventListener('click', function(e) {
            e.stopPropagation();
            // waiting mode（編集パネルからの関係追加状態）の場合
            if (window.isWaitingForRelationEnd) {
                if (window.startingNodeForRelation && window.startingNodeForRelation !== nodeId) {
                    // waiting mode で設定された始点とクリックされたノードを終点として関係を追加
                    const fromNode = window.startingNodeForRelation;
                    const relationAdded = addRelation(fromNode, nodeId);
                    window.isWaitingForRelationEnd = false;
                    window.startingNodeForRelation = null;
                    clearSelection();
                    hideTooltip();
                    reRenderModel().then(() => {
                        if (relationAdded) {
                            highlightNewRelation(fromNode, nodeId);
                        }
                    });
                } else {
                    // 同じノードがクリックされた場合は waiting mode を解除
                    window.isWaitingForRelationEnd = false;
                    window.startingNodeForRelation = null;
                    clearSelection();
                    hideTooltip();
                }
                return;
            }
            
            // waiting mode でない場合は、Ctrl＋クリックなら既存の関係追加処理、通常クリックなら編集パネルを表示
            if (e.ctrlKey) {
                handleNodeRelationSelection(node, nodeId);
            } else {
                window.currentEditingType = "element";
                window.currentEditingId = nodeId;
                showEditPanelForElement(node, nodeId, e);
            }
        });
    });
    
    // エッジ（通常は g.edge）の処理
    const edges = svg.querySelectorAll('g.edge');
    edges.forEach(edge => {
        edge.style.cursor = "pointer";
        edge.addEventListener('mouseover', function() {
            edge.classList.add('edge-hover');
        });
        edge.addEventListener('mouseout', function() {
            edge.classList.remove('edge-hover');
        });
        edge.addEventListener('click', function(e) {
            e.stopPropagation();
            const edgeIdAttr = edge.getAttribute('id');
            if (edgeIdAttr && edgeIdAttr.startsWith('edge_')) {
                const parts = edgeIdAttr.substring(5).split('_'); // "edge_" を除去して分割
                if (parts.length >= 2) {
                    window.currentEditingType = "edge";
                    window.currentEditingEdge = { from: parts[0], to: parts[1] };
                    showEditPanelForEdge(edge, window.currentEditingEdge, e);
                }
            }
        });
    });
    
    // SVG全体クリック時（ノード・エッジ以外の場所をクリックした場合）
    svg.addEventListener('click', function(e) {
        if (window.isWaitingForRelationEnd) {
            window.isWaitingForRelationEnd = false;
            window.startingNodeForRelation = null;
            clearSelection();
            hideTooltip();
        }
        hideEditPanel();
    });
}


// Ctrl＋クリックでの関係追加（既存処理）
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
            if (relationAdded) {
                highlightNewRelation(from, to);
            }
        });
    }
}

function addRelation(from, to) {
    const exists = logicModelData.relations.some(rel => rel.from === from && rel.to === to);
    if (!exists) {
      saveState();
      logicModelData.relations.push({ from, to });
      return true;
    }
    return false;
}

function clearSelection() {
    selectedNodesForRelation = [];
    const svg = document.querySelector('#output svg');
    if (svg) {
        svg.querySelectorAll('g.node').forEach(node => {
            node.classList.remove('node-selected');
        });
    }
}

// 編集パネル（要素）の表示（レイアウト変更＆「ここから始まる関係線を追加」ボタン追加）
function showEditPanelForElement(svgNode, nodeId, event) {
    const panel = document.getElementById('editPanel');
    panel.style.left = event.clientX + "px";
    panel.style.top = event.clientY + "px";
    const element = logicModelData.elements[nodeId];
    if (!element) return;
    const labelText = element.label.replace(/\\n/g, "\n");
    const rows = Math.max(3, labelText.split("\n").length);
    panel.innerHTML = `
      <div class="edit-panel-content" style="padding: 15px; min-width: 300px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div class="edit-panel-section" style="margin-bottom: 15px;">
              <label for="editLabel" style="display: block; font-weight: bold; margin-bottom: 5px;">ラベル</label>
              <textarea id="editLabel" rows="${rows}" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">${labelText}</textarea>
          </div>
          <div class="edit-panel-section" style="margin-bottom: 15px;">
              <label for="editCategory" style="display: block; font-weight: bold; margin-bottom: 5px;">カテゴリー</label>
              <select id="editCategory" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                  <option value="input" ${element.category==='input'?'selected':''}>input</option>
                  <option value="activity" ${element.category==='activity'?'selected':''}>activity</option>
                  <option value="output" ${element.category==='output'?'selected':''}>output</option>
                  <option value="outcome" ${element.category==='outcome'?'selected':''}>outcome</option>
                  <option value="impact" ${element.category==='impact'?'selected':''}>impact</option>
              </select>
          </div>
          <div class="edit-panel-buttons" style="display: flex; flex-direction: column; gap: 8px;">
              <button onclick="applyElementEdit('${nodeId}')" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer;">適用</button>
              <button onclick="deleteElement('${nodeId}')" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer;">削除</button>
              <button onclick="startRelationFrom('${nodeId}')" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer;">ここから始まる関係線を追加</button>
              <button onclick="hideEditPanel()" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer;">キャンセル</button>
          </div>
      </div>
    `;
    panel.style.display = "block";
}

function applyElementEdit(nodeId) {
    const newLabel = document.getElementById('editLabel').value;
    const newCategory = document.getElementById('editCategory').value;
    if (logicModelData.elements[nodeId]) {
        saveState();
        // 改行を内部表現用の literal "\n" に変換
        logicModelData.elements[nodeId].label = newLabel.replace(/\r\n|\r|\n/g, '\\n');
        logicModelData.elements[nodeId].category = newCategory;
    }
    hideEditPanel();
    reRenderModel();
}

function deleteElement(nodeId) {
    if (logicModelData.elements[nodeId]) {
        saveState();
        delete logicModelData.elements[nodeId];
        logicModelData.relations = logicModelData.relations.filter(rel => rel.from !== nodeId && rel.to !== nodeId);
    }
    hideEditPanel();
    reRenderModel();
}

function showEditPanelForEdge(edgeElement, edgeData, event) {
    const panel = document.getElementById('editPanel');
    panel.style.left = event.clientX + "px";
    panel.style.top = event.clientY + "px";
    panel.innerHTML = `
        <div>
            <p>関係: ${edgeData.from} → ${edgeData.to}</p>
        </div>
        <button onclick="deleteEdge('${edgeData.from}', '${edgeData.to}')">削除</button>
        <button onclick="hideEditPanel()">キャンセル</button>
    `;
    panel.style.display = "block";
}

function deleteEdge(from, to) {
    saveState();
    logicModelData.relations = logicModelData.relations.filter(rel => !(rel.from === from && rel.to === to));
    hideEditPanel();
    reRenderModel();
}

function hideEditPanel() {
    const panel = document.getElementById('editPanel');
    panel.style.display = "none";
    window.currentEditingId = null;
    window.currentEditingEdge = null;
    window.currentEditingType = null;
    // waiting mode を解除した際はツールチップも非表示
    hideTooltip();
}

// 「ここから始まる関係線を追加」ボタン用処理
function startRelationFrom(nodeId) {
    // 編集中の内容があれば適用
    if (window.currentEditingType === 'element' && window.currentEditingId === nodeId) {
        applyElementEdit(nodeId);
    }
    // waiting mode を開始：始点として nodeId を記憶
    window.startingNodeForRelation = nodeId;
    window.isWaitingForRelationEnd = true;
    hideEditPanel();
    const svgNode = document.getElementById("node_" + nodeId);
    if (svgNode) {
        svgNode.classList.add("node-selected");
    }
    // ツールチップを表示して、終点選択を促す
    if (relationTooltip) {
        relationTooltip.style.display = "block";
    }
}

// 追加要素パネルの処理
document.getElementById('addElementButton').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('editPanel');
    panel.style.left = e.clientX + "px";
    panel.style.top = e.clientY + "px";
    panel.innerHTML = `
      <div class="add-element-panel" style="padding: 15px; min-width: 300px; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <div style="margin-bottom: 15px;">
              <label for="newElementLabel" style="display: block; font-weight: bold; margin-bottom: 5px;">ラベル</label>
              <input type="text" id="newElementLabel" value="" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
          </div>
          <div style="margin-bottom: 15px;">
              <label for="newElementCategory" style="display: block; font-weight: bold; margin-bottom: 5px;">カテゴリー</label>
              <select id="newElementCategory" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px;">
                  <option value="input">input</option>
                  <option value="activity">activity</option>
                  <option value="output">output</option>
                  <option value="outcome">outcome</option>
                  <option value="impact">impact</option>
              </select>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
              <button onclick="addNewElement()" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer;">追加</button>
              <button onclick="hideEditPanel()" style="padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer;">キャンセル</button>
          </div>
      </div>
    `;
    panel.style.display = "block";
    document.getElementById("newElementLabel").focus();
});

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
    logicModelData.elements[id] = { id, label, category };
    hideEditPanel();
    reRenderModel().then(() => {
        highlightNewNode(id);
    });
}

// 編集パネル外をクリックしたときは、waiting mode（関係追加状態）があれば解除し、パネルを閉じる
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

document.getElementById('helpButton').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('editPanel');
    panel.style.left = e.clientX + "px";
    panel.style.top = e.clientY + "px";
    panel.innerHTML = `
       <div style="font-size:14px; line-height:1.4;">
         <h3 style="margin-top:0;">編集ヘルプ</h3>
         <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse; width:100%;">
           <thead>
             <tr style="background:#f0f0f0;">
               <th>目的</th>
               <th>方法</th>
             </tr>
           </thead>
           <tbody>
             <tr>
               <td>新規要素を追加したい</td>
               <td>
                 「要素追加」ボタンをクリックし、表示されたフォームに必要な情報を入力して追加します。
               </td>
             </tr>
             <tr>
               <td>要素を編集・削除したい</td>
               <td>
                 編集・削除したい要素をクリックするとパネルが表示されるので、内容を変更または削除してください。
               </td>
             </tr>
             <tr>
               <td>関係線を追加したい</td>
               <td>
                 <strong>方法①:</strong> 編集パネル内の「ここから始まる関係線を追加」ボタンをクリックし、始点を確定した後、終点となる要素をクリックします。<br>
                 <strong>方法②:</strong> Ctrl＋クリックで複数要素を選択し、関係線を追加します。
               </td>
             </tr>
             <tr>
               <td>関係線を削除したい</td>
               <td>
                 対象の関係線（エッジ）をクリックし、表示されるパネルから「削除」を選択します。
               </td>
             </tr>
           </tbody>
         </table>
         <div style="text-align:right; margin-top:10px;">
           <button onclick="hideEditPanel()">閉じる</button>
         </div>
       </div>
    `;
    panel.style.display = "block";
});


// Relation Tooltip Handlers
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
      // waiting mode でなければツールチップを非表示
      if (!window.isWaitingForRelationEnd) {
          relationTooltip.style.display = "none";
      }
    }
  });

  // マウス移動時は、Ctrl キー押下中または waiting mode のときにツールチップを更新
  document.addEventListener("mousemove", function(e) {
    if (isCtrlPressed || window.isWaitingForRelationEnd) {
      updateRelationTooltip(e);
    }
  });
});

// waiting mode の際のツールチップ更新（Ctrlキーの有無にかかわらず）
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

function hideTooltip() {
    if (relationTooltip) {
        relationTooltip.style.display = "none";
    }
}

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

function highlightNewNode(id) {
    const node = document.getElementById("node_" + id);
    if (node) {
        node.classList.add("newly-added-node");
        setTimeout(() => {
            node.classList.remove("newly-added-node");
        }, 500);
    }
}

// ESCキーで waiting mode（関係追加状態）をキャンセル
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && window.isWaitingForRelationEnd) {
        window.isWaitingForRelationEnd = false;
        window.startingNodeForRelation = null;
        clearSelection();
        hideTooltip();
    }
});
