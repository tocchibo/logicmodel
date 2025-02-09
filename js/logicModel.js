/* js/logicModel.js */

// ヘルパー関数：引用符内のカンマを無視して文字列を分割
function splitRespectingQuotes(str, delimiter) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      current += char;
    } else if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    result.push(current.trim());
  }
  return result;
}

function parseCommands(input) {
  const model = {
    title: "",
    elements: {},
    relations: [],
  };

  // セミコロン（;）で各コマンドを分割
  const commands = input
    .split(";")
    .map(cmd => cmd.trim())
    .filter(cmd => cmd.length > 0);

  commands.forEach(cmd => {
    // コマンドタイプを抽出（TITLE, CREATE, RELATE, STEP, COMPLETE）
    const match = cmd.match(/^(\w+)\b(.*)$/);
    if (!match) return;
    const commandType = match[1].toUpperCase();
    const rest = match[2].trim();

    switch (commandType) {
      case "TITLE":
        // TITLE "タイトル"
        const titleMatch = rest.match(/^"(.*)"$/);
        if (titleMatch) {
          model.title = titleMatch[1];
        }
        break;

      case "CREATE":
        // CREATE {element_id} "ラベル", {element_id} "ラベル", ...
        const elementsList = splitRespectingQuotes(rest, ",");
        elementsList.forEach(item => {
          const elementMatch = item.match(/^(\S+)\s+"(.*)"$/);
          if (elementMatch) {
            const id = elementMatch[1];
            const label = elementMatch[2];
            // id の先頭（input, activity, …）からカテゴリーを判定
            const catMatch = id.match(/^(input|activity|output|outcome|impact)/i);
            const category = catMatch ? catMatch[1].toLowerCase() : "unknown";
            model.elements[id] = { id, label, category };
          }
        });
        break;

      case "RELATE":
        // RELATE {element_id1} {element_id2}, {element_id1} {element_id2}, ...
        const relationsList = splitRespectingQuotes(rest, ",");
        relationsList.forEach(item => {
          const tokens = item.trim().split(/\s+/);
          if (tokens.length === 2) {
            model.relations.push({ from: tokens[0], to: tokens[1] });
          }
        });
        break;

      // STEP, COMPLETE などは表示上の補助なので無視
      case "STEP":
      case "COMPLETE":
        break;

      default:
        break;
    }
  });

  return model;
}

function generateDotFromModel(model) {
  const splineType = document.getElementById("splineType").value;
  const edgeType = document.getElementById("edgeType").value;

  let dotData = `digraph G {
    graph [
      fontname="Arial"
      splines="${splineType}"
      rankdir="LR"
      center=true
    ];
    node [
      fontname="Arial"
      shape="box"
      style="filled"
      fillcolor="white"
    ];
    edge [fontname="Arial"${edgeType === "line" ? ", arrowhead=none" : ""}];

    label="${model.title}";
    labelloc="t";
    fontsize=24;

  `;

  const categories = ["input", "activity", "output", "outcome", "impact"];
  categories.forEach(category => {
    dotData += `subgraph cluster_${category} {
      style="filled";
      color="transparent";
      fillcolor="#f5f5f5";
      label="${category}"\n`;

    for (const id in model.elements) {
      const element = model.elements[id];
      if (element.category === category) {
        const label = element.label.split("\\n").join("\\n");
        // ノードに id 属性を付与（例：node_input1）
        dotData += `${id} [label="${label}", id="node_${id}"]\n`;
      }
    }
    dotData += "}\n";
  });

  model.relations.forEach(relation => {
    // エッジにも id 属性を付与（例：edge_input1_activity2）
    dotData += `${relation.from} -> ${relation.to} [id="edge_${relation.from}_${relation.to}"]\n`;
  });

  dotData += "}\n";
  return dotData;
}

async function renderLogicModelFromJSON(model) {
  const dotData = generateDotFromModel(model);
  try {
    const viz = new Viz();
    const svg = await viz.renderSVGElement(dotData);
    svg.style.maxWidth = "100%";
    const output = document.getElementById("output");
    output.innerHTML = "";
    output.appendChild(svg);
    // SVG 内のノード・エッジに対して編集用のイベントハンドラを設定
    attachSvgEventHandlers();
  } catch (error) {
    console.error("Error rendering logic model:", error);
    const output = document.getElementById("output");
    output.innerHTML = '<p style="color: red;">エラーが発生しました</p>';
  }
}
