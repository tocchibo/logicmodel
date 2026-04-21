const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function loadLogicModelContext() {
  const context = {
    document: {
      getElementById(id) {
        const values = {
          splineType: "line",
          edgeType: "line",
          edgeAttachmentStyle: "fixed",
        };
        return { value: values[id] || "" };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("js/logicModel.js", "utf8"), context);
  return context;
}

const { parseCommands, generateDotFromModel } = loadLogicModelContext();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

{
  const input = [
    "Here is the result:",
    "```",
    'STEP 1;',
    'TITLE "T";',
    'CREATE input1 "A", activity1 "B";',
    'RELATE input1 activity1;',
    'COMPLETE;',
    "```",
    "Paste this into the app.",
  ].join("\n");
  const model = parseCommands(input);
  assert.strictEqual(model.title, "T");
  assert.deepStrictEqual(Object.keys(model.elements), ["input1", "activity1"]);
  assert.deepStrictEqual(plain(model.relations), [{ from: "input1", to: "activity1" }]);
}

{
  const input = [
    'CREATE input1 "A;B",',
    '       input2 "C,D",',
    '       activity1 "Line\\nBreak";',
    "RELATE input1",
    "       activity1,",
    "       input2 activity1;",
  ].join("\n");
  const model = parseCommands(input);
  assert.strictEqual(model.elements.input1.label, "A;B");
  assert.strictEqual(model.elements.input2.label, "C,D");
  assert.strictEqual(model.elements.activity1.label, "Line\\nBreak");
  assert.strictEqual(model.relations.length, 2);
}

{
  const input = [
    "CREATE unknown1 \"Ignored\";",
    "CREATE input1 MissingQuotes;",
    "RELATE input1 unknown1;",
    "STEP X;",
  ].join("\n");
  const model = parseCommands(input);
  assert.deepStrictEqual(plain(model.elements), {});
  assert.deepStrictEqual(plain(model.relations), []);
}

{
  const model = {
    title: 'Title "Q" \\ slash',
    elements: {
      input1: { id: "input1", label: 'Line\\nBreak "Q" \\ slash', category: "input" },
    },
    relations: [],
  };
  const dot = generateDotFromModel(model);
  assert(dot.includes('label="Title \\"Q\\" \\\\ slash";'));
  assert(dot.includes('input1 [label="Line\\nBreak \\"Q\\" \\\\ slash", id="node_input1"]'));
}

console.log("parser tests passed");
