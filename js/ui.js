/* js/ui.js */

// SVG描画後に各ノード・エッジにイベントを設定
function attachSvgEventHandlers() {
    const svg = document.querySelector('#output svg');
    if (!svg) return;
    
    // ノード（通常は g.node）
    const nodes = svg.querySelectorAll('g.node');
    nodes.forEach(node => {
        node.style.cursor = "pointer";
        node.addEventListener('mouseover', function() {
            node.classList.add('node-hover');
        });
        node.addEventListener('mouseout', function() {
            node.classList.remove('node-hover');
        });
        node.addEventListener('click', function(e) {
            e.stopPropagation();
            const nodeId = node.querySelector('title').textContent.trim();
            if (e.ctrlKey) {
                handleNodeRelationSelection(node, nodeId);
            } else {
                window.currentEditingType = "element";
                window.currentEditingId = nodeId;
                showEditPanelForElement(node, nodeId, e);
            }
        });
    });
    
    // エッジ（通常は g.edge）
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
            const edgeTitle = edge.querySelector('title');
            if (edgeTitle) {
                const edgeId = edgeTitle.textContent.trim();
                const parts = edgeId.split("->").map(s => s.trim());
                if (parts.length === 2) {
                    window.currentEditingType = "edge";
                    window.currentEditingEdge = { from: parts[0], to: parts[1] };
                    showEditPanelForEdge(edge, window.currentEditingEdge, e);
                }
            }
        });
    });
    
    svg.addEventListener('click', function(e) {
        clearSelection();
        hideEditPanel();
    });
}

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
        addRelation(from, to);
        clearSelection();
        reRenderModel();
    }
}

function addRelation(from, to) {
    const exists = logicModelData.relations.some(rel => rel.from === from && rel.to === to);
    if (!exists) {
        saveState();
        logicModelData.relations.push({ from, to });
    }
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

function showEditPanelForElement(svgNode, nodeId, event) {
    const panel = document.getElementById('editPanel');
    panel.style.left = event.clientX + "px";
    panel.style.top = event.clientY + "px";
    const element = logicModelData.elements[nodeId];
    if (!element) return;
    panel.innerHTML = `
        <div>
            <label>ラベル: </label>
            <input type="text" id="editLabel" value="${element.label}">
        </div>
        <div>
            <label>カテゴリー: </label>
            <select id="editCategory">
                <option value="input" ${element.category==='input'?'selected':''}>input</option>
                <option value="activity" ${element.category==='activity'?'selected':''}>activity</option>
                <option value="output" ${element.category==='output'?'selected':''}>output</option>
                <option value="outcome" ${element.category==='outcome'?'selected':''}>outcome</option>
                <option value="impact" ${element.category==='impact'?'selected':''}>impact</option>
            </select>
        </div>
        <button onclick="applyElementEdit('${nodeId}')">適用</button>
        <button onclick="deleteElement('${nodeId}')">削除</button>
        <button onclick="hideEditPanel()">キャンセル</button>
    `;
    panel.style.display = "block";
}

function applyElementEdit(nodeId) {
    const newLabel = document.getElementById('editLabel').value;
    const newCategory = document.getElementById('editCategory').value;
    if (logicModelData.elements[nodeId]) {
        saveState();
        logicModelData.elements[nodeId].label = newLabel;
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
}

document.getElementById('addElementButton').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('editPanel');
    panel.style.left = e.clientX + "px";
    panel.style.top = e.clientY + "px";
    panel.innerHTML = `
        <div>
            <label for="newElementLabel">ラベル: </label>
            <input type="text" id="newElementLabel" value="">
        </div>
        <div>
            <label for="newElementCategory">カテゴリー: </label>
            <select id="newElementCategory">
                <option value="input">input</option>
                <option value="activity">activity</option>
                <option value="output">output</option>
                <option value="outcome">outcome</option>
                <option value="impact">impact</option>
            </select>
        </div>
        <button onclick="addNewElement()">追加</button>
        <button onclick="hideEditPanel()">キャンセル</button>
    `;
    panel.style.display = "block";
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
    reRenderModel();
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('#editPanel')) {
    clearSelection();
    hideEditPanel();
  }
});

document.getElementById('helpButton').addEventListener('click', function(e) {
    e.stopPropagation();
    const panel = document.getElementById('editPanel');
    panel.style.left = e.clientX + "px";
    panel.style.top = e.clientY + "px";
    panel.innerHTML = `
       <div>
         <h3>編集ヘルプ</h3>
         <p>・「要素追加」ボタンで新しい要素を追加できます。</p>
         <p>・要素をクリックすると、編集・削除パネルが表示されます。</p>
         <p>・Ctrl＋クリックで要素同士の関係を追加できます。</p>
         <p>・エッジをクリックすると、その関係の削除が可能です。</p>
         <p>・「元に戻す」ボタンで直前の作業を元に戻します。</p>
         <p>・右上のボタン群から、PNG/SVGダウンロードやコマンドのコピーができます。</p>
         <button onclick="hideEditPanel()">閉じる</button>
       </div>
    `;
    panel.style.display = "block";
});
