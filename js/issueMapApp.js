(function () {
  "use strict";

  const SCHEMA_VERSION = "issue-map/v1";
  const NODE_TYPES = ["issue", "structural_factor", "assumption", "external_factor", "mental_model"];
  const NODE_LAYERS = ["event", "pattern", "structure", "mental_model"];
  const NODE_STATUSES = ["hypothesis", "supported", "needs_review"];
  const EDGE_POLARITIES = ["+", "-", "unknown"];
  const EDGE_CONFIDENCES = ["high", "medium", "low"];
  const EDGE_DEFAULT_COLOR = "#727b76";
  const SLIDE = {
    width: 1280,
    height: 720,
    marginX: 30,
    titleY: 22,
    top: 50,
    bottom: 18,
    rowGap: 7,
    nodeWidth: 200,
    minNodeHeight: 36,
    maxNodeHeight: 52
  };
  const ELK_MAP = {
    minWidth: 1280,
    minHeight: 720,
    padding: 24,
    titleHeight: 52,
    nodeWidth: 154,
    minNodeHeight: 54,
    labelFontSize: 13,
    labelLineHeight: 15,
    labelMaxLines: 3,
    labelPaddingX: 14
  };

  const TYPE_LABELS = {
    issue: "課題",
    structural_factor: "構造要因",
    assumption: "前提条件",
    external_factor: "外部環境",
    mental_model: "価値観"
  };

  const LAYER_LABELS = {
    event: "事象",
    pattern: "傾向",
    structure: "構造",
    mental_model: "認識"
  };

  const STATUS_LABELS = {
    hypothesis: "仮説",
    supported: "根拠あり",
    needs_review: "要確認"
  };

  const IssueMapState = {
    data: null,
    selected: null,
    visiblePerspectives: new Set()
  };

  const els = {};
  const AUTO_RENDER_DELAY_MS = 900;
  const AUTO_RENDER_PASTE_DELAY_MS = 120;
  const HOVER_TOOLTIP_HIDE_DELAY_MS = 260;
  let autoRenderTimer = null;
  let autoRenderInProgress = false;
  let autoRenderQueued = false;
  let inputCompositionActive = false;
  let hoverTooltip = null;
  let hoverTooltipHideTimer = null;

  document.addEventListener("DOMContentLoaded", initIssueMapApp);

  function initIssueMapApp() {
    cacheElements();
    bindEvents();
    showEmptyGraph();
    renderInspector();
    clearValidation();
    updateMeta();
    updateSelectionLabel();
    setStatus("未入力");
  }

  function cacheElements() {
    els.input = document.getElementById("issueMapInput");
    els.status = document.getElementById("issueMapStatus");
    els.meta = document.getElementById("issueMapMeta");
    els.validation = document.getElementById("issueMapValidation");
    els.output = document.getElementById("issueMapOutput");
    els.filterBar = document.getElementById("issueFilterBar");
    els.inspector = document.getElementById("issueInspector");
    els.selectionLabel = document.getElementById("issueSelectionLabel");
    els.relationList = document.getElementById("issueRelationList");
    els.evidenceList = document.getElementById("issueEvidenceList");
    els.correctionInstructions = document.getElementById("issueCorrectionInstructions");
    els.fileInput = document.getElementById("issueMapFileInput");
  }

  function bindEvents() {
    document.getElementById("loadSampleButton").addEventListener("click", loadSampleIssueMap);
    document.getElementById("clearIssueMapButton").addEventListener("click", clearIssueMapJson);
    document.getElementById("renderIssueMapButton").addEventListener("click", function () {
      cancelAutoRender();
      renderFromInput();
    });
    document.getElementById("saveIssueMapButton").addEventListener("click", saveIssueMapJson);
    document.getElementById("saveIssueMapSvgButton").addEventListener("click", saveIssueMapSvg);
    document.getElementById("loadIssueMapButton").addEventListener("click", function () {
      els.fileInput.value = "";
      els.fileInput.click();
    });
    document.getElementById("copyIssueMapButton").addEventListener("click", copyIssueMapJson);
    document.getElementById("copyIssueCorrectionButton").addEventListener("click", copyCorrectionPrompt);
    document.getElementById("addIssueNodeButton").addEventListener("click", function () {
      ensureEditableData();
      IssueMapState.selected = { type: "newNode" };
      renderInspector();
      updateSelectionLabel();
    });
    document.getElementById("addIssueEdgeButton").addEventListener("click", function () {
      ensureEditableData();
      IssueMapState.selected = { type: "newEdge" };
      renderInspector();
      updateSelectionLabel();
    });
    document.getElementById("clearIssueSelectionButton").addEventListener("click", function () {
      IssueMapState.selected = null;
      renderIssueMap();
    });
    els.fileInput.addEventListener("change", handleFileLoad);
    els.input.addEventListener("input", handleIssueMapInputChange);
    els.input.addEventListener("blur", function () {
      scheduleAutoRender(0);
    });
    els.input.addEventListener("compositionstart", function () {
      inputCompositionActive = true;
    });
    els.input.addEventListener("compositionend", function () {
      inputCompositionActive = false;
      scheduleAutoRender(AUTO_RENDER_DELAY_MS);
    });
  }

  function handleIssueMapInputChange(event) {
    if (inputCompositionActive) return;
    const delay = event && event.inputType === "insertFromPaste" ? AUTO_RENDER_PASTE_DELAY_MS : AUTO_RENDER_DELAY_MS;
    scheduleAutoRender(delay);
  }

  function scheduleAutoRender(delay) {
    cancelAutoRender();
    autoRenderTimer = window.setTimeout(runAutoRenderFromInput, delay);
  }

  function cancelAutoRender() {
    if (!autoRenderTimer) return;
    window.clearTimeout(autoRenderTimer);
    autoRenderTimer = null;
  }

  async function runAutoRenderFromInput() {
    autoRenderTimer = null;
    if (autoRenderInProgress) {
      autoRenderQueued = true;
      return;
    }

    autoRenderInProgress = true;
    try {
      await renderFromInput({ syncInput: document.activeElement !== els.input });
    } finally {
      autoRenderInProgress = false;
      if (autoRenderQueued) {
        autoRenderQueued = false;
        scheduleAutoRender(AUTO_RENDER_DELAY_MS);
      }
    }
  }

  async function loadSampleIssueMap() {
    setStatus("サンプル読込中");
    try {
      const response = await fetch("docs/test_issue_map.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      els.input.value = await response.text();
      await renderFromInput();
      setStatus("サンプル表示");
    } catch (error) {
      showEmptyGraph();
      setStatus("サンプル未読込");
      showValidation({
        errors: [],
        warnings: ["サンプルJSONを読み込めませんでした。静的サーバー経由で開くと読み込めます。"]
      });
    }
  }

  async function renderFromInput(options) {
    const shouldSyncInput = !options || options.syncInput !== false;
    const raw = els.input.value.trim();
    if (!raw) {
      IssueMapState.data = null;
      IssueMapState.selected = null;
      showEmptyGraph();
      clearValidation();
      renderInspector();
      renderRelationList();
      renderEvidenceList();
      updateMeta();
      updateSelectionLabel();
      setStatus("未入力");
      return;
    }

    let parseResult;
    try {
      parseResult = parseIssueMapInput(raw);
    } catch (error) {
      showValidation({ errors: ["JSONを読み込めません: " + error.message], warnings: [] });
      setStatus("JSONエラー");
      return;
    }

    const repairWarnings = parseResult.warnings.slice();
    const data = normalizeIssueMap(parseResult.data, repairWarnings);
    const validation = validateIssueMap(data);
    const combinedValidation = {
      errors: validation.errors,
      warnings: repairWarnings.concat(validation.warnings)
    };
    showValidation(combinedValidation);
    if (validation.errors.length > 0) {
      setStatus("検証エラー");
      return;
    }

    IssueMapState.data = data;
    ensurePerspectiveFilters(IssueMapState.data);
    if (shouldSyncInput) {
      syncDataToInput();
    }
    await renderIssueMap();
    setStatus(combinedValidation.warnings.length > 0 ? "補正して表示中" : "表示中");
  }

  function clearIssueMapJson() {
    els.input.value = "";
    IssueMapState.data = null;
    IssueMapState.selected = null;
    IssueMapState.visiblePerspectives.clear();
    showEmptyGraph();
    clearValidation();
    renderInspector();
    renderRelationList();
    renderEvidenceList();
    renderFilterBar();
    updateMeta();
    updateSelectionLabel();
    setStatus("未入力");
  }

  async function renderIssueMap() {
    hideHoverTooltip();
    if (!IssueMapState.data) {
      showEmptyGraph();
      return;
    }

    updateMeta();
    renderFilterBar();
    renderRelationList();
    renderEvidenceList();
    renderInspector();
    updateSelectionLabel();

    const visibleNodes = getVisibleNodeIds(IssueMapState.data);
    if (visibleNodes.size === 0) {
      els.output.innerHTML = '<div class="issue-map-empty">表示対象がありません</div>';
      return;
    }

    try {
      const svg = await renderElkMap(IssueMapState.data, visibleNodes);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", IssueMapState.data.title || "課題構造マップ");
      els.output.innerHTML = "";
      els.output.appendChild(svg);
      attachSvgEventHandlers();
      markSelection();
    } catch (error) {
      els.output.innerHTML = '<div class="issue-map-empty">描画エラー</div>';
      showValidation({ errors: ["SVG描画に失敗しました: " + error.message], warnings: [] });
      setStatus("描画エラー");
    }
  }

  function parseIssueMapInput(raw) {
    const source = String(raw || "").trim().replace(/^\uFEFF/, "");
    const candidates = [];

    addParseCandidate(candidates, source, []);

    const fenced = extractJsonCodeBlock(source);
    if (fenced && fenced !== source) {
      addParseCandidate(candidates, fenced, ["jsonコードブロックからJSON本文を抽出しました。"]);
    }

    const extracted = extractJsonObjectText(source);
    if (extracted && extracted !== source && extracted !== fenced) {
      addParseCandidate(candidates, extracted, ["前後の説明文を除いてJSONオブジェクトを抽出しました。"]);
    }

    const baseCount = candidates.length;
    for (let i = 0; i < baseCount; i += 1) {
      const relaxed = relaxJsonText(candidates[i].text);
      if (relaxed !== candidates[i].text) {
        addParseCandidate(
          candidates,
          relaxed,
          candidates[i].warnings.concat(["末尾カンマ、コメント、単一引用符、未引用キーの一部を補正しました。"])
        );
      }
    }

    let lastError = null;
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        return {
          data: JSON.parse(candidates[i].text),
          warnings: candidates[i].warnings
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(lastError ? lastError.message : "JSONとして解釈できません。");
  }

  function addParseCandidate(candidates, text, warnings) {
    if (!text) return;
    const normalized = String(text).trim();
    if (!normalized) return;
    if (candidates.some(function (candidate) { return candidate.text === normalized; })) return;
    candidates.push({ text: normalized, warnings: warnings || [] });
  }

  function extractJsonCodeBlock(text) {
    const fencePattern = /```(?:json)?\s*([\s\S]*?)```/i;
    const match = String(text || "").match(fencePattern);
    return match ? match[1].trim() : null;
  }

  function extractJsonObjectText(text) {
    const value = String(text || "");
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return value.slice(start, end + 1).trim();
  }

  function relaxJsonText(text) {
    let relaxed = String(text || "");
    relaxed = stripJsonComments(relaxed);
    relaxed = replaceSingleQuotedStrings(relaxed);
    relaxed = quoteBareObjectKeys(relaxed);
    relaxed = removeTrailingJsonCommas(relaxed);
    return relaxed.trim();
  }

  function stripJsonComments(text) {
    let result = "";
    let inString = false;
    let escaped = false;
    const value = String(text || "");

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];
      const next = value[i + 1];

      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        result += char;
        continue;
      }

      if (char === "/" && next === "/") {
        while (i < value.length && value[i] !== "\n") i += 1;
        if (i < value.length) result += "\n";
        continue;
      }

      if (char === "/" && next === "*") {
        i += 2;
        while (i < value.length && !(value[i] === "*" && value[i + 1] === "/")) i += 1;
        i += 1;
        continue;
      }

      result += char;
    }

    return result;
  }

  function replaceSingleQuotedStrings(text) {
    let result = "";
    let inDoubleString = false;
    let escaped = false;
    const value = String(text || "");

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];

      if (inDoubleString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inDoubleString = false;
        }
        continue;
      }

      if (char === '"') {
        inDoubleString = true;
        result += char;
        continue;
      }

      if (char !== "'") {
        result += char;
        continue;
      }

      let content = "";
      let singleEscaped = false;
      let closed = false;
      for (let j = i + 1; j < value.length; j += 1) {
        const inner = value[j];
        if (singleEscaped) {
          content += inner;
          singleEscaped = false;
          continue;
        }
        if (inner === "\\") {
          singleEscaped = true;
          continue;
        }
        if (inner === "'") {
          result += JSON.stringify(content);
          i = j;
          closed = true;
          break;
        }
        content += inner;
      }
      if (!closed) {
        result += char;
      }
    }

    return result;
  }

  function quoteBareObjectKeys(text) {
    return String(text || "").replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/g, '$1"$2"$3');
  }

  function removeTrailingJsonCommas(text) {
    let result = "";
    let inString = false;
    let escaped = false;
    const value = String(text || "");

    for (let i = 0; i < value.length; i += 1) {
      const char = value[i];

      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        result += char;
        continue;
      }

      if (char === ",") {
        let j = i + 1;
        while (j < value.length && /\s/.test(value[j])) j += 1;
        if (value[j] === "}" || value[j] === "]") {
          continue;
        }
      }

      result += char;
    }

    return result;
  }

  function validateIssueMap(data) {
    const errors = [];
    const warnings = [];

    if (!isPlainObject(data)) {
      return { errors: ["最上位がオブジェクトではありません。"], warnings };
    }
    if (data.schemaVersion !== SCHEMA_VERSION) {
      errors.push('schemaVersion は "' + SCHEMA_VERSION + '" にしてください。');
    }
    if (!Array.isArray(data.perspectives)) errors.push("perspectives は配列にしてください。");
    if (!Array.isArray(data.nodes)) errors.push("nodes は配列にしてください。");
    if (!Array.isArray(data.edges)) errors.push("edges は配列にしてください。");
    if (!Array.isArray(data.evidence)) errors.push("evidence は配列にしてください。");
    if (errors.length > 0) return { errors, warnings };

    const perspectiveIds = collectIds(data.perspectives, "perspective", errors);
    const nodeIds = collectIds(data.nodes, "node", errors);
    const evidenceIds = collectIds(data.evidence, "evidence", errors);

    if (data.nodes.length < 20) {
      warnings.push("初期版としてはノード数が少なめです。主要課題を落としていないか確認してください。");
    }
    if (data.edges.length < data.nodes.length) {
      warnings.push("エッジ数がノード数より少ないため、因果関係が粗い可能性があります。");
    }

    data.perspectives.forEach(function (perspective) {
      if (!/^[a-z0-9_]+$/.test(String(perspective.id || ""))) {
        errors.push("perspective.id は英小文字、数字、アンダースコアにしてください: " + String(perspective.id || ""));
      }
      if (!/^#[0-9a-fA-F]{6}$/.test(String(perspective.color || ""))) {
        warnings.push("perspective.color はHEXカラーが推奨です: " + String(perspective.id || ""));
      }
    });

    data.nodes.forEach(function (node) {
      if (!NODE_TYPES.includes(node.type)) errors.push("未対応の node.type: " + node.id + " / " + node.type);
      if (!NODE_LAYERS.includes(node.layer)) errors.push("未対応の node.layer: " + node.id + " / " + node.layer);
      if (!NODE_STATUSES.includes(node.status)) errors.push("未対応の node.status: " + node.id + " / " + node.status);
      if (!perspectiveIds.has(node.perspective)) errors.push("node.perspective が存在しません: " + node.id + " / " + node.perspective);
      if (!Array.isArray(node.evidenceIds)) {
        errors.push("node.evidenceIds は配列にしてください: " + node.id);
      } else {
        node.evidenceIds.forEach(function (evidenceId) {
          if (!evidenceIds.has(evidenceId)) {
            errors.push("node.evidenceIds が存在しません: " + node.id + " / " + evidenceId);
          }
        });
      }
    });

    data.edges.forEach(function (edge) {
      if (!nodeIds.has(edge.from)) errors.push("edge.from が存在しません: " + edge.id + " / " + edge.from);
      if (!nodeIds.has(edge.to)) errors.push("edge.to が存在しません: " + edge.id + " / " + edge.to);
      if (edge.from === edge.to) warnings.push("自己参照エッジがあります: " + edge.id);
      if (edge.relation !== "causes") warnings.push("relation は causes が推奨です: " + edge.id);
      if (!EDGE_POLARITIES.includes(edge.polarity)) errors.push("未対応の polarity: " + edge.id + " / " + edge.polarity);
      if (!EDGE_CONFIDENCES.includes(edge.confidence)) errors.push("未対応の confidence: " + edge.id + " / " + edge.confidence);
    });

    return { errors, warnings };
  }

  function collectIds(items, label, errors) {
    const ids = new Set();
    items.forEach(function (item, index) {
      if (!item || !item.id) {
        errors.push(label + " に id がありません: index " + index);
        return;
      }
      if (ids.has(item.id)) {
        errors.push(label + " の id が重複しています: " + item.id);
      }
      ids.add(item.id);
    });
    return ids;
  }

  function normalizeIssueMap(data, warnings) {
    const repairs = warnings || [];
    const root = unwrapIssueMapRoot(data, repairs);
    const source = isPlainObject(root) ? JSON.parse(JSON.stringify(root)) : {};
    const normalized = {};

    if (!isPlainObject(root)) {
      repairs.push("最上位がオブジェクトではないため、空のマップとして補完しました。");
    }

    if (source.schemaVersion !== SCHEMA_VERSION) {
      repairs.push("schemaVersion を " + SCHEMA_VERSION + " に補完しました。");
    }
    normalized.schemaVersion = SCHEMA_VERSION;
    normalized.title = String(source.title || "課題構造マップ");
    normalized.scope = normalizeScope(source.scope, repairs);

    const perspectives = normalizePerspectives(source.perspectives, source.nodes, repairs);
    const evidence = normalizeEvidence(source.evidence, repairs);
    const nodes = normalizeNodes(source.nodes, perspectives, evidence.ids, repairs);
    const edges = normalizeEdges(source.edges, nodes, repairs);

    normalized.perspectives = perspectives.items;
    normalized.nodes = nodes.items;
    normalized.edges = edges.items;
    normalized.evidence = evidence.items;
    normalized.layout = normalizeLayout(source.layout, repairs);
    delete normalized.loops;
    return normalized;
  }

  function unwrapIssueMapRoot(data, repairs) {
    if (!isPlainObject(data)) return data;
    const wrapperKeys = ["issueMap", "issue_map", "map", "data"];
    for (let i = 0; i < wrapperKeys.length; i += 1) {
      const key = wrapperKeys[i];
      if (looksLikeIssueMap(data[key])) {
        repairs.push("ラップされたJSONから課題構造マップ本体を抽出しました: " + key);
        return data[key];
      }
    }
    return data;
  }

  function looksLikeIssueMap(value) {
    return isPlainObject(value) && (
      value.schemaVersion === SCHEMA_VERSION ||
      Array.isArray(value.nodes) ||
      Array.isArray(value.perspectives) ||
      Array.isArray(value.edges)
    );
  }

  function normalizeScope(scope, repairs) {
    if (scope && !isPlainObject(scope)) {
      repairs.push("scope がオブジェクトではないため、既定値で補完しました。");
    }
    const value = isPlainObject(scope) ? scope : {};
    return {
      theme: String(value.theme || ""),
      geography: String(value.geography || "未指定"),
      targetPopulation: String(value.targetPopulation || "未指定"),
      assumptions: coerceStringArray(value.assumptions)
    };
  }

  function normalizePerspectives(rawPerspectives, rawNodes, repairs) {
    const colors = ["#2f8f6f", "#3b82a0", "#8a8f3a", "#b36b42", "#7a6aa8", "#727b76"];
    const items = [];
    const idMap = {};
    const ids = new Set();
    let rawItems = coerceObjectArray(rawPerspectives);

    if (rawItems.length === 0) {
      const nodePerspectives = [];
      coerceObjectArray(rawNodes).forEach(function (node) {
        if (node && node.perspective && !nodePerspectives.includes(String(node.perspective))) {
          nodePerspectives.push(String(node.perspective));
        }
      });
      rawItems = nodePerspectives.map(function (value) {
        return { id: value, label: value };
      });
    }

    if (rawItems.length === 0) {
      rawItems = [{ id: "general", label: "全般", color: colors[0] }];
      repairs.push("perspectives がないため、全般の観点を補完しました。");
    }

    rawItems.forEach(function (item, index) {
      const object = isPlainObject(item) ? item : { id: item, label: item };
      const originalId = object.id || object.key || object.label || object.name || ("p" + String(index + 1).padStart(3, "0"));
      const fallbackId = "p" + String(index + 1).padStart(3, "0");
      const baseId = sanitizeIdentifier(originalId, fallbackId);
      const id = uniqueIdentifier(baseId, ids, "p");
      if (id !== String(originalId)) {
        repairs.push("perspective.id を補正しました: " + String(originalId) + " -> " + id);
      }
      const label = String(object.label || object.name || originalId || id);
      const color = /^#[0-9a-fA-F]{6}$/.test(String(object.color || "")) ? object.color : colors[index % colors.length];

      items.push({ id: id, label: label, color: color });
      ids.add(id);
      idMap[String(originalId)] = id;
      idMap[label] = id;
      idMap[id] = id;
    });

    return {
      items: items,
      idMap: idMap,
      ids: ids,
      defaultId: items[0] ? items[0].id : "general"
    };
  }

  function normalizeEvidence(rawEvidence, repairs) {
    const items = [];
    const ids = new Set();
    coerceObjectArray(rawEvidence).forEach(function (item, index) {
      const object = isPlainObject(item) ? item : { title: item };
      const originalId = object.id || object.key || ("ev" + String(index + 1).padStart(3, "0"));
      const baseId = sanitizeIdentifier(originalId, "ev" + String(index + 1).padStart(3, "0"));
      const id = uniqueIdentifier(baseId, ids, "ev");
      if (id !== String(originalId)) {
        repairs.push("evidence.id を補正しました: " + String(originalId) + " -> " + id);
      }
      items.push({
        id: id,
        title: String(object.title || object.name || id),
        url: String(object.url || ""),
        note: String(object.note || object.summary || "")
      });
      ids.add(id);
    });
    return { items: items, ids: ids };
  }

  function normalizeNodes(rawNodes, perspectives, evidenceIds, repairs) {
    const items = [];
    const ids = new Set();
    const idMap = {};
    const labelMap = {};
    coerceObjectArray(rawNodes).forEach(function (item, index) {
      const object = isPlainObject(item) ? item : { label: item };
      const originalId = object.id || object.key || ("n" + String(index + 1).padStart(3, "0"));
      const fallbackId = "n" + String(index + 1).padStart(3, "0");
      const baseId = sanitizeIdentifier(originalId, fallbackId);
      const id = uniqueIdentifier(baseId, ids, "n");
      if (id !== String(originalId)) {
        repairs.push("node.id を補正しました: " + String(originalId) + " -> " + id);
      }

      const label = String(object.label || object.title || object.name || id);
      const perspective = resolvePerspectiveId(object.perspective || object.category || object.group, perspectives, repairs);
      const node = {
        id: id,
        label: label,
        type: coerceNodeType(object.type, id, repairs),
        perspective: perspective,
        layer: coerceNodeLayer(object.layer, id, repairs),
        status: coerceNodeStatus(object.status, id, repairs),
        evidenceIds: coerceEvidenceIds(object.evidenceIds || object.evidence || object.evidenceId, evidenceIds, id, repairs)
      };
      items.push(node);
      ids.add(id);
      idMap[String(originalId)] = id;
      idMap[id] = id;
      labelMap[label] = id;
    });
    return { items: items, ids: ids, idMap: idMap, labelMap: labelMap };
  }

  function normalizeEdges(rawEdges, nodes, repairs) {
    const items = [];
    const ids = new Set();
    coerceObjectArray(rawEdges).forEach(function (item, index) {
      const object = isPlainObject(item) ? item : {};
      const from = resolveNodeReference(object.from || object.source || object.cause || object.fromId || object.fromLabel, nodes);
      const to = resolveNodeReference(object.to || object.target || object.effect || object.toId || object.toLabel, nodes);
      const originalId = object.id || object.key || ("e" + String(index + 1).padStart(3, "0"));

      if (!from || !to) {
        repairs.push("参照先ノードが見つからない edge を除外しました: " + String(originalId));
        return;
      }
      if (from === to) {
        repairs.push("自己参照 edge を除外しました: " + String(originalId));
        return;
      }

      const baseId = sanitizeIdentifier(originalId, "e" + String(index + 1).padStart(3, "0"));
      const id = uniqueIdentifier(baseId, ids, "e");
      if (id !== String(originalId)) {
        repairs.push("edge.id を補正しました: " + String(originalId) + " -> " + id);
      }
      if (object.relation && object.relation !== "causes") {
        repairs.push("edge.relation を causes に補正しました: " + id);
      }
      items.push({
        id: id,
        from: from,
        to: to,
        relation: "causes",
        polarity: coercePolarity(object.polarity, id, repairs),
        confidence: coerceConfidence(object.confidence, id, repairs),
        rationale: String(object.rationale || object.reason || object.note || "")
      });
      ids.add(id);
    });
    return { items: items };
  }

  function normalizeLayout(layout, repairs) {
    if (layout && !isPlainObject(layout)) {
      repairs.push("layout がオブジェクトではないため、既定値で補完しました。");
    }
    const value = isPlainObject(layout) ? layout : {};
    return {
      engine: value.engine || "auto",
      positions: isPlainObject(value.positions) ? value.positions : {},
      pinnedNodeIds: Array.isArray(value.pinnedNodeIds) ? value.pinnedNodeIds.map(String) : []
    };
  }

  function coerceObjectArray(value) {
    if (Array.isArray(value)) return value;
    if (isPlainObject(value)) {
      return Object.keys(value).map(function (key) {
        const item = value[key];
        if (isPlainObject(item)) {
          const copy = Object.assign({}, item);
          if (!copy.id) copy.id = key;
          if (!copy.key) copy.key = key;
          return copy;
        }
        return { id: key, label: item, title: item };
      });
    }
    if (value == null || value === "") return [];
    return [value];
  }

  function coerceStringArray(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return String(item); }).filter(Boolean);
    }
    if (value == null || value === "") return [];
    return [String(value)];
  }

  function sanitizeIdentifier(value, fallback) {
    const id = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return id || fallback;
  }

  function uniqueIdentifier(baseId, used, prefix) {
    let id = baseId;
    if (!used.has(id)) return id;
    let index = 1;
    do {
      id = prefix + String(index).padStart(3, "0");
      index += 1;
    } while (used.has(id));
    return id;
  }

  function resolvePerspectiveId(value, perspectives, repairs) {
    const raw = String(value || "");
    if (raw && perspectives.idMap[raw]) return perspectives.idMap[raw];
    if (raw) {
      const id = sanitizeIdentifier(raw, "p" + String(perspectives.items.length + 1).padStart(3, "0"));
      const uniqueId = uniqueIdentifier(id, perspectives.ids, "p");
      perspectives.items.push({ id: uniqueId, label: raw, color: "#727b76" });
      perspectives.ids.add(uniqueId);
      perspectives.idMap[raw] = uniqueId;
      perspectives.idMap[uniqueId] = uniqueId;
      repairs.push("nodes で使われている未知の perspective を追加しました: " + raw + " -> " + uniqueId);
      return uniqueId;
    }
    repairs.push("node.perspective が空のため " + perspectives.defaultId + " に補完しました。");
    return perspectives.defaultId;
  }

  function coerceNodeType(value, nodeId, repairs) {
    const map = {
      issue: "issue",
      structural_factor: "structural_factor",
      assumption: "assumption",
      external_factor: "external_factor",
      mental_model: "mental_model",
      課題: "issue",
      構造要因: "structural_factor",
      前提条件: "assumption",
      外部環境: "external_factor",
      価値観: "mental_model",
      固定観念: "mental_model",
      メンタルモデル: "mental_model"
    };
    const key = String(value || "");
    if (map[key]) return map[key];
    repairs.push("node.type を issue に補完しました: " + nodeId);
    return "issue";
  }

  function coerceNodeLayer(value, nodeId, repairs) {
    const map = {
      event: "event",
      pattern: "pattern",
      structure: "structure",
      mental_model: "mental_model",
      事象: "event",
      表層: "event",
      傾向: "pattern",
      パターン: "pattern",
      構造: "structure",
      認識: "mental_model",
      価値観: "mental_model",
      メンタルモデル: "mental_model"
    };
    const key = String(value || "");
    if (map[key]) return map[key];
    repairs.push("node.layer を structure に補完しました: " + nodeId);
    return "structure";
  }

  function coerceNodeStatus(value, nodeId, repairs) {
    const map = {
      hypothesis: "hypothesis",
      supported: "supported",
      needs_review: "needs_review",
      仮説: "hypothesis",
      根拠あり: "supported",
      要確認: "needs_review",
      確認必要: "needs_review"
    };
    const key = String(value || "");
    if (map[key]) return map[key];
    repairs.push("node.status を hypothesis に補完しました: " + nodeId);
    return "hypothesis";
  }

  function coerceEvidenceIds(value, evidenceIds, nodeId, repairs) {
    const ids = Array.isArray(value) ? value : splitIds(value);
    const result = [];
    ids.forEach(function (id) {
      const evidenceId = String(id);
      if (evidenceIds.has(evidenceId)) {
        result.push(evidenceId);
      } else {
        repairs.push("存在しない evidenceId を node から除外しました: " + nodeId + " / " + evidenceId);
      }
    });
    return result;
  }

  function resolveNodeReference(value, nodes) {
    const raw = String(value || "");
    if (!raw) return null;
    if (nodes.idMap[raw]) return nodes.idMap[raw];
    if (nodes.labelMap[raw]) return nodes.labelMap[raw];
    const sanitized = sanitizeIdentifier(raw, "");
    return nodes.idMap[sanitized] || null;
  }

  function coercePolarity(value, edgeId, repairs) {
    const key = String(value || "");
    const map = {
      "+": "+",
      "-": "-",
      unknown: "unknown",
      positive: "+",
      negative: "-",
      plus: "+",
      minus: "-",
      正: "+",
      負: "-",
      不明: "unknown",
      unknown_direction: "unknown"
    };
    if (map[key]) return map[key];
    repairs.push("edge.polarity を unknown に補完しました: " + edgeId);
    return "unknown";
  }

  function coerceConfidence(value, edgeId, repairs) {
    const key = String(value || "");
    const map = {
      high: "high",
      medium: "medium",
      low: "low",
      高: "high",
      中: "medium",
      低: "low",
      強: "high",
      弱: "low"
    };
    if (map[key]) return map[key];
    repairs.push("edge.confidence を medium に補完しました: " + edgeId);
    return "medium";
  }

  function ensureEditableData() {
    if (IssueMapState.data) return;
    IssueMapState.data = {
      schemaVersion: SCHEMA_VERSION,
      title: "新しい課題構造マップ",
      scope: {
        theme: "",
        geography: "",
        targetPopulation: "",
        assumptions: []
      },
      perspectives: [
        { id: "general", label: "全般", color: "#2f8f6f" }
      ],
      nodes: [],
      edges: [],
      evidence: [],
      layout: {
        engine: "auto",
        positions: {},
        pinnedNodeIds: []
      }
    };
    IssueMapState.visiblePerspectives = new Set(["general"]);
    syncDataToInput();
    updateMeta();
    renderFilterBar();
  }

  function ensurePerspectiveFilters(data) {
    const next = new Set();
    data.perspectives.forEach(function (perspective) {
      if (IssueMapState.visiblePerspectives.size === 0 || IssueMapState.visiblePerspectives.has(perspective.id)) {
        next.add(perspective.id);
      }
    });
    if (next.size === 0) {
      data.perspectives.forEach(function (perspective) {
        next.add(perspective.id);
      });
    }
    IssueMapState.visiblePerspectives = next;
  }

  function generateIssueMapDot(data, visibleNodes) {
    const perspectiveById = indexById(data.perspectives);
    const nodesByPerspective = new Map();
    data.nodes.forEach(function (node) {
      if (!visibleNodes.has(node.id)) return;
      if (!nodesByPerspective.has(node.perspective)) nodesByPerspective.set(node.perspective, []);
      nodesByPerspective.get(node.perspective).push(node);
    });

    let dot = "digraph IssueMap {\n";
    dot += '  graph [fontname="Arial", rankdir="LR", splines=true, overlap=false, nodesep=0.45, ranksep=0.7, bgcolor="transparent"];\n';
    dot += '  node [fontname="Arial", shape="box", margin="0.08,0.06", style="rounded,filled", fontsize=11];\n';
    dot += '  edge [fontname="Arial", arrowsize=0.7, fontsize=9, color="#7d8790"];\n';
    dot += '  label="' + dotEscape(data.title || "課題構造マップ") + '";\n';
    dot += '  labelloc="t";\n';
    dot += '  fontsize=20;\n';

    data.perspectives.forEach(function (perspective) {
      const nodes = nodesByPerspective.get(perspective.id) || [];
      if (nodes.length === 0) return;
      const color = normalizeColor(perspective.color, "#7d8790");
      dot += "  subgraph cluster_" + sanitizeDotId(perspective.id) + " {\n";
      dot += '    label="' + dotEscape(perspective.label || perspective.id) + '";\n';
      dot += '    style="rounded,filled";\n';
      dot += '    color="' + color + '";\n';
      dot += '    fillcolor="' + mixWithWhite(color, 0.9) + '";\n';
      dot += "    penwidth=1.4;\n";
      nodes.forEach(function (node) {
        dot += "    " + quoteId(node.id) + " [" + buildNodeAttrs(node, color).join(", ") + "];\n";
      });
      dot += "  }\n";
    });

    data.edges.forEach(function (edge) {
      if (!visibleNodes.has(edge.from) || !visibleNodes.has(edge.to)) return;
      const sourceNode = data.nodes.find(function (node) { return node.id === edge.from; });
      const perspective = sourceNode ? perspectiveById[sourceNode.perspective] : null;
      const color = edgeColor(edge, perspective);
      dot += "  " + quoteId(edge.from) + " -> " + quoteId(edge.to) + " [" + buildEdgeAttrs(edge, color).join(", ") + "];\n";
    });

    dot += "}\n";
    return dot;
  }

  function buildNodeAttrs(node, perspectiveColor) {
    const fillColor = nodeFillColor(node, perspectiveColor);
    const penWidth = node.status === "supported" ? "2.0" : "1.4";
    return [
      'id="' + dotEscape("node_" + node.id) + '"',
      'label="' + dotEscape(wrapLabel(node.label || node.id, 12)) + '"',
      'tooltip="' + dotEscape(nodeTooltip(node)) + '"',
      'color="' + normalizeColor(perspectiveColor, "#7d8790") + '"',
      'fillcolor="' + fillColor + '"',
      'fontcolor="#202723"',
      "penwidth=" + penWidth
    ];
  }

  function buildEdgeAttrs(edge, color) {
    const style = "solid";
    const penWidth = "1.2";
    const polarityLabel = edge.polarity === "unknown" ? "?" : edge.polarity;
    return [
      'id="' + dotEscape("edge_" + edge.id) + '"',
      'label="' + dotEscape(polarityLabel) + '"',
      'tooltip="' + dotEscape(edge.rationale || edge.id) + '"',
      'color="' + EDGE_DEFAULT_COLOR + '"',
      'fontcolor="' + EDGE_DEFAULT_COLOR + '"',
      'style="' + style + '"',
      "penwidth=" + penWidth
    ];
  }

  function nodeFillColor(node, perspectiveColor) {
    return mixWithWhite(perspectiveColor, 0.84);
  }

  function edgeColor(edge, perspective) {
    return EDGE_DEFAULT_COLOR;
  }

  function nodeTooltip(node) {
    return [
      node.id,
      TYPE_LABELS[node.type] || node.type,
      LAYER_LABELS[node.layer] || node.layer,
      STATUS_LABELS[node.status] || node.status
    ].filter(Boolean).join(" / ");
  }

  function renderFilterBar() {
    if (!IssueMapState.data) {
      els.filterBar.innerHTML = "";
      return;
    }

    els.filterBar.innerHTML = IssueMapState.data.perspectives.map(function (perspective) {
      const checked = IssueMapState.visiblePerspectives.has(perspective.id) ? " checked" : "";
      return [
        '<label class="issue-filter-chip">',
        '<input type="checkbox" value="' + escapeAttribute(perspective.id) + '"' + checked + '>',
        '<span class="issue-filter-swatch" style="background:' + escapeAttribute(normalizeColor(perspective.color, "#7d8790")) + '"></span>',
        '<span>' + escapeHtml(perspective.label || perspective.id) + '</span>',
        "</label>"
      ].join("");
    }).join("");

    els.filterBar.querySelectorAll("input[type='checkbox']").forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        if (checkbox.checked) {
          IssueMapState.visiblePerspectives.add(checkbox.value);
        } else {
          IssueMapState.visiblePerspectives.delete(checkbox.value);
        }
        renderIssueMap();
      });
    });
  }

  function getVisibleNodeIds(data) {
    const ids = new Set();
    data.nodes.forEach(function (node) {
      if (IssueMapState.visiblePerspectives.has(node.perspective)) {
        ids.add(node.id);
      }
    });
    return ids;
  }

  async function renderElkMap(data, visibleNodes) {
    if (typeof ELK !== "function") {
      throw new Error("ELK.js が読み込まれていません。");
    }

    const elk = new ELK();
    const graph = createElkGraph(data, visibleNodes);
    const layout = await elk.layout(graph);
    return createElkSvg(data, layout);
  }

  function createElkGraph(data, visibleNodes) {
    const renderableEdgeIds = getRenderableEdgeIds(data);
    const visibleEdges = data.edges.filter(function (edge) {
      return renderableEdgeIds.has(edge.id) && visibleNodes.has(edge.from) && visibleNodes.has(edge.to);
    });

    return {
      id: "issue-map-root",
      width: 1180,
      height: 610,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.aspectRatio": "1.7",
        "elk.direction": "RIGHT",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "18",
        "elk.spacing.edgeNode": "12",
        "elk.spacing.edgeEdge": "8",
        "elk.layered.spacing.nodeNodeBetweenLayers": "34",
        "elk.layered.spacing.edgeNodeBetweenLayers": "10",
        "elk.layered.spacing.edgeEdgeBetweenLayers": "8",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES"
      },
      children: data.nodes
        .filter(function (node) { return visibleNodes.has(node.id); })
        .map(function (node) {
          const size = elkNodeSize(node);
          return {
            id: node.id,
            width: size.width,
            height: size.height,
            layoutOptions: {
              "elk.portConstraints": "FIXED_SIDE"
            }
          };
        }),
      edges: visibleEdges.map(function (edge) {
        return {
          id: edge.id,
          sources: [edge.from],
          targets: [edge.to]
        };
      })
    };
  }

  function createElkSvg(data, layout) {
    const padding = ELK_MAP.padding;
    const titleHeight = ELK_MAP.titleHeight;
    const width = Math.max(ELK_MAP.minWidth, Math.ceil((layout.width || 0) + padding * 2));
    const height = Math.max(ELK_MAP.minHeight, Math.ceil((layout.height || 0) + padding * 2 + titleHeight));
    const svg = svgElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 " + width + " " + height,
      preserveAspectRatio: "xMidYMid meet"
    });

    svg.appendChild(svgElement("rect", {
      x: 0,
      y: 0,
      width: width,
      height: height,
      fill: "#ffffff"
    }));
    appendDefs(svg);
    appendElkTitle(svg, data, width);

    const graphGroup = svgElement("g", {
      transform: "translate(" + padding + " " + (padding + titleHeight) + ")"
    });
    appendElkEdges(graphGroup, data, layout);
    appendElkNodes(graphGroup, data, layout);
    svg.appendChild(graphGroup);
    appendElkLegend(svg, data, padding, height - padding - 26);
    return svg;
  }

  function appendElkTitle(svg, data, width) {
    const title = svgElement("text", {
      class: "issue-map-title",
      x: width / 2,
      y: 24,
      "text-anchor": "middle",
      "font-size": 21,
      "font-weight": 700,
      fill: "#202723"
    });
    title.textContent = data.title || "課題構造マップ";
    svg.appendChild(title);

    const subtitleParts = [];
    if (data.scope && data.scope.theme) subtitleParts.push(data.scope.theme);
    if (data.scope && data.scope.geography) subtitleParts.push(data.scope.geography);
    if (subtitleParts.length > 0) {
      const subtitle = svgElement("text", {
        class: "issue-map-title",
        x: width / 2,
        y: 46,
        "text-anchor": "middle",
        "font-size": 11,
        fill: "#66706a"
      });
      subtitle.textContent = subtitleParts.join(" / ");
      svg.appendChild(subtitle);
    }
  }

  function appendElkEdges(group, data, layout) {
    const edgeById = indexById(data.edges);
    const halosLayer = svgElement("g", { class: "issue-edge-halos" });
    const edgesLayer = svgElement("g", { class: "issue-edges" });

    (layout.edges || []).forEach(function (layoutEdge) {
      const edge = edgeById[layoutEdge.id];
      if (!edge) return;
      const section = layoutEdge.sections && layoutEdge.sections[0];
      if (!section) return;
      const points = elkEdgePoints(section);
      const path = pointsToPath(points);

      halosLayer.appendChild(svgElement("path", {
        id: "edge_halo_" + edge.id,
        class: "issue-edge-halo",
        d: path,
        fill: "none",
        stroke: "#ffffff",
        "stroke-width": 4.8,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: 0.72
      }));

      const edgeGroup = svgElement("g", {
        id: "edge_" + edge.id,
        class: "edge"
      });
      edgeGroup.appendChild(svgElement("path", {
        class: "issue-edge-hit-area",
        d: path,
        fill: "none",
        stroke: "transparent",
        "stroke-width": 14,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }));
      edgeGroup.appendChild(svgElement("path", {
        class: "issue-edge-path",
        d: path,
        fill: "none",
        stroke: EDGE_DEFAULT_COLOR,
        "stroke-width": 1.55,
        "marker-end": "url(#issue-arrow-neutral)",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: 0.72
      }));
      edgesLayer.appendChild(edgeGroup);
    });

    group.appendChild(halosLayer);
    group.appendChild(edgesLayer);
  }

  function appendElkNodes(group, data, layout) {
    const nodeById = indexById(data.nodes);
    const perspectiveById = indexById(data.perspectives);
    const nodesLayer = svgElement("g", { class: "issue-nodes" });

    (layout.children || []).forEach(function (layoutNode) {
      const node = nodeById[layoutNode.id];
      if (!node) return;
      const perspective = perspectiveById[node.perspective];
      const color = normalizeColor(perspective && perspective.color, "#7d8790");
      const placement = {
        id: node.id,
        x: layoutNode.x,
        y: layoutNode.y,
        cx: layoutNode.x + layoutNode.width / 2,
        cy: layoutNode.y + layoutNode.height / 2,
        width: layoutNode.width,
        height: layoutNode.height
      };
      const nodeGroup = svgElement("g", {
        id: "node_" + node.id,
        class: "node"
      });
      nodeGroup.appendChild(svgElement("rect", {
        class: "issue-node-box",
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rx: 8,
        fill: nodeFillColor(node, color),
        stroke: color,
        "stroke-width": node.status === "supported" ? 2 : 1.35
      }));
      appendNodeLabel(nodeGroup, node, placement);
      nodesLayer.appendChild(nodeGroup);
    });

    group.appendChild(nodesLayer);
  }

  function appendElkLegend(svg, data, x, y) {
    if (!data.perspectives || data.perspectives.length === 0) return;
    const group = svgElement("g", { class: "issue-map-legend" });
    let cursorX = x;
    data.perspectives.forEach(function (perspective) {
      const label = perspective.label || perspective.id;
      const color = normalizeColor(perspective.color, "#7d8790");
      const width = Math.max(72, Array.from(label).length * 12 + 32);
      group.appendChild(svgElement("rect", {
        x: cursorX,
        y: y - 15,
        width: 12,
        height: 12,
        rx: 2,
        fill: color
      }));
      const text = svgElement("text", {
        x: cursorX + 18,
        y: y - 5,
        "font-size": 12,
        fill: "#3b4540"
      });
      text.textContent = label;
      group.appendChild(text);
      cursorX += width;
    });
    svg.appendChild(group);
  }

  function elkNodeSize(node) {
    const lines = wrapLabelForNode(node.label || node.id, {
      width: ELK_MAP.nodeWidth,
      fontSize: ELK_MAP.labelFontSize,
      paddingX: ELK_MAP.labelPaddingX,
      maxLines: ELK_MAP.labelMaxLines
    });
    return {
      width: ELK_MAP.nodeWidth,
      height: Math.max(ELK_MAP.minNodeHeight, 18 + lines.length * ELK_MAP.labelLineHeight)
    };
  }

  function elkEdgePoints(section) {
    return [section.startPoint]
      .concat(section.bendPoints || [])
      .concat([section.endPoint])
      .map(function (point) {
        return {
          x: Math.round(point.x * 10) / 10,
          y: Math.round(point.y * 10) / 10
        };
      });
  }

  function elkLabelPoint(layoutEdge, points) {
    const label = layoutEdge.labels && layoutEdge.labels[0];
    if (label && Number.isFinite(label.x) && Number.isFinite(label.y)) {
      return {
        x: label.x + (label.width || 0) / 2,
        y: label.y + (label.height || 0) / 2
      };
    }
    return routeLabelPoint(points);
  }

  function createSlideSvg(data, visibleNodes) {
    const svg = svgElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 " + SLIDE.width + " " + SLIDE.height,
      preserveAspectRatio: "xMidYMid meet"
    });

    const background = svgElement("rect", {
      x: 0,
      y: 0,
      width: SLIDE.width,
      height: SLIDE.height,
      fill: "#ffffff"
    });
    svg.appendChild(background);
    appendDefs(svg);

    appendSlideTitle(svg, data);
    const layout = calculateSlideLayout(data, visibleNodes);
    appendPerspectiveBands(svg, layout);
    appendEdges(svg, data, layout);
    appendNodes(svg, data, layout);
    return svg;
  }

  function appendDefs(svg) {
    const defs = svgElement("defs");
    [
      { id: "issue-arrow-neutral", color: EDGE_DEFAULT_COLOR },
      { id: "issue-arrow-positive", color: EDGE_DEFAULT_COLOR },
      { id: "issue-arrow-negative", color: EDGE_DEFAULT_COLOR },
      { id: "issue-arrow-unknown", color: EDGE_DEFAULT_COLOR },
      { id: "issue-arrow-selected", color: "#3f4743" }
    ].forEach(function (marker) {
      const markerNode = svgElement("marker", {
        id: marker.id,
        markerWidth: 7,
        markerHeight: 7,
        refX: 6.4,
        refY: 3.5,
        orient: "auto",
        markerUnits: "userSpaceOnUse"
      });
      markerNode.appendChild(svgElement("path", {
        d: "M0,0 L7,3.5 L0,7 Z",
        fill: marker.color
      }));
      defs.appendChild(markerNode);
    });
    svg.appendChild(defs);
  }

  function appendSlideTitle(svg, data) {
    const title = svgElement("text", {
      class: "issue-map-title",
      x: SLIDE.width / 2,
      y: SLIDE.titleY,
      "text-anchor": "middle",
      "font-size": 21,
      "font-weight": 700,
      fill: "#202723"
    });
    title.textContent = data.title || "課題構造マップ";
    svg.appendChild(title);

    const subtitleParts = [];
    if (data.scope && data.scope.theme) subtitleParts.push(data.scope.theme);
    if (data.scope && data.scope.geography) subtitleParts.push(data.scope.geography);
    if (subtitleParts.length > 0) {
      const subtitle = svgElement("text", {
        class: "issue-map-title",
        x: SLIDE.width / 2,
        y: 46,
        "text-anchor": "middle",
        "font-size": 11,
        fill: "#66706a"
      });
      subtitle.textContent = subtitleParts.join(" / ");
      svg.appendChild(subtitle);
    }
  }

  function calculateSlideLayout(data, visibleNodes) {
    const visiblePerspectives = data.perspectives.filter(function (perspective) {
      return data.nodes.some(function (node) {
        return visibleNodes.has(node.id) && node.perspective === perspective.id;
      });
    });
    const rowCount = Math.max(visiblePerspectives.length, 1);
    const availableHeight = SLIDE.height - SLIDE.top - SLIDE.bottom - SLIDE.rowGap * (rowCount - 1);
    const columnXs = [
      SLIDE.marginX + 160,
      SLIDE.marginX + 405,
      SLIDE.marginX + 650,
      SLIDE.marginX + 895
    ];
    const layout = {
      perspectives: [],
      nodes: {},
      columns: columnXs
    };
    const rowPlans = visiblePerspectives.map(function (perspective) {
      const groups = [[], [], [], []];
      data.nodes.forEach(function (node) {
        if (visibleNodes.has(node.id) && node.perspective === perspective.id) {
          groups[columnForNode(node)].push(node);
        }
      });
      const maxStack = Math.max.apply(null, groups.map(function (nodes) {
        return nodes.length;
      }).concat([1]));
      return {
        perspective: perspective,
        groups: groups,
        weight: Math.max(2, maxStack)
      };
    });
    const totalWeight = rowPlans.reduce(function (sum, plan) {
      return sum + plan.weight;
    }, 0);
    let rowY = SLIDE.top;

    rowPlans.forEach(function (plan) {
      const perspective = plan.perspective;
      const rowHeight = availableHeight * (plan.weight / totalWeight);
      const row = {
        id: perspective.id,
        label: perspective.label || perspective.id,
        color: normalizeColor(perspective.color, "#7d8790"),
        x: SLIDE.marginX,
        y: rowY,
        width: SLIDE.width - SLIDE.marginX * 2,
        height: rowHeight
      };
      layout.perspectives.push(row);

      plan.groups.forEach(function (nodes, columnIndex) {
        if (nodes.length === 0) return;
        const usableTop = row.y + 24;
        const usableHeight = Math.max(row.height - 30, SLIDE.minNodeHeight);
        const slotHeight = usableHeight / nodes.length;
        const nodeHeight = clamp(slotHeight - 5, SLIDE.minNodeHeight, SLIDE.maxNodeHeight);
        nodes.forEach(function (node, nodeIndex) {
          const cx = columnXs[columnIndex];
          const cy = usableTop + slotHeight * nodeIndex + slotHeight / 2;
          layout.nodes[node.id] = {
            id: node.id,
            x: cx - SLIDE.nodeWidth / 2,
            y: cy - nodeHeight / 2,
            cx: cx,
            cy: cy,
            width: SLIDE.nodeWidth,
            height: nodeHeight,
            row: row,
            column: columnIndex
          };
        });
      });
      rowY += rowHeight + SLIDE.rowGap;
    });

    return layout;
  }

  function columnForNode(node) {
    if (node.type === "assumption" || node.type === "external_factor" || node.type === "mental_model") return 0;
    if (node.layer === "mental_model") return 0;
    if (node.layer === "structure") return 1;
    if (node.layer === "pattern") return 2;
    return 3;
  }

  function appendPerspectiveBands(svg, layout) {
    layout.perspectives.forEach(function (row) {
      const group = svgElement("g");
      group.appendChild(svgElement("rect", {
        class: "issue-perspective-band",
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        rx: 9,
        fill: mixWithWhite(row.color, 0.9),
        stroke: row.color,
        "stroke-width": 1.2
      }));
      const label = svgElement("text", {
        class: "issue-perspective-label",
        x: row.x + 12,
        y: row.y + 20,
        "font-size": 15,
        "font-weight": 700,
        fill: row.color
      });
      label.textContent = row.label;
      group.appendChild(label);
      svg.appendChild(group);
    });
  }

  function appendEdges(svg, data, layout) {
    const routedEdges = routeVisibleEdges(data, layout);
    const edgesLayer = svgElement("g", { class: "issue-edges" });

    routedEdges.forEach(function (route) {
      const edge = route.edge;
      const edgeGroup = svgElement("g", {
        id: "edge_" + edge.id,
        class: "edge"
      });
      edgeGroup.appendChild(svgElement("path", {
        class: "issue-edge-hit-area",
        d: route.path,
        fill: "none",
        stroke: "transparent",
        "stroke-width": 14,
        "stroke-linecap": "round",
        "stroke-linejoin": "round"
      }));
      edgeGroup.appendChild(svgElement("path", {
        class: "issue-edge-path",
        d: route.path,
        fill: "none",
        stroke: route.color,
        "stroke-width": 1.25,
        "marker-end": "url(#" + route.markerId + ")",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: 0.46
      }));
      appendEdgeMidTag(edgeGroup, route);
      edgesLayer.appendChild(edgeGroup);
    });

    svg.appendChild(edgesLayer);
    appendRelationLegend(svg, data, routedEdges);
  }

  function routeVisibleEdges(data, layout) {
    const renderableEdgeIds = getRenderableEdgeIds(data);
    const visibleEdges = data.edges
      .filter(function (edge) {
        return renderableEdgeIds.has(edge.id) && layout.nodes[edge.from] && layout.nodes[edge.to];
      })
      .map(function (edge) {
        const from = layout.nodes[edge.from];
        const to = layout.nodes[edge.to];
        const sides = chooseEdgeSides(from, to);
        return {
          edge: edge,
          from: from,
          to: to,
          fromSide: sides.fromSide,
          toSide: sides.toSide
      };
    });

    return routeOverviewEdges(visibleEdges);

    const portCounts = {};
    visibleEdges.forEach(function (spec) {
      incrementPortCount(portCounts, spec.edge.from, spec.fromSide);
      incrementPortCount(portCounts, spec.edge.to, spec.toSide);
    });

    const portIndexes = {};
    const routeUsage = new Map();
    const routes = [];
    const obstacles = Object.values(layout.nodes).map(function (node) {
      return inflateRect(node, 10);
    });

    visibleEdges.forEach(function (spec) {
      const fromIndex = nextPortIndex(portIndexes, spec.edge.from, spec.fromSide);
      const toIndex = nextPortIndex(portIndexes, spec.edge.to, spec.toSide);
      const fromCount = getPortCount(portCounts, spec.edge.from, spec.fromSide);
      const toCount = getPortCount(portCounts, spec.edge.to, spec.toSide);
      const startPort = getPortPoint(spec.from, spec.fromSide, distributedPortOffset(fromIndex, fromCount));
      const endPort = getPortPoint(spec.to, spec.toSide, distributedPortOffset(toIndex, toCount));
      const points = routeOrthogonalEdge(
        startPort,
        endPort,
        obstacles,
        routeUsage,
        new Set([spec.edge.from, spec.edge.to]),
        layout
      );
      addRouteUsage(routeUsage, points);
      routes.push({
        edge: spec.edge,
        points: points,
        path: pointsToPath(points),
        labelPoint: routeLabelPoint(points),
        startPoint: points[0],
        endPoint: points[points.length - 1],
        tag: compactEdgeTag(spec.edge.id),
        color: EDGE_DEFAULT_COLOR,
        markerId: "issue-arrow-neutral"
      });
    });
    return routes;
  }

  function routeOverviewEdges(edgeSpecs) {
    const pairIndexes = {};
    return edgeSpecs.map(function (spec, index) {
      const edge = spec.edge;
      const start = intersectRectBoundary(spec.from, spec.to.cx, spec.to.cy);
      const end = intersectRectBoundary(spec.to, spec.from.cx, spec.from.cy);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const pairKey = edge.from + "->" + edge.to;
      pairIndexes[pairKey] = (pairIndexes[pairKey] || 0) + 1;
      const direction = index % 2 === 0 ? 1 : -1;
      const bend = clamp(len * 0.08, 10, 28) * direction + (pairIndexes[pairKey] - 1) * 8;
      const control = {
        x: (start.x + end.x) / 2 - dy / len * bend,
        y: (start.y + end.y) / 2 + dx / len * bend
      };
      return {
        edge: edge,
        points: [start, control, end],
        path: "M " + start.x + " " + start.y + " Q " + control.x + " " + control.y + " " + end.x + " " + end.y,
        labelPoint: control,
        startPoint: start,
        endPoint: end,
        tag: compactEdgeTag(edge.id),
        color: EDGE_DEFAULT_COLOR,
        markerId: "issue-arrow-neutral"
      };
    });
  }

  function intersectRectBoundary(rect, targetX, targetY) {
    const dx = targetX - rect.cx;
    const dy = targetY - rect.cy;
    if (Math.abs(dx / rect.width) > Math.abs(dy / rect.height)) {
      const x = rect.cx + Math.sign(dx || 1) * rect.width / 2;
      return {
        x: x,
        y: rect.cy + dy * ((x - rect.cx) / (dx || 1))
      };
    }
    const y = rect.cy + Math.sign(dy || 1) * rect.height / 2;
    return {
      x: rect.cx + dx * ((y - rect.cy) / (dy || 1)),
      y: y
    };
  }

  function appendEdgeEndpointTags(group, route) {
    const start = route.startPoint;
    const end = route.endPoint;
    appendEdgeTag(group, route.tag, start.x, start.y, route.color, "source");
    appendEdgeTag(group, route.tag, end.x, end.y, route.color, "target");
  }

  function appendEdgeMidTag(group, route) {
    const point = route.labelPoint;
    const suffix = route.edge.polarity === "-" ? "-" : route.edge.polarity === "unknown" ? "?" : "";
    appendEdgeTag(group, route.tag + suffix, point.x, point.y, route.color, "middle");
  }

  function appendEdgeTag(group, label, x, y, color, kind) {
    const width = Math.max(21, label.length * 6 + 8);
    const height = 16;
    const offsetX = kind === "source" ? -width - 5 : kind === "middle" ? -width / 2 : 5;
    const offsetY = -height / 2;
    const tagGroup = svgElement("g", {
      class: "issue-edge-tag-group"
    });
    tagGroup.appendChild(svgElement("rect", {
      class: kind === "source" ? "issue-edge-tag-outline" : "issue-edge-tag-bg",
      x: x + offsetX,
      y: y + offsetY,
      width: width,
      height: height,
      rx: 4,
      fill: kind === "source" || kind === "middle" ? "#ffffff" : color,
      stroke: color,
      "stroke-width": 1.2
    }));
    const text = svgElement("text", {
      class: "issue-edge-tag",
      x: x + offsetX + width / 2,
      y: y + 4,
      "text-anchor": "middle",
      fill: kind === "source" || kind === "middle" ? color : "#ffffff"
    });
    text.textContent = label;
    tagGroup.appendChild(text);
    group.appendChild(tagGroup);
  }

  function appendRelationLegend(svg, data, routedEdges) {
    if (routedEdges.length === 0 || routedEdges.length > 8) return;
    const nodeById = indexById(data.nodes);
    const width = 340;
    const rowHeight = 18;
    const height = 30 + routedEdges.length * rowHeight;
    const x = SLIDE.width - width - 34;
    const y = SLIDE.height - height - 26;
    const group = svgElement("g", { class: "issue-relation-legend" });
    group.appendChild(svgElement("rect", {
      x: x,
      y: y,
      width: width,
      height: height,
      rx: 8,
      fill: "#ffffff",
      "fill-opacity": 0.94,
      stroke: "#cbd5ce",
      "stroke-width": 1
    }));
    const title = svgElement("text", {
      x: x + 12,
      y: y + 18,
      "font-size": 12,
      "font-weight": 700,
      fill: "#202723"
    });
    title.textContent = "関係ID";
    group.appendChild(title);
    routedEdges.forEach(function (route, index) {
      const edge = route.edge;
      const from = nodeById[edge.from];
      const to = nodeById[edge.to];
      const text = svgElement("text", {
        x: x + 12,
        y: y + 36 + index * rowHeight,
        "font-size": 10.5,
        fill: "#202723"
      });
      text.textContent = route.tag + " " + shortLabel(from && from.label, 14) + " -> " + shortLabel(to && to.label, 14);
      group.appendChild(text);
    });
    svg.appendChild(group);
  }

  function getRenderableEdgeIds(data) {
    return new Set(data.edges.map(function (edge) { return edge.id; }));
  }

  function chooseEdgeSides(from, to) {
    const dx = to.cx - from.cx;
    const dy = to.cy - from.cy;
    if (Math.abs(dx) > 70) {
      return dx > 0
        ? { fromSide: "right", toSide: "left" }
        : { fromSide: "left", toSide: "right" };
    }
    return dy > 0
      ? { fromSide: "bottom", toSide: "top" }
      : { fromSide: "top", toSide: "bottom" };
  }

  function routeOrthogonalEdge(startPort, endPort, obstacles, routeUsage, excludedNodeIds) {
    const leadDistance = 26;
    const start = startPort.anchor;
    const startLead = pointFromSide(startPort.anchor, startPort.side, leadDistance);
    const end = endPort.anchor;
    const endLead = pointFromSide(endPort.anchor, endPort.side, leadDistance);
    const pathCore = findGridPath(startLead, endLead, obstacles, routeUsage, excludedNodeIds);
    const points = [start, startLead].concat(pathCore.slice(1, -1), [endLead, end]);
    return simplifyRoute(points);
  }

  function findGridPath(start, end, obstacles, routeUsage, excludedNodeIds) {
    const step = 8;
    const maxX = Math.round(SLIDE.width / step);
    const maxY = Math.round(SLIDE.height / step);
    const blocked = buildBlockedGrid(obstacles, step, excludedNodeIds);
    const startCell = pointToCell(start, step, maxX, maxY);
    const endCell = pointToCell(end, step, maxX, maxY);
    unblockCell(blocked, startCell);
    unblockCell(blocked, endCell);

    const directions = [
      { x: 1, y: 0, id: 0 },
      { x: -1, y: 0, id: 1 },
      { x: 0, y: 1, id: 2 },
      { x: 0, y: -1, id: 3 }
    ];
    const heap = new MinHeap();
    const startKey = cellKey(startCell.x, startCell.y, -1);
    const best = new Map([[startKey, 0]]);
    const prev = new Map();
    heap.push({
      x: startCell.x,
      y: startCell.y,
      dir: -1,
      cost: 0,
      score: manhattan(startCell, endCell)
    });

    let found = null;
    while (heap.size() > 0) {
      const current = heap.pop();
      const currentKey = cellKey(current.x, current.y, current.dir);
      if (current.cost !== best.get(currentKey)) continue;
      if (current.x === endCell.x && current.y === endCell.y) {
        found = current;
        break;
      }

      directions.forEach(function (direction) {
        const nx = current.x + direction.x;
        const ny = current.y + direction.y;
        if (nx < 0 || ny < 0 || nx > maxX || ny > maxY) return;
        if (isCellBlocked(blocked, nx, ny)) return;
        const turnCost = current.dir !== -1 && current.dir !== direction.id ? 18 : 0;
        const usageCost = (routeUsage.get(simpleCellKey(nx, ny)) || 0) * 32;
        const edgeCost = 8 + turnCost + usageCost;
        const nextCost = current.cost + edgeCost;
        const nextKey = cellKey(nx, ny, direction.id);
        if (best.has(nextKey) && best.get(nextKey) <= nextCost) return;
        best.set(nextKey, nextCost);
        prev.set(nextKey, currentKey);
        heap.push({
          x: nx,
          y: ny,
          dir: direction.id,
          cost: nextCost,
          score: nextCost + manhattan({ x: nx, y: ny }, endCell) * 8
        });
      });
    }

    if (!found) {
      return simplifyRoute([start, { x: start.x, y: end.y }, end]);
    }

    const cells = [];
    let key = cellKey(found.x, found.y, found.dir);
    while (key) {
      const parts = key.split(",");
      cells.push({ x: Number(parts[0]), y: Number(parts[1]) });
      key = prev.get(key);
    }
    cells.reverse();
    return simplifyRoute(cells.map(function (cell) {
      return {
        x: cell.x * step,
        y: cell.y * step
      };
    }));
  }

  function buildBlockedGrid(obstacles, step, excludedNodeIds) {
    const blocked = new Set();
    obstacles.forEach(function (rect) {
      if (excludedNodeIds && excludedNodeIds.has(rect.id)) return;
      const x1 = Math.floor(rect.x / step);
      const y1 = Math.floor(rect.y / step);
      const x2 = Math.ceil((rect.x + rect.width) / step);
      const y2 = Math.ceil((rect.y + rect.height) / step);
      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          blocked.add(simpleCellKey(x, y));
        }
      }
    });
    return blocked;
  }

  function getPortPoint(node, side, offset) {
    let x = node.cx;
    let y = node.cy;
    if (side === "left") {
      x = node.x - 5;
      y = clamp(node.cy + offset, node.y + 8, node.y + node.height - 8);
    } else if (side === "right") {
      x = node.x + node.width + 5;
      y = clamp(node.cy + offset, node.y + 8, node.y + node.height - 8);
    } else if (side === "top") {
      x = clamp(node.cx + offset, node.x + 10, node.x + node.width - 10);
      y = node.y - 5;
    } else {
      x = clamp(node.cx + offset, node.x + 10, node.x + node.width - 10);
      y = node.y + node.height + 5;
    }
    return {
      side: side,
      anchor: {
        x: clamp(x, 8, SLIDE.width - 8),
        y: clamp(y, 8, SLIDE.height - 8)
      }
    };
  }

  function pointFromSide(point, side, distance) {
    if (side === "left") return { x: clamp(point.x - distance, 6, SLIDE.width - 6), y: point.y };
    if (side === "right") return { x: clamp(point.x + distance, 6, SLIDE.width - 6), y: point.y };
    if (side === "top") return { x: point.x, y: clamp(point.y - distance, 6, SLIDE.height - 6) };
    return { x: point.x, y: clamp(point.y + distance, 6, SLIDE.height - 6) };
  }

  function oppositeSide(side) {
    if (side === "left") return "left";
    if (side === "right") return "right";
    if (side === "top") return "top";
    return "bottom";
  }

  function simplifyRoute(points) {
    const withoutDuplicates = [];
    points.forEach(function (point) {
      const last = withoutDuplicates[withoutDuplicates.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        withoutDuplicates.push({
          x: Math.round(point.x * 10) / 10,
          y: Math.round(point.y * 10) / 10
        });
      }
    });
    if (withoutDuplicates.length <= 2) return withoutDuplicates;
    const simplified = [withoutDuplicates[0]];
    for (let i = 1; i < withoutDuplicates.length - 1; i++) {
      const prev = simplified[simplified.length - 1];
      const current = withoutDuplicates[i];
      const next = withoutDuplicates[i + 1];
      const sameX = prev.x === current.x && current.x === next.x;
      const sameY = prev.y === current.y && current.y === next.y;
      if (!sameX && !sameY) simplified.push(current);
    }
    simplified.push(withoutDuplicates[withoutDuplicates.length - 1]);
    return simplified;
  }

  function pointsToPath(points) {
    if (points.length === 0) return "";
    return "M " + points.map(function (point) {
      return point.x + " " + point.y;
    }).join(" L ");
  }

  function routeLabelPoint(points) {
    if (points.length === 0) return { x: 0, y: 0 };
    const index = Math.floor(points.length / 2);
    return points[index];
  }

  function addRouteUsage(routeUsage, points) {
    const maxX = Math.round(SLIDE.width / 8);
    const maxY = Math.round(SLIDE.height / 8);
    for (let i = 0; i < points.length - 1; i++) {
      const a = pointToCell(points[i], 8, maxX, maxY);
      const b = pointToCell(points[i + 1], 8, maxX, maxY);
      const dx = Math.sign(b.x - a.x);
      const dy = Math.sign(b.y - a.y);
      let x = a.x;
      let y = a.y;
      routeUsage.set(simpleCellKey(x, y), (routeUsage.get(simpleCellKey(x, y)) || 0) + 1);
      while (x !== b.x || y !== b.y) {
        if (x !== b.x) x += dx;
        if (y !== b.y) y += dy;
        routeUsage.set(simpleCellKey(x, y), (routeUsage.get(simpleCellKey(x, y)) || 0) + 1);
      }
    }
  }

  function incrementPortCount(counts, nodeId, side) {
    const key = nodeId + ":" + side;
    counts[key] = (counts[key] || 0) + 1;
  }

  function getPortCount(counts, nodeId, side) {
    return counts[nodeId + ":" + side] || 1;
  }

  function nextPortIndex(indexes, nodeId, side) {
    const key = nodeId + ":" + side;
    const value = indexes[key] || 0;
    indexes[key] = value + 1;
    return value;
  }

  function distributedPortOffset(index, count) {
    return (index - (count - 1) / 2) * 12;
  }

  function inflateRect(rect, padding) {
    return {
      id: rect.id,
      x: rect.x - padding,
      y: rect.y - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    };
  }

  function pointToCell(point, step, maxX, maxY) {
    return {
      x: clamp(Math.round(point.x / step), 0, maxX),
      y: clamp(Math.round(point.y / step), 0, maxY)
    };
  }

  function unblockCell(blocked, cell) {
    blocked.delete(simpleCellKey(cell.x, cell.y));
  }

  function isCellBlocked(blocked, x, y) {
    return blocked.has(simpleCellKey(x, y));
  }

  function simpleCellKey(x, y) {
    return x + "," + y;
  }

  function cellKey(x, y, direction) {
    return x + "," + y + "," + direction;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function MinHeap() {
    this.items = [];
  }

  MinHeap.prototype.size = function () {
    return this.items.length;
  };

  MinHeap.prototype.push = function (item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  };

  MinHeap.prototype.pop = function () {
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  };

  MinHeap.prototype.bubbleUp = function (index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].score <= this.items[index].score) break;
      const temp = this.items[parent];
      this.items[parent] = this.items[index];
      this.items[index] = temp;
      index = parent;
    }
  };

  MinHeap.prototype.bubbleDown = function (index) {
    while (true) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;
      if (left < this.items.length && this.items[left].score < this.items[smallest].score) {
        smallest = left;
      }
      if (right < this.items.length && this.items[right].score < this.items[smallest].score) {
        smallest = right;
      }
      if (smallest === index) break;
      const temp = this.items[smallest];
      this.items[smallest] = this.items[index];
      this.items[index] = temp;
      index = smallest;
    }
  };

  function appendNodes(svg, data, layout) {
    const perspectiveById = indexById(data.perspectives);
    const nodesLayer = svgElement("g", { class: "issue-nodes" });
    data.nodes.forEach(function (node) {
      const placement = layout.nodes[node.id];
      if (!placement) return;
      const perspective = perspectiveById[node.perspective];
      const color = normalizeColor(perspective && perspective.color, "#7d8790");
      const group = svgElement("g", {
        id: "node_" + node.id,
        class: "node"
      });
      group.appendChild(svgElement("rect", {
        class: "issue-node-box",
        x: placement.x,
        y: placement.y,
        width: placement.width,
        height: placement.height,
        rx: 8,
        fill: nodeFillColor(node, color),
        stroke: color,
        "stroke-width": node.status === "supported" ? 2 : 1.35
      }));
      appendNodeIdBadge(group, node, placement, color);
      appendNodeLabel(group, node, placement);
      nodesLayer.appendChild(group);
    });
    svg.appendChild(nodesLayer);
  }

  function appendNodeIdBadge(group, node, placement, color) {
    const label = compactNodeTag(node.id);
    const width = Math.max(30, label.length * 5.8 + 8);
    const x = placement.x - width - 4;
    const y = placement.cy - 8;
    group.appendChild(svgElement("rect", {
      class: "issue-node-id-badge",
      x: x,
      y: y,
      width: width,
      height: 14,
      rx: 4,
      fill: color,
      stroke: color,
      "stroke-width": 1
    }));
    const text = svgElement("text", {
      class: "issue-node-id-text",
      x: x + width / 2,
      y: y + 10.5,
      "text-anchor": "middle",
      "font-size": 8.8,
      "font-weight": 700,
      fill: "#ffffff"
    });
    text.textContent = label;
    group.appendChild(text);
  }

  function appendNodeLabel(group, node, placement) {
    const isElkNode = placement.width <= ELK_MAP.nodeWidth + 8;
    const fontSize = isElkNode ? ELK_MAP.labelFontSize : 15.2;
    const lineHeight = isElkNode ? ELK_MAP.labelLineHeight : 17;
    const lines = wrapLabelForNode(node.label || node.id, {
      width: placement.width,
      fontSize: fontSize,
      paddingX: isElkNode ? ELK_MAP.labelPaddingX : 18,
      maxLines: isElkNode ? ELK_MAP.labelMaxLines : 2
    });
    const firstY = placement.cy - ((lines.length - 1) * lineHeight) / 2 + 5;
    lines.forEach(function (line, index) {
      const text = svgElement("text", {
        class: "issue-node-label",
        x: placement.cx,
        y: firstY + index * lineHeight,
        "text-anchor": "middle",
        "font-size": lines.length > 1 ? fontSize : fontSize + 1,
        "font-weight": 700,
        fill: "#202723"
      });
      text.textContent = line;
      group.appendChild(text);
    });
  }

  function attachSvgEventHandlers() {
    els.output.onclick = function () {
      IssueMapState.selected = null;
      hideHoverTooltip();
      renderIssueMap();
    };
    els.output.querySelectorAll("g.node[id^='node_']").forEach(function (group) {
      const nodeId = group.id.replace(/^node_/, "");
      group.addEventListener("mouseenter", function (event) {
        showNodeHover(nodeId, group, event);
      });
      group.addEventListener("mouseleave", scheduleHideHoverTooltip);
      group.addEventListener("click", function (event) {
        event.stopPropagation();
        selectItem("node", nodeId);
      });
    });
    els.output.querySelectorAll("g.edge[id^='edge_']").forEach(function (group) {
      const edgeId = group.id.replace(/^edge_/, "");
      group.addEventListener("mouseenter", function (event) {
        showEdgeHover(edgeId, group, event);
      });
      group.addEventListener("mouseleave", scheduleHideHoverTooltip);
      group.addEventListener("click", function (event) {
        event.stopPropagation();
        selectItem("edge", edgeId);
      });
    });
  }

  function selectItem(type, id) {
    IssueMapState.selected = { type: type, id: id };
    renderInspector();
    renderRelationList();
    renderEvidenceList();
    updateSelectionLabel();
    markSelection();
  }

  function markSelection() {
    els.output.querySelectorAll(".issue-map-selected").forEach(function (item) {
      resetEdgeMarker(item);
      item.classList.remove("issue-map-selected");
    });
    if (!IssueMapState.selected || !IssueMapState.selected.id) return;
    const prefix = IssueMapState.selected.type === "edge" ? "edge_" : "node_";
    const selected = els.output.querySelector("#" + cssEscape(prefix + IssueMapState.selected.id));
    if (selected) {
      selected.classList.add("issue-map-selected");
      if (IssueMapState.selected.type === "edge") {
        const path = selected.querySelector(".issue-edge-path");
        if (path) path.setAttribute("marker-end", "url(#issue-arrow-selected)");
      }
    }
    if (IssueMapState.selected.type === "edge") {
      const halo = els.output.querySelector("#" + cssEscape("edge_halo_" + IssueMapState.selected.id));
      if (halo) halo.classList.add("issue-map-selected");
      return;
    }

    if (IssueMapState.selected.type === "node" && IssueMapState.data) {
      IssueMapState.data.edges.forEach(function (edge) {
        if (edge.from !== IssueMapState.selected.id && edge.to !== IssueMapState.selected.id) return;
        const group = els.output.querySelector("#" + cssEscape("edge_" + edge.id));
        if (group) {
          group.classList.add("issue-map-selected");
          const path = group.querySelector(".issue-edge-path");
          if (path) path.setAttribute("marker-end", "url(#issue-arrow-selected)");
        }
        const halo = els.output.querySelector("#" + cssEscape("edge_halo_" + edge.id));
        if (halo) halo.classList.add("issue-map-selected");
      });
    }
  }

  function resetEdgeMarker(group) {
    if (!group || !/^edge_/.test(group.id || "")) return;
    const path = group.querySelector(".issue-edge-path");
    if (path) path.setAttribute("marker-end", "url(#issue-arrow-neutral)");
  }

  function showNodeHover(nodeId, group, event) {
    const node = findNode(nodeId);
    if (!node) return;
    cancelHoverTooltipHide();
    clearHoverHighlights();

    group.classList.add("issue-map-hover");
    IssueMapState.data.edges.forEach(function (edge) {
      if (edge.from === nodeId || edge.to === nodeId) {
        addHoverEdge(edge.id, "issue-map-hover");
      }
    });

    showHoverTooltip(buildNodeHoverTooltipHtml(node), getTooltipAnchor(group, event, "node"));
  }

  function showEdgeHover(edgeId, group, event) {
    const edge = findEdge(edgeId);
    if (!edge) return;
    cancelHoverTooltipHide();
    clearHoverHighlights();

    addHoverEdge(edge.id, "issue-map-hover");
    addHoverNode(edge.from, "issue-map-hover-related");
    addHoverNode(edge.to, "issue-map-hover-related");

    showHoverTooltip(buildEdgeHoverTooltipHtml(edge), getTooltipAnchor(group, event, "edge"));
  }

  function addHoverNode(nodeId, className) {
    const node = els.output.querySelector("#" + cssEscape("node_" + nodeId));
    if (node) node.classList.add(className);
  }

  function addHoverEdge(edgeId, className) {
    const edge = els.output.querySelector("#" + cssEscape("edge_" + edgeId));
    if (edge) {
      edge.classList.add(className);
      const path = edge.querySelector(".issue-edge-path");
      if (path) path.setAttribute("marker-end", "url(#issue-arrow-selected)");
    }
    const halo = els.output.querySelector("#" + cssEscape("edge_halo_" + edgeId));
    if (halo) halo.classList.add(className);
  }

  function clearHoverHighlights() {
    if (!els.output) return;
    els.output.querySelectorAll(".issue-map-hover, .issue-map-hover-related").forEach(function (item) {
      resetEdgeMarker(item);
      item.classList.remove("issue-map-hover", "issue-map-hover-related");
    });
    markSelection();
  }

  function showHoverTooltip(html, anchor) {
    const tooltip = ensureHoverTooltip();
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    positionHoverTooltip(tooltip, anchor);
  }

  function ensureHoverTooltip() {
    if (hoverTooltip) return hoverTooltip;
    hoverTooltip = document.createElement("div");
    hoverTooltip.className = "issue-map-tooltip";
    hoverTooltip.setAttribute("role", "tooltip");
    hoverTooltip.addEventListener("mouseenter", cancelHoverTooltipHide);
    hoverTooltip.addEventListener("mouseleave", scheduleHideHoverTooltip);
    hoverTooltip.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    document.body.appendChild(hoverTooltip);
    return hoverTooltip;
  }

  function scheduleHideHoverTooltip() {
    cancelHoverTooltipHide();
    hoverTooltipHideTimer = window.setTimeout(hideHoverTooltip, HOVER_TOOLTIP_HIDE_DELAY_MS);
  }

  function cancelHoverTooltipHide() {
    if (!hoverTooltipHideTimer) return;
    window.clearTimeout(hoverTooltipHideTimer);
    hoverTooltipHideTimer = null;
  }

  function hideHoverTooltip() {
    cancelHoverTooltipHide();
    clearHoverHighlights();
    if (!hoverTooltip) return;
    hoverTooltip.remove();
    hoverTooltip = null;
  }

  function getTooltipAnchor(group, event, type) {
    const rect = group.getBoundingClientRect();
    if (type === "edge" && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      return {
        type: "point",
        x: event.clientX,
        y: event.clientY,
        rect: rect
      };
    }
    return {
      type: "rect",
      rect: rect
    };
  }

  function positionHoverTooltip(tooltip, anchor) {
    const margin = 12;
    const pointOffset = 12;
    const rectOverlap = 3;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    let x;
    let y;

    if (anchor.type === "point") {
      x = anchor.x + pointOffset;
      y = anchor.y + pointOffset;
      if (x + width > window.innerWidth - margin) x = anchor.x - width - pointOffset;
      if (y + height > window.innerHeight - margin) y = anchor.y - height - pointOffset;
    } else {
      const rect = anchor.rect;
      const rightX = rect.right - rectOverlap;
      const leftX = rect.left - width + rectOverlap;
      const canPlaceRight = rightX + width <= window.innerWidth - margin;
      const canPlaceLeft = leftX >= margin;
      x = canPlaceRight || !canPlaceLeft ? rightX : leftX;
      y = rect.top;
      if (!canPlaceRight && !canPlaceLeft) {
        x = rect.left;
      }
    }

    x = clamp(x, margin, Math.max(margin, window.innerWidth - width - margin));
    y = clamp(y, margin, Math.max(margin, window.innerHeight - height - margin));
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }

  function buildNodeHoverTooltipHtml(node) {
    const evidenceItems = getNodeEvidenceItems(node);
    return [
      '<div class="issue-map-tooltip-kicker">ノード ' + escapeHtml(compactNodeTag(node.id)) + "</div>",
      '<div class="issue-map-tooltip-title">' + escapeHtml(node.label || node.id) + "</div>",
      '<div class="issue-map-tooltip-meta">' + escapeHtml([
        TYPE_LABELS[node.type] || node.type || "",
        LAYER_LABELS[node.layer] || node.layer || "",
        STATUS_LABELS[node.status] || node.status || ""
      ].filter(Boolean).join(" / ")) + "</div>",
      '<div class="issue-map-tooltip-section-title">エビデンス</div>',
      evidenceItems.length > 0
        ? evidenceItems.map(buildTooltipEvidenceHtml).join("")
        : '<div class="issue-map-tooltip-empty">紐づくエビデンスはありません。</div>'
    ].join("");
  }

  function buildEdgeHoverTooltipHtml(edge) {
    const from = findNode(edge.from);
    const to = findNode(edge.to);
    const fromLabel = from && from.label ? from.label : edge.from;
    const toLabel = to && to.label ? to.label : edge.to;
    return [
      '<div class="issue-map-tooltip-kicker">矢印 ' + escapeHtml(compactEdgeTag(edge.id)) + "</div>",
      '<div class="issue-map-tooltip-title">' + escapeHtml(compactNodeTag(edge.from) + " -> " + compactNodeTag(edge.to) + polarityLabel(edge.polarity)) + "</div>",
      '<div class="issue-map-tooltip-meta">' + escapeHtml(shortLabel(fromLabel, 28) + " -> " + shortLabel(toLabel, 28)) + "</div>",
      '<div class="issue-map-tooltip-section-title">rationale</div>',
      '<div class="issue-map-tooltip-body">' + escapeHtml(edge.rationale || "rationale は未入力です。") + "</div>",
      '<div class="issue-map-tooltip-meta">' + escapeHtml("confidence: " + (edge.confidence || "medium")) + "</div>"
    ].join("");
  }

  function getNodeEvidenceItems(node) {
    const evidenceById = indexById(IssueMapState.data.evidence || []);
    return (node.evidenceIds || [])
      .map(function (id) { return evidenceById[id]; })
      .filter(Boolean);
  }

  function buildTooltipEvidenceHtml(evidence) {
    return [
      '<div class="issue-map-tooltip-evidence">',
      '<div class="issue-map-tooltip-evidence-title">' + escapeHtml(evidence.id + " " + (evidence.title || "")) + "</div>",
      buildEvidenceUrlHtml(evidence.url),
      evidence.note ? '<div class="issue-map-tooltip-evidence-note">' + escapeHtml(evidence.note) + "</div>" : "",
      "</div>"
    ].join("");
  }

  function renderInspector() {
    if (!IssueMapState.data) {
      els.inspector.innerHTML = '<div class="issue-help-text">JSONを描画すると編集できます。</div>';
      updateSelectionLabel();
      return;
    }

    if (!IssueMapState.selected) {
      els.inspector.innerHTML = '<div class="issue-help-text">ノードまたは関係線を選択してください。</div>';
      updateSelectionLabel();
      return;
    }

    if (IssueMapState.selected.type === "newNode") {
      renderNewNodeForm();
      updateSelectionLabel();
      return;
    }

    if (IssueMapState.selected.type === "newEdge") {
      renderNewEdgeForm();
      updateSelectionLabel();
      return;
    }

    if (IssueMapState.selected.type === "node") {
      const node = findNode(IssueMapState.selected.id);
      if (!node) {
        els.inspector.innerHTML = '<div class="issue-help-text">選択中のノードが見つかりません。</div>';
        return;
      }
      renderNodeForm(node);
      updateSelectionLabel();
      return;
    }

    if (IssueMapState.selected.type === "edge") {
      const edge = findEdge(IssueMapState.selected.id);
      if (!edge) {
        els.inspector.innerHTML = '<div class="issue-help-text">選択中の関係線が見つかりません。</div>';
        return;
      }
      renderEdgeForm(edge);
      updateSelectionLabel();
    }
  }

  function renderNodeForm(node) {
    els.inspector.innerHTML = [
      '<form id="issueNodeForm" class="issue-form-grid">',
      formRow("ラベル", '<textarea id="nodeLabelInput" rows="3">' + escapeHtml(node.label || "") + "</textarea>"),
      '<div class="issue-form-two">',
      formRow("種別", selectHtml("nodeTypeInput", NODE_TYPES, node.type, TYPE_LABELS)),
      formRow("観点", perspectiveSelectHtml("nodePerspectiveInput", node.perspective)),
      "</div>",
      '<div class="issue-form-two">',
      formRow("レイヤー", selectHtml("nodeLayerInput", NODE_LAYERS, node.layer, LAYER_LABELS)),
      formRow("状態", selectHtml("nodeStatusInput", NODE_STATUSES, node.status, STATUS_LABELS)),
      "</div>",
      formRow("根拠ID", '<input id="nodeEvidenceInput" value="' + escapeAttribute((node.evidenceIds || []).join(", ")) + '">'),
      '<div class="issue-form-actions">',
      '<button class="primary" type="submit">更新</button>',
      '<button id="deleteIssueNodeButton" class="danger" type="button">削除</button>',
      "</div>",
      "</form>"
    ].join("");

    document.getElementById("issueNodeForm").addEventListener("submit", function (event) {
      event.preventDefault();
      node.label = document.getElementById("nodeLabelInput").value.trim() || node.id;
      node.type = document.getElementById("nodeTypeInput").value;
      node.perspective = document.getElementById("nodePerspectiveInput").value;
      node.layer = document.getElementById("nodeLayerInput").value;
      node.status = document.getElementById("nodeStatusInput").value;
      node.evidenceIds = splitIds(document.getElementById("nodeEvidenceInput").value);
      syncAndRender("ノード更新");
    });

    document.getElementById("deleteIssueNodeButton").addEventListener("click", function () {
      if (!window.confirm("このノードを削除しますか。関係線からも削除されます。")) return;
      deleteNode(node.id);
      IssueMapState.selected = null;
      syncAndRender("ノード削除");
    });
  }

  function renderEdgeForm(edge) {
    els.inspector.innerHTML = [
      '<form id="issueEdgeForm" class="issue-form-grid">',
      '<div class="issue-form-two">',
      formRow("原因", nodeSelectHtml("edgeFromInput", edge.from)),
      formRow("結果", nodeSelectHtml("edgeToInput", edge.to)),
      "</div>",
      '<div class="issue-form-two">',
      formRow("極性", selectHtml("edgePolarityInput", EDGE_POLARITIES, edge.polarity, { "+": "+", "-": "-", unknown: "不明" })),
      formRow("信頼度", selectHtml("edgeConfidenceInput", EDGE_CONFIDENCES, edge.confidence, { high: "高", medium: "中", low: "低" })),
      "</div>",
      formRow("理由", '<textarea id="edgeRationaleInput" rows="4">' + escapeHtml(edge.rationale || "") + "</textarea>"),
      '<div class="issue-form-actions">',
      '<button class="primary" type="submit">更新</button>',
      '<button id="deleteIssueEdgeButton" class="danger" type="button">削除</button>',
      "</div>",
      "</form>"
    ].join("");

    document.getElementById("issueEdgeForm").addEventListener("submit", function (event) {
      event.preventDefault();
      const from = document.getElementById("edgeFromInput").value;
      const to = document.getElementById("edgeToInput").value;
      if (from === to) {
        setStatus("同一ノード不可");
        return;
      }
      edge.from = from;
      edge.to = to;
      edge.relation = "causes";
      edge.polarity = document.getElementById("edgePolarityInput").value;
      edge.confidence = document.getElementById("edgeConfidenceInput").value;
      edge.rationale = document.getElementById("edgeRationaleInput").value.trim();
      syncAndRender("関係更新");
    });

    document.getElementById("deleteIssueEdgeButton").addEventListener("click", function () {
      if (!window.confirm("この関係線を削除しますか。")) return;
      deleteEdge(edge.id);
      IssueMapState.selected = null;
      syncAndRender("関係削除");
    });
  }

  function renderNewNodeForm() {
    const defaultPerspective = IssueMapState.data.perspectives[0] ? IssueMapState.data.perspectives[0].id : "";
    els.inspector.innerHTML = [
      '<form id="newIssueNodeForm" class="issue-form-grid">',
      formRow("ラベル", '<textarea id="newNodeLabelInput" rows="3"></textarea>'),
      '<div class="issue-form-two">',
      formRow("種別", selectHtml("newNodeTypeInput", NODE_TYPES, "issue", TYPE_LABELS)),
      formRow("観点", perspectiveSelectHtml("newNodePerspectiveInput", defaultPerspective)),
      "</div>",
      '<div class="issue-form-two">',
      formRow("レイヤー", selectHtml("newNodeLayerInput", NODE_LAYERS, "structure", LAYER_LABELS)),
      formRow("状態", selectHtml("newNodeStatusInput", NODE_STATUSES, "hypothesis", STATUS_LABELS)),
      "</div>",
      formRow("根拠ID", '<input id="newNodeEvidenceInput">'),
      '<div class="issue-form-actions">',
      '<button class="primary" type="submit">追加</button>',
      "</div>",
      "</form>"
    ].join("");

    document.getElementById("newIssueNodeForm").addEventListener("submit", function (event) {
      event.preventDefault();
      const id = nextId("n", IssueMapState.data.nodes);
      const label = document.getElementById("newNodeLabelInput").value.trim();
      if (!label) {
        setStatus("ラベル必須");
        return;
      }
      IssueMapState.data.nodes.push({
        id: id,
        label: label,
        type: document.getElementById("newNodeTypeInput").value,
        perspective: document.getElementById("newNodePerspectiveInput").value,
        layer: document.getElementById("newNodeLayerInput").value,
        status: document.getElementById("newNodeStatusInput").value,
        evidenceIds: splitIds(document.getElementById("newNodeEvidenceInput").value)
      });
      IssueMapState.selected = { type: "node", id: id };
      syncAndRender("ノード追加");
    });
  }

  function renderNewEdgeForm() {
    els.inspector.innerHTML = [
      '<form id="newIssueEdgeForm" class="issue-form-grid">',
      '<div class="issue-form-two">',
      formRow("原因", nodeSelectHtml("newEdgeFromInput", "")),
      formRow("結果", nodeSelectHtml("newEdgeToInput", "")),
      "</div>",
      '<div class="issue-form-two">',
      formRow("極性", selectHtml("newEdgePolarityInput", EDGE_POLARITIES, "+", { "+": "+", "-": "-", unknown: "不明" })),
      formRow("信頼度", selectHtml("newEdgeConfidenceInput", EDGE_CONFIDENCES, "medium", { high: "高", medium: "中", low: "低" })),
      "</div>",
      formRow("理由", '<textarea id="newEdgeRationaleInput" rows="4"></textarea>'),
      '<div class="issue-form-actions">',
      '<button class="primary" type="submit">追加</button>',
      "</div>",
      "</form>"
    ].join("");

    document.getElementById("newIssueEdgeForm").addEventListener("submit", function (event) {
      event.preventDefault();
      const from = document.getElementById("newEdgeFromInput").value;
      const to = document.getElementById("newEdgeToInput").value;
      if (!from || !to || from === to) {
        setStatus("原因と結果を確認");
        return;
      }
      const id = nextId("e", IssueMapState.data.edges);
      IssueMapState.data.edges.push({
        id: id,
        from: from,
        to: to,
        relation: "causes",
        polarity: document.getElementById("newEdgePolarityInput").value,
        confidence: document.getElementById("newEdgeConfidenceInput").value,
        rationale: document.getElementById("newEdgeRationaleInput").value.trim()
      });
      IssueMapState.selected = { type: "edge", id: id };
      syncAndRender("関係追加");
    });
  }

  function renderRelationList() {
    if (!els.relationList) return;
    if (!IssueMapState.data || IssueMapState.data.edges.length === 0) {
      els.relationList.innerHTML = '<div class="issue-help-text">関係なし</div>';
      return;
    }

    const nodeById = indexById(IssueMapState.data.nodes);
    els.relationList.innerHTML = IssueMapState.data.edges.map(function (edge) {
      const from = nodeById[edge.from];
      const to = nodeById[edge.to];
      const active = IssueMapState.selected && IssueMapState.selected.type === "edge" && IssueMapState.selected.id === edge.id ? " active" : "";
      const confidence = edge.confidence === "high" ? "高" : edge.confidence === "low" ? "低" : "中";
      return [
        '<button type="button" class="issue-relation-button' + active + '" data-edge-id="' + escapeAttribute(edge.id) + '">',
        '<span class="issue-relation-id">' + escapeHtml(compactEdgeTag(edge.id)) + "</span>",
        '<span class="issue-relation-main">' + escapeHtml(compactNodeTag(edge.from) + " -> " + compactNodeTag(edge.to) + polarityLabel(edge.polarity)) + "</span>",
        '<span class="issue-relation-confidence">' + escapeHtml(confidence) + "</span>",
        '<span class="issue-relation-label">' + escapeHtml(shortLabel(from && from.label, 11) + " -> " + shortLabel(to && to.label, 11)) + "</span>",
        "</button>"
      ].join("");
    }).join("");

    els.relationList.querySelectorAll("button[data-edge-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        IssueMapState.selected = { type: "edge", id: button.getAttribute("data-edge-id") };
        renderIssueMap();
      });
    });
  }

  function renderEvidenceList() {
    if (!IssueMapState.data || IssueMapState.data.evidence.length === 0) {
      els.evidenceList.innerHTML = '<div class="issue-help-text">根拠なし</div>';
      return;
    }

    const relatedIds = new Set();
    if (IssueMapState.selected && IssueMapState.selected.type === "node") {
      const node = findNode(IssueMapState.selected.id);
      (node && node.evidenceIds || []).forEach(function (id) { relatedIds.add(id); });
    }

    els.evidenceList.innerHTML = IssueMapState.data.evidence.map(function (evidence) {
      const relatedStyle = relatedIds.has(evidence.id) ? ' style="border-color: var(--issue-accent);"' : "";
      const url = buildEvidenceUrlHtml(evidence.url);
      return [
        '<div class="issue-evidence-item"' + relatedStyle + '>',
        '<div class="issue-evidence-title">' + escapeHtml(evidence.id + " " + (evidence.title || "")) + "</div>",
        url,
        '<div class="issue-evidence-note">' + escapeHtml(evidence.note || "") + "</div>",
        "</div>"
      ].join("");
    }).join("");
  }

  function buildEvidenceUrlHtml(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    const safeUrl = safeExternalUrl(value);
    if (!safeUrl) {
      return '<div class="issue-evidence-note">' + escapeHtml(value) + "</div>";
    }
    return [
      '<div class="issue-evidence-note">',
      '<a class="issue-evidence-link" href="' + escapeAttribute(safeUrl) + '" target="_blank" rel="noopener noreferrer">',
      escapeHtml(value),
      "</a>",
      "</div>"
    ].join("");
  }

  function safeExternalUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.href;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function updateSelectionLabel() {
    if (!IssueMapState.selected) {
      els.selectionLabel.textContent = "";
      return;
    }
    if (IssueMapState.selected.type === "newNode") {
      els.selectionLabel.textContent = "新規ノード";
      return;
    }
    if (IssueMapState.selected.type === "newEdge") {
      els.selectionLabel.textContent = "新規関係";
      return;
    }
    els.selectionLabel.textContent = IssueMapState.selected.type + " " + IssueMapState.selected.id;
  }

  function updateMeta() {
    if (!IssueMapState.data) {
      els.meta.textContent = "";
      return;
    }
    els.meta.textContent = [
      IssueMapState.data.nodes.length + " nodes",
      IssueMapState.data.edges.length + " edges"
    ].join(" / ");
  }

  function showValidation(validation) {
    const errors = validation.errors || [];
    const warnings = validation.warnings || [];
    if (errors.length === 0 && warnings.length === 0) {
      els.validation.innerHTML = "検証OK";
      return;
    }

    const parts = [];
    if (errors.length > 0) {
      parts.push('<div class="error">エラー</div><ul>' + errors.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join("") + "</ul>");
    }
    if (warnings.length > 0) {
      parts.push('<div class="warning">警告</div><ul>' + warnings.map(function (item) {
        return "<li>" + escapeHtml(item) + "</li>";
      }).join("") + "</ul>");
    }
    els.validation.innerHTML = parts.join("");
  }

  function clearValidation() {
    els.validation.textContent = "";
  }

  function syncAndRender(status) {
    syncDataToInput();
    showValidation(validateIssueMap(IssueMapState.data));
    renderIssueMap();
    setStatus(status);
  }

  function syncDataToInput() {
    if (!IssueMapState.data) return;
    els.input.value = JSON.stringify(IssueMapState.data, null, 2);
  }

  function saveIssueMapJson() {
    const data = currentDataFromStateOrInput();
    if (!data) {
      setStatus("保存対象なし");
      return;
    }
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "issue_map.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("保存");
  }

  function saveIssueMapSvg() {
    const svg = els.output.querySelector("svg");
    if (!svg) {
      setStatus("SVGなし");
      return;
    }
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", "13.333in");
    clone.setAttribute("height", "7.5in");
    const content = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    const blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "issue_map_16x9.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("SVG保存");
  }

  function copyIssueMapJson() {
    const data = currentDataFromStateOrInput();
    if (!data) {
      setStatus("コピー対象なし");
      return;
    }
    copyText(JSON.stringify(data, null, 2), function () {
      setStatus("JSONコピー");
    });
  }

  function copyCorrectionPrompt() {
    const data = currentDataFromStateOrInput();
    if (!data) {
      setStatus("修正対象なし");
      return;
    }
    const instructions = els.correctionInstructions.value.trim() || "課題の粒度、因果関係、根拠の扱いを見直してください。";
    const prompt = [
      "以下の課題構造マップJSONを修正してください。",
      "修正要望:",
      instructions,
      "",
      "出力は差分ではなく、修正後の完全なJSONのみとしてください。",
      "",
      JSON.stringify(data, null, 2)
    ].join("\n");
    copyText(prompt, function () {
      setStatus("AI修正用コピー");
    });
  }

  function currentDataFromStateOrInput() {
    if (IssueMapState.data) return IssueMapState.data;
    try {
      const parseResult = parseIssueMapInput(els.input.value);
      return normalizeIssueMap(parseResult.data, parseResult.warnings.slice());
    } catch (error) {
      return null;
    }
  }

  function handleFileLoad(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      els.input.value = loadEvent.target.result;
      renderFromInput();
    };
    reader.readAsText(file);
  }

  function deleteNode(nodeId) {
    IssueMapState.data.nodes = IssueMapState.data.nodes.filter(function (node) {
      return node.id !== nodeId;
    });
    IssueMapState.data.edges = IssueMapState.data.edges.filter(function (edge) {
      return edge.from !== nodeId && edge.to !== nodeId;
    });
  }

  function deleteEdge(edgeId) {
    IssueMapState.data.edges = IssueMapState.data.edges.filter(function (edge) {
      return edge.id !== edgeId;
    });
  }

  function showEmptyGraph() {
    hideHoverTooltip();
    els.output.innerHTML = '<div class="issue-map-empty">JSON未描画</div>';
  }

  function setStatus(message) {
    els.status.textContent = message || "";
  }

  function formRow(label, controlHtml) {
    return '<div class="issue-form-row"><label>' + escapeHtml(label) + "</label>" + controlHtml + "</div>";
  }

  function selectHtml(id, values, selected, labels) {
    return '<select id="' + escapeAttribute(id) + '">' + values.map(function (value) {
      const label = labels && labels[value] ? labels[value] : value;
      const isSelected = value === selected ? " selected" : "";
      return '<option value="' + escapeAttribute(value) + '"' + isSelected + ">" + escapeHtml(label) + "</option>";
    }).join("") + "</select>";
  }

  function perspectiveSelectHtml(id, selected) {
    return '<select id="' + escapeAttribute(id) + '">' + IssueMapState.data.perspectives.map(function (perspective) {
      const isSelected = perspective.id === selected ? " selected" : "";
      return '<option value="' + escapeAttribute(perspective.id) + '"' + isSelected + ">" + escapeHtml(perspective.label || perspective.id) + "</option>";
    }).join("") + "</select>";
  }

  function nodeSelectHtml(id, selected) {
    return '<select id="' + escapeAttribute(id) + '">' + IssueMapState.data.nodes.map(function (node) {
      const isSelected = node.id === selected ? " selected" : "";
      return '<option value="' + escapeAttribute(node.id) + '"' + isSelected + ">" + escapeHtml(node.id + " " + node.label) + "</option>";
    }).join("") + "</select>";
  }

  function findNode(id) {
    return IssueMapState.data.nodes.find(function (node) {
      return node.id === id;
    });
  }

  function findEdge(id) {
    return IssueMapState.data.edges.find(function (edge) {
      return edge.id === id;
    });
  }

  function splitIds(value) {
    return String(value || "")
      .split(",")
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function nextId(prefix, items) {
    let max = 0;
    const pattern = new RegExp("^" + prefix + "(\\d+)$");
    items.forEach(function (item) {
      const match = String(item.id || "").match(pattern);
      if (match) max = Math.max(max, Number(match[1]));
    });
    return prefix + String(max + 1).padStart(3, "0");
  }

  function indexById(items) {
    return items.reduce(function (acc, item) {
      acc[item.id] = item;
      return acc;
    }, {});
  }

  function wrapLabel(value, limit) {
    const chars = Array.from(String(value || "").replace(/\r\n|\r/g, "\n"));
    const lines = [];
    let current = "";
    chars.forEach(function (char) {
      if (char === "\n") {
        if (current) lines.push(current);
        current = "";
        return;
      }
      current += char;
      if (Array.from(current).length >= limit) {
        lines.push(current);
        current = "";
      }
    });
    if (current) lines.push(current);
    return lines.join("\n");
  }

  function wrapLabelForSvg(value, limit, maxLines) {
    const text = String(value || "").replace(/\r\n|\r/g, "\n");
    const manualLines = text.split("\n").flatMap(function (line) {
      const chars = Array.from(line);
      const result = [];
      let current = "";
      chars.forEach(function (char) {
        current += char;
        if (Array.from(current).length >= limit) {
          result.push(current);
          current = "";
        }
      });
      if (current) result.push(current);
      return result.length > 0 ? result : [""];
    });
    if (manualLines.length <= maxLines) return manualLines;
    const clipped = manualLines.slice(0, maxLines);
    clipped[maxLines - 1] = clipped[maxLines - 1].replace(/…?$/, "") + "…";
    return clipped;
  }

  function wrapLabelForNode(value, options) {
    const width = Number(options.width) || ELK_MAP.nodeWidth;
    const fontSize = Number(options.fontSize) || ELK_MAP.labelFontSize;
    const paddingX = Number(options.paddingX) || ELK_MAP.labelPaddingX;
    const maxLines = Number(options.maxLines) || ELK_MAP.labelMaxLines;
    const maxUnits = Math.max(4.5, (width - paddingX * 2) / (fontSize * 0.92));
    const text = String(value || "").replace(/\r\n|\r/g, "\n");
    const manualLines = text.split("\n").flatMap(function (line) {
      const result = [];
      let current = "";
      let currentUnits = 0;
      Array.from(line).forEach(function (char) {
        const units = characterWidthUnits(char);
        if (current && currentUnits + units > maxUnits) {
          result.push(current);
          current = "";
          currentUnits = 0;
        }
        current += char;
        currentUnits += units;
      });
      if (current) result.push(current);
      return result.length > 0 ? result : [""];
    });
    if (manualLines.length <= maxLines) return manualLines;
    const clipped = manualLines.slice(0, maxLines);
    clipped[maxLines - 1] = clipped[maxLines - 1].replace(/…?$/, "") + "…";
    return clipped;
  }

  function characterWidthUnits(char) {
    if (/[\u0000-\u007f]/.test(char)) return /\s/.test(char) ? 0.35 : 0.58;
    if (/[\uff61-\uff9f]/.test(char)) return 0.68;
    return 1;
  }

  function compactEdgeTag(edgeId) {
    const match = String(edgeId || "").match(/(\d+)$/);
    if (!match) return String(edgeId || "");
    return "E" + String(Number(match[1])).padStart(2, "0");
  }

  function compactNodeTag(nodeId) {
    const match = String(nodeId || "").match(/(\d+)$/);
    if (!match) return String(nodeId || "").slice(0, 5).toUpperCase();
    return "N" + String(Number(match[1])).padStart(3, "0");
  }

  function polarityLabel(polarity) {
    if (polarity === "-") return " -";
    if (polarity === "unknown") return " ?";
    return " +";
  }

  function shortLabel(value, maxLength) {
    const chars = Array.from(String(value || ""));
    if (chars.length <= maxLength) return chars.join("");
    return chars.slice(0, Math.max(1, maxLength - 1)).join("") + "…";
  }

  function svgElement(name, attrs) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.keys(attrs || {}).forEach(function (key) {
      const value = attrs[key];
      if (value !== "" && value != null) {
        element.setAttribute(key, value);
      }
    });
    return element;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function dotEscape(value) {
    return String(value == null ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  function quoteId(value) {
    return '"' + dotEscape(value) + '"';
  }

  function sanitizeDotId(value) {
    return String(value || "x").replace(/[^A-Za-z0-9_]/g, "_");
  }

  function normalizeColor(value, fallback) {
    return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : fallback;
  }

  function mixWithWhite(hex, ratio) {
    const color = normalizeColor(hex, "#7d8790").replace("#", "");
    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);
    const mix = function (component) {
      return Math.round(component * (1 - ratio) + 255 * ratio);
    };
    return "#" + [mix(r), mix(g), mix(b)].map(function (component) {
      return component.toString(16).padStart(2, "0");
    }).join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^A-Za-z0-9_-]/g, "\\$&");
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function copyText(text, onSuccess) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(function () {
        fallbackCopyText(text, onSuccess);
      });
      return;
    }
    fallbackCopyText(text, onSuccess);
  }

  function fallbackCopyText(text, onSuccess) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    onSuccess();
  }
})();
