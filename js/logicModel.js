/* js/logicModel.js */

function splitRespectingQuotes(str, delimiter) {
  const result = [];
  let current = "";
  let insideQuotes = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && !escaped) {
      insideQuotes = !insideQuotes;
      current += char;
    } else if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
    escaped = char === "\\" && insideQuotes && !escaped;
  }
  if (current.trim().length > 0) {
    result.push(current.trim());
  }
  return result;
}

const COMMAND_KEYWORDS = ["COMPLETE", "CREATE", "RELATE", "TITLE", "STEP"];
const ELEMENT_ID_PATTERN = /^(input|activity|output|outcome|impact)\d+$/i;

function isWordChar(char) {
  return !!char && /[A-Za-z0-9_]/.test(char);
}

function matchCommandKeyword(input, index) {
  const before = input[index - 1];
  if (isWordChar(before)) return null;

  for (const keyword of COMMAND_KEYWORDS) {
    const candidate = input.slice(index, index + keyword.length);
    const after = input[index + keyword.length];
    if (candidate.toUpperCase() === keyword && !isWordChar(after)) {
      return keyword;
    }
  }
  return null;
}

function extractCommandStatements(input) {
  const statements = [];

  for (let i = 0; i < input.length; i++) {
    const keyword = matchCommandKeyword(input, i);
    if (!keyword) continue;

    let insideQuotes = false;
    let escaped = false;
    let end = -1;

    for (let j = i; j < input.length; j++) {
      const char = input[j];
      if (char === '"' && !escaped) {
        insideQuotes = !insideQuotes;
      } else if (char === ";" && !insideQuotes) {
        end = j;
        break;
      }
      escaped = char === "\\" && insideQuotes && !escaped;
    }

    if (end !== -1) {
      statements.push(input.slice(i, end + 1).trim());
      i = end;
    }
  }

  return statements;
}

function parseQuotedText(value) {
  const match = value.trim().match(/^"((?:\\.|[^"\\])*)"$/);
  if (!match) return null;
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function escapeDotString(value) {
  const normalized = String(value ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\r\n|\r/g, "\n");
  return normalized
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function parseCommands(input) {
  const model = {
    title: "",
    elements: {},
    relations: [],
  };

  const commands = extractCommandStatements(input);

  commands.forEach(cmd => {
    // 改行を含むコマンド本文（例: CREATE の複数行定義）も丸ごと取得する
    const match = cmd.match(/^(\w+)\b([\s\S]*);$/);
    if (!match) return;
    const commandType = match[1].toUpperCase();
    const rest = match[2].trim();

    switch (commandType) {
      case "TITLE":
        const title = parseQuotedText(rest);
        if (title !== null) {
          model.title = title;
        }
        break;
      case "CREATE":
        const elementsList = splitRespectingQuotes(rest, ",");
        elementsList.forEach(item => {
          const elementMatch = item.match(/^(\S+)\s+([\s\S]+)$/);
          if (elementMatch) {
            const id = elementMatch[1];
            const label = parseQuotedText(elementMatch[2]);
            if (!ELEMENT_ID_PATTERN.test(id) || label === null) return;
            const catMatch = id.match(/^(input|activity|output|outcome|impact)/i);
            const category = catMatch ? catMatch[1].toLowerCase() : "unknown";
            model.elements[id] = { id, label, category };
          }
        });
        break;
      case "RELATE":
        const relationsList = splitRespectingQuotes(rest, ",");
        relationsList.forEach(item => {
          const tokens = item.trim().split(/\s+/);
          if (
            tokens.length === 2 &&
            ELEMENT_ID_PATTERN.test(tokens[0]) &&
            ELEMENT_ID_PATTERN.test(tokens[1])
          ) {
            model.relations.push({ from: tokens[0], to: tokens[1] });
          }
        });
        break;
      case "STEP":
        if (!/^\d+$/.test(rest)) return;
        break;
      case "COMPLETE":
        if (rest !== "") return;
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
  const attachmentStyle = document.getElementById("edgeAttachmentStyle").value;

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

    label="${escapeDotString(model.title)}";
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
        const label = escapeDotString(element.label);
        dotData += `${id} [label="${label}", id="node_${id}"]\n`;
      }
    }
    dotData += "}\n";
  });

  model.relations.forEach(relation => {
    if (attachmentStyle === "fixed") {
      dotData += `${relation.from} -> ${relation.to} [id="edge_${relation.from}_${relation.to}", tailport=e, headport=w]\n`;
    } else {
      dotData += `${relation.from} -> ${relation.to} [id="edge_${relation.from}_${relation.to}"]\n`;
    }
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
    attachSvgEventHandlers();
    // 修正指示フォームを表示し、コピー用ボタンの状態を更新
    document.getElementById("correctionForm").style.display = "block";
    if (typeof updateCopyCorrectionButton === "function") {
      updateCopyCorrectionButton();
    }
  } catch (error) {
    console.error("Error rendering logic model:", error);
    const output = document.getElementById("output");
    output.innerHTML = '<p style="color: red;">エラーが発生しました</p>';
  }
}
