// Helper function: Splits a string by a given delimiter while preserving quoted substrings.
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
  
    // Split the entire input by semicolons (;) to get individual command statements.
    const commands = input
      .split(";")
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);
  
    commands.forEach(cmd => {
      // Extract the command type (e.g., TITLE, CREATE, RELATE, STEP, COMPLETE)
      const match = cmd.match(/^(\w+)\b(.*)$/);
      if (!match) return; // Ignore lines that don't conform to a command.
      const commandType = match[1].toUpperCase();
      const rest = match[2].trim();
  
      switch (commandType) {
        case "TITLE":
          // Expected format: TITLE "タイトル"
          // Extract content inside the quotes.
          const titleMatch = rest.match(/^"(.*)"$/);
          if (titleMatch) {
            model.title = titleMatch[1];
          }
          break;
  
        case "CREATE":
          // Expected format: CREATE {element_id} "ラベル", {element_id} "ラベル", ...
          // Split by commas, but ignore commas inside quotes.
          const elementsList = splitRespectingQuotes(rest, ",");
          elementsList.forEach(item => {
            // Each item should match: {element_id} "ラベル"
            const elementMatch = item.match(/^(\S+)\s+"(.*)"$/);
            if (elementMatch) {
              const id = elementMatch[1];
              const label = elementMatch[2];
              model.elements[id] = label;
            }
          });
          break;
  
        case "RELATE":
          // Expected format: RELATE {element_id1} {element_id2}, {element_id1} {element_id2}, ...
          // Split by commas while respecting quotes (though quotes are not expected here).
          const relationsList = splitRespectingQuotes(rest, ",");
          relationsList.forEach(item => {
            // Each relation should have two tokens: parent and child.
            const tokens = item.trim().split(/\s+/);
            if (tokens.length === 2) {
              model.relations.push({ from: tokens[0], to: tokens[1] });
            }
          });
          break;
  
        // STEP and COMPLETE commands are used for readability and carry no operational meaning.
        case "STEP":
        case "COMPLETE":
          // Ignore these commands.
          break;
  
        default:
          // Ignore any unrecognized commands.
          break;
      }
    });
  
    return model;
  }
  
  function generateDot(input) {
    const model = parseCommands(input);
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
        // Match elements that start with the appropriate type prefix (e.g., "input" from "input1")
        if (id.startsWith(category.slice(0, -1))) {
          // Replace literal "\n" sequences in the label with actual newlines if needed.
          const label = model.elements[id].split("\\n").join("\\n");
          dotData += `${id} [label="${label}"]\n`;
        }
      }
      dotData += "}\n";
    });
  
    model.relations.forEach(relation => {
      dotData += `${relation.from} -> ${relation.to}\n [tailport = e, headport = w]`;
    });
  
    dotData += "}\n";
    return dotData;
  }
  
  async function renderLogicModel(dotText) {
    try {
      const viz = new Viz();
      const svg = await viz.renderSVGElement(dotText);
      svg.style.maxWidth = "100%";
      const output = document.getElementById("output");
      output.innerHTML = "";
      output.appendChild(svg);
    } catch (error) {
      console.error("Error rendering logic model:", error);
      const output = document.getElementById("output");
      output.innerHTML = '<p style="color: red;">エラーが発生しました</p>';
    }
  }
  