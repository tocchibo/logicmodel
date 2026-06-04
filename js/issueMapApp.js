(function () {
  "use strict";

  const SCHEMA_VERSION = "issue-map/v1";
  const NODE_TYPES = ["issue", "structural_factor", "assumption", "external_factor", "mental_model"];
  const NODE_LAYERS = ["event", "pattern", "structure", "mental_model"];
  const NODE_STATUSES = ["hypothesis", "supported", "needs_review"];
  const EDGE_POLARITIES = ["+", "-", "unknown"];
  const EDGE_CONFIDENCES = ["high", "medium", "low"];
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
    nodeWidth: 138,
    minNodeHeight: 48
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
    activeLoopId: null,
    visiblePerspectives: new Set(),
    edgeDisplayMode: "all"
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", initIssueMapApp);

  function initIssueMapApp() {
    cacheElements();
    bindEvents();
    showEmptyGraph();
    renderInspector();
    loadSampleIssueMap();
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
    els.loopList = document.getElementById("issueLoopList");
    els.evidenceList = document.getElementById("issueEvidenceList");
    els.correctionInstructions = document.getElementById("issueCorrectionInstructions");
    els.fileInput = document.getElementById("issueMapFileInput");
  }

  function bindEvents() {
    document.getElementById("loadSampleButton").addEventListener("click", loadSampleIssueMap);
    document.getElementById("renderIssueMapButton").addEventListener("click", renderFromInput);
    document.getElementById("saveIssueMapButton").addEventListener("click", saveIssueMapJson);
    document.getElementById("saveIssueMapSvgButton").addEventListener("click", saveIssueMapSvg);
    document.getElementById("loadIssueMapButton").addEventListener("click", function () {
      els.fileInput.value = "";
      els.fileInput.click();
    });
    document.getElementById("copyIssueMapButton").addEventListener("click", copyIssueMapJson);
    document.getElementById("copyIssueCorrectionButton").addEventListener("click", copyCorrectionPrompt);
    document.getElementById("issueEdgeDisplayMode").addEventListener("change", function (event) {
      IssueMapState.edgeDisplayMode = event.target.value;
      if (IssueMapState.edgeDisplayMode === "loops" && IssueMapState.data && !IssueMapState.activeLoopId && IssueMapState.data.loops[0]) {
        IssueMapState.activeLoopId = IssueMapState.data.loops[0].id;
      }
      renderIssueMap();
    });
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
      IssueMapState.activeLoopId = null;
      renderIssueMap();
    });
    els.fileInput.addEventListener("change", handleFileLoad);
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

  async function renderFromInput() {
    const raw = els.input.value.trim();
    if (!raw) {
      IssueMapState.data = null;
      IssueMapState.selected = null;
      IssueMapState.activeLoopId = null;
      showEmptyGraph();
      showValidation({ errors: [], warnings: [] });
      renderInspector();
      renderRelationList();
      renderLoopList();
      renderEvidenceList();
      updateMeta();
      updateSelectionLabel();
      setStatus("未入力");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      showValidation({ errors: ["JSONをパースできません: " + error.message], warnings: [] });
      setStatus("JSONエラー");
      return;
    }

    const validation = validateIssueMap(parsed);
    showValidation(validation);
    if (validation.errors.length > 0) {
      setStatus("検証エラー");
      return;
    }

    IssueMapState.data = normalizeIssueMap(parsed);
    ensurePerspectiveFilters(IssueMapState.data);
    IssueMapState.activeLoopId = IssueMapState.edgeDisplayMode === "loops" && IssueMapState.data.loops[0]
      ? IssueMapState.data.loops[0].id
      : null;
    await renderIssueMap();
    setStatus(validation.warnings.length > 0 ? "警告あり" : "表示中");
  }

  async function renderIssueMap() {
    if (!IssueMapState.data) {
      showEmptyGraph();
      return;
    }

    updateMeta();
    renderFilterBar();
    renderRelationList();
    renderLoopList();
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
      markLoop();
    } catch (error) {
      els.output.innerHTML = '<div class="issue-map-empty">描画エラー</div>';
      showValidation({ errors: ["SVG描画に失敗しました: " + error.message], warnings: [] });
      setStatus("描画エラー");
    }
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
    if (!Array.isArray(data.loops)) errors.push("loops は配列にしてください。");
    if (!Array.isArray(data.evidence)) errors.push("evidence は配列にしてください。");
    if (errors.length > 0) return { errors, warnings };

    const perspectiveIds = collectIds(data.perspectives, "perspective", errors);
    const nodeIds = collectIds(data.nodes, "node", errors);
    const edgeIds = collectIds(data.edges, "edge", errors);
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
      if (edge.from === edge.to) warnings.push("自己ループがあります: " + edge.id);
      if (edge.relation !== "causes") warnings.push("relation は causes が推奨です: " + edge.id);
      if (!EDGE_POLARITIES.includes(edge.polarity)) errors.push("未対応の polarity: " + edge.id + " / " + edge.polarity);
      if (!EDGE_CONFIDENCES.includes(edge.confidence)) errors.push("未対応の confidence: " + edge.id + " / " + edge.confidence);
    });

    data.loops.forEach(function (loop) {
      if (!Array.isArray(loop.edgeIds)) {
        errors.push("loop.edgeIds は配列にしてください: " + loop.id);
        return;
      }
      loop.edgeIds.forEach(function (edgeId) {
        if (!edgeIds.has(edgeId)) errors.push("loop.edgeIds が存在しません: " + loop.id + " / " + edgeId);
      });
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

  function normalizeIssueMap(data) {
    const normalized = JSON.parse(JSON.stringify(data));
    normalized.scope = normalized.scope || {};
    normalized.perspectives = normalized.perspectives || [];
    normalized.nodes = normalized.nodes || [];
    normalized.edges = normalized.edges || [];
    normalized.loops = normalized.loops || [];
    normalized.evidence = normalized.evidence || [];
    normalized.layout = normalized.layout || { engine: "auto", positions: {}, pinnedNodeIds: [] };
    normalized.layout.engine = normalized.layout.engine || "auto";
    normalized.layout.positions = normalized.layout.positions || {};
    normalized.layout.pinnedNodeIds = normalized.layout.pinnedNodeIds || [];
    return normalized;
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
      loops: [],
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
    const style = edge.confidence === "low" || edge.polarity === "unknown" ? "dashed" : "solid";
    const penWidth = edge.confidence === "high" ? "1.8" : "1.2";
    const polarityLabel = edge.polarity === "unknown" ? "?" : edge.polarity;
    return [
      'id="' + dotEscape("edge_" + edge.id) + '"',
      'label="' + dotEscape(polarityLabel) + '"',
      'tooltip="' + dotEscape(edge.rationale || edge.id) + '"',
      'color="' + color + '"',
      'fontcolor="' + color + '"',
      'style="' + style + '"',
      "penwidth=" + penWidth
    ];
  }

  function nodeFillColor(node, perspectiveColor) {
    if (node.type === "assumption") return "#f0f1ed";
    if (node.type === "external_factor") return "#eef7fb";
    if (node.type === "mental_model") return "#fff4e9";
    if (node.type === "structural_factor") return mixWithWhite(perspectiveColor, 0.78);
    if (node.status === "needs_review") return "#fff8df";
    return "#ffffff";
  }

  function edgeColor(edge, perspective) {
    if (edge.polarity === "-") return "#b36b42";
    if (edge.polarity === "unknown") return "#8b8f93";
    return normalizeColor(perspective && perspective.color, "#3b82a0");
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
          targets: [edge.to],
          labels: [
            {
              text: compactEdgeTag(edge.id) + polarityLabel(edge.polarity),
              width: 36,
              height: 14
            }
          ]
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
    const nodeById = indexById(data.nodes);
    const perspectiveById = indexById(data.perspectives);
    const halosLayer = svgElement("g", { class: "issue-edge-halos" });
    const edgesLayer = svgElement("g", { class: "issue-edges" });
    const isAllMode = IssueMapState.edgeDisplayMode === "all";

    (layout.edges || []).forEach(function (layoutEdge) {
      const edge = edgeById[layoutEdge.id];
      if (!edge) return;
      const section = layoutEdge.sections && layoutEdge.sections[0];
      if (!section) return;
      const points = elkEdgePoints(section);
      const path = pointsToPath(points);
      const sourceNode = nodeById[edge.from];
      const perspective = sourceNode ? perspectiveById[sourceNode.perspective] : null;
      const color = edgeColor(edge, perspective);
      const markerId = edge.polarity === "-" ? "issue-arrow-negative" : edge.polarity === "unknown" ? "issue-arrow-unknown" : "issue-arrow-positive";

      halosLayer.appendChild(svgElement("path", {
        id: "edge_halo_" + edge.id,
        class: "issue-edge-halo",
        d: path,
        fill: "none",
        stroke: "#ffffff",
        "stroke-width": isAllMode ? 4.2 : 5.4,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: 0.8
      }));

      const edgeGroup = svgElement("g", {
        id: "edge_" + edge.id,
        class: "edge"
      });
      edgeGroup.appendChild(svgElement("path", {
        class: "issue-edge-path",
        d: path,
        fill: "none",
        stroke: color,
        "stroke-width": isAllMode ? edge.confidence === "high" ? 1.9 : 1.55 : edge.confidence === "high" ? 2.45 : 2,
        "stroke-dasharray": edge.confidence === "low" || edge.polarity === "unknown" ? "6 5" : "",
        "marker-end": "url(#" + markerId + ")",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: isAllMode ? edge.confidence === "low" ? 0.52 : 0.74 : edge.confidence === "low" ? 0.86 : 0.98
      }));
      appendEdgeMidTag(edgeGroup, {
        edge: edge,
        labelPoint: elkLabelPoint(layoutEdge, points),
        tag: compactEdgeTag(edge.id),
        color: color
      });
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
      appendNodeIdBadge(nodeGroup, node, placement, color);
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
    const lineCount = wrapLabelForSvg(node.label || node.id, 10, 2).length;
    return {
      width: ELK_MAP.nodeWidth,
      height: Math.max(ELK_MAP.minNodeHeight, 24 + lineCount * 16)
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
      { id: "issue-arrow-positive", color: "#2f8f6f" },
      { id: "issue-arrow-negative", color: "#b36b42" },
      { id: "issue-arrow-unknown", color: "#8b8f93" },
      { id: "issue-arrow-selected", color: "#b84a4a" }
    ].forEach(function (marker) {
      const markerNode = svgElement("marker", {
        id: marker.id,
        markerWidth: 12,
        markerHeight: 12,
        refX: 11,
        refY: 6,
        orient: "auto",
        markerUnits: "strokeWidth"
      });
      markerNode.appendChild(svgElement("path", {
        d: "M0,0 L12,6 L0,12 Z",
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
    const isAllMode = IssueMapState.edgeDisplayMode === "all";
    const halosLayer = svgElement("g", { class: "issue-edge-halos" });
    const edgesLayer = svgElement("g", { class: "issue-edges" });

    if (!isAllMode) {
      routedEdges.forEach(function (route) {
        halosLayer.appendChild(svgElement("path", {
          id: "edge_halo_" + route.edge.id,
          class: "issue-edge-halo",
          d: route.path,
          fill: "none",
          stroke: "#ffffff",
          "stroke-width": route.edge.confidence === "high" ? 5.2 : 4.6,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          opacity: 0.76
        }));
      });
    }

    routedEdges.forEach(function (route) {
      const edge = route.edge;
      const edgeGroup = svgElement("g", {
        id: "edge_" + edge.id,
        class: "edge"
      });
      edgeGroup.appendChild(svgElement("path", {
        class: "issue-edge-path",
        d: route.path,
        fill: "none",
        stroke: route.color,
        "stroke-width": isAllMode ? edge.confidence === "high" ? 1.25 : 1 : edge.confidence === "high" ? 2.25 : 1.75,
        "stroke-dasharray": edge.confidence === "low" || edge.polarity === "unknown" ? "6 5" : "",
        "marker-end": "url(#" + route.markerId + ")",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: isAllMode ? edge.confidence === "low" ? 0.35 : 0.46 : edge.confidence === "low" ? 0.82 : 0.96
      }));
      if (!isAllMode && edge.polarity !== "+") {
        const label = svgElement("text", {
          class: "issue-edge-label",
          x: route.labelPoint.x,
          y: route.labelPoint.y - 5,
          "text-anchor": "middle",
          "font-size": 13,
          "font-weight": 700,
          fill: route.color
        });
        label.textContent = edge.polarity === "unknown" ? "?" : edge.polarity;
        edgeGroup.appendChild(label);
      }
      if (isAllMode) {
        appendEdgeMidTag(edgeGroup, route);
      } else {
        appendEdgeEndpointTags(edgeGroup, route);
      }
      edgesLayer.appendChild(edgeGroup);
    });

    if (!isAllMode) svg.appendChild(halosLayer);
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

    if (IssueMapState.edgeDisplayMode === "all") {
      return routeOverviewEdges(visibleEdges);
    }

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
      const color = spec.edge.polarity === "-" ? "#b36b42" : spec.edge.polarity === "unknown" ? "#8b8f93" : "#2f8f6f";
      const markerId = spec.edge.polarity === "-" ? "issue-arrow-negative" : spec.edge.polarity === "unknown" ? "issue-arrow-unknown" : "issue-arrow-positive";
      routes.push({
        edge: spec.edge,
        points: points,
        path: pointsToPath(points),
        labelPoint: routeLabelPoint(points),
        startPoint: points[0],
        endPoint: points[points.length - 1],
        tag: compactEdgeTag(spec.edge.id),
        color: color,
        markerId: markerId
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
      const color = edge.polarity === "-" ? "#b36b42" : edge.polarity === "unknown" ? "#8b8f93" : "#2f8f6f";
      const markerId = edge.polarity === "-" ? "issue-arrow-negative" : edge.polarity === "unknown" ? "issue-arrow-unknown" : "issue-arrow-positive";
      return {
        edge: edge,
        points: [start, control, end],
        path: "M " + start.x + " " + start.y + " Q " + control.x + " " + control.y + " " + end.x + " " + end.y,
        labelPoint: control,
        startPoint: start,
        endPoint: end,
        tag: compactEdgeTag(edge.id),
        color: color,
        markerId: markerId
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
    if (IssueMapState.edgeDisplayMode === "all") {
      return new Set(data.edges.map(function (edge) { return edge.id; }));
    }

    if (IssueMapState.edgeDisplayMode === "selected") {
      if (!IssueMapState.selected) return new Set();
      if (IssueMapState.selected.type === "edge") return new Set([IssueMapState.selected.id]);
      if (IssueMapState.selected.type === "node") {
        return new Set(data.edges
          .filter(function (edge) {
            return edge.from === IssueMapState.selected.id || edge.to === IssueMapState.selected.id;
          })
          .map(function (edge) { return edge.id; }));
      }
      return new Set();
    }

    if (IssueMapState.edgeDisplayMode === "loops") {
      const activeLoop = data.loops.find(function (item) {
        return item.id === IssueMapState.activeLoopId;
      }) || data.loops[0];
      if (activeLoop) return new Set(activeLoop.edgeIds);
      return new Set();
    }

    return new Set();
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
    const lines = wrapLabelForSvg(node.label || node.id, 12, 2);
    const lineHeight = 17;
    const firstY = placement.cy - ((lines.length - 1) * lineHeight) / 2 + 5;
    lines.forEach(function (line, index) {
      const text = svgElement("text", {
        class: "issue-node-label",
        x: placement.cx,
        y: firstY + index * lineHeight,
        "text-anchor": "middle",
        "font-size": lines.length > 1 ? 15.2 : 16.5,
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
      renderIssueMap();
    };
    els.output.querySelectorAll("[id^='node_']").forEach(function (group) {
      const nodeId = group.id.replace(/^node_/, "");
      group.addEventListener("click", function (event) {
        event.stopPropagation();
        selectItem("node", nodeId);
      });
    });
    els.output.querySelectorAll("[id^='edge_']").forEach(function (group) {
      const edgeId = group.id.replace(/^edge_/, "");
      group.addEventListener("click", function (event) {
        event.stopPropagation();
        selectItem("edge", edgeId);
      });
    });
  }

  function selectItem(type, id) {
    IssueMapState.selected = { type: type, id: id };
    if (IssueMapState.edgeDisplayMode === "selected") {
      renderIssueMap();
      return;
    }
    renderInspector();
    renderRelationList();
    renderEvidenceList();
    updateSelectionLabel();
    markSelection();
  }

  function markSelection() {
    els.output.querySelectorAll(".issue-map-selected").forEach(function (item) {
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
    }
  }

  function markLoop() {
    els.output.querySelectorAll(".issue-loop-highlight").forEach(function (item) {
      item.classList.remove("issue-loop-highlight");
    });
    if (!IssueMapState.data || !IssueMapState.activeLoopId) return;
    const loop = IssueMapState.data.loops.find(function (item) {
      return item.id === IssueMapState.activeLoopId;
    });
    if (!loop) return;
    loop.edgeIds.forEach(function (edgeId) {
      const group = els.output.querySelector("#" + cssEscape("edge_" + edgeId));
      if (group) group.classList.add("issue-loop-highlight");
      const halo = els.output.querySelector("#" + cssEscape("edge_halo_" + edgeId));
      if (halo) halo.classList.add("issue-loop-highlight");
    });
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

  function renderLoopList() {
    if (!IssueMapState.data || IssueMapState.data.loops.length === 0) {
      els.loopList.innerHTML = '<div class="issue-help-text">ループなし</div>';
      return;
    }

    els.loopList.innerHTML = IssueMapState.data.loops.map(function (loop) {
      const active = loop.id === IssueMapState.activeLoopId ? " active" : "";
      const type = loop.type === "balancing" ? "バランス" : "強化";
      return [
        '<button type="button" class="issue-loop-button' + active + '" data-loop-id="' + escapeAttribute(loop.id) + '">',
        '<span>' + escapeHtml(loop.label || loop.id) + '</span>',
        '<span class="issue-loop-type">' + type + '</span>',
        "</button>"
      ].join("");
    }).join("");

    els.loopList.querySelectorAll("button[data-loop-id]").forEach(function (button) {
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-loop-id");
        IssueMapState.activeLoopId = id;
        if (IssueMapState.edgeDisplayMode !== "loops") {
          IssueMapState.edgeDisplayMode = "loops";
          const selector = document.getElementById("issueEdgeDisplayMode");
          if (selector) selector.value = "loops";
        }
        renderIssueMap();
      });
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
      const url = evidence.url ? '<div class="issue-evidence-note">' + escapeHtml(evidence.url) + "</div>" : "";
      return [
        '<div class="issue-evidence-item"' + relatedStyle + '>',
        '<div class="issue-evidence-title">' + escapeHtml(evidence.id + " " + (evidence.title || "")) + "</div>",
        url,
        '<div class="issue-evidence-note">' + escapeHtml(evidence.note || "") + "</div>",
        "</div>"
      ].join("");
    }).join("");
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
      IssueMapState.data.edges.length + " edges",
      IssueMapState.data.loops.length + " loops"
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
      return normalizeIssueMap(JSON.parse(els.input.value));
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
    const edgeIds = new Set(IssueMapState.data.edges.map(function (edge) { return edge.id; }));
    IssueMapState.data.loops.forEach(function (loop) {
      loop.edgeIds = loop.edgeIds.filter(function (edgeId) { return edgeIds.has(edgeId); });
    });
    IssueMapState.data.loops = IssueMapState.data.loops.filter(function (loop) {
      return loop.edgeIds.length > 0;
    });
  }

  function deleteEdge(edgeId) {
    IssueMapState.data.edges = IssueMapState.data.edges.filter(function (edge) {
      return edge.id !== edgeId;
    });
    IssueMapState.data.loops.forEach(function (loop) {
      loop.edgeIds = loop.edgeIds.filter(function (id) { return id !== edgeId; });
    });
    IssueMapState.data.loops = IssueMapState.data.loops.filter(function (loop) {
      return loop.edgeIds.length > 0;
    });
  }

  function showEmptyGraph() {
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
