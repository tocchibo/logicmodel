/**
 * 内部JSON（logicModelData）からコマンド文字列を生成する関数
 * 例：
 * {
 *    title: "プラスチック資源循環事業",
 *    elements: {
 *       "input1": { id: "input1", label: "投資資金", category: "input" },
 *       "activity1": { id: "activity1", label: "プラスチック\n回収", category: "activity" },
 *       …  // その他の要素
 *    },
 *    relations: [
 *       { from: "input1", to: "activity1" },
 *       …  // その他の関係
 *    ]
 * }
 */
function generateCommandsFromModel(model) {
    // 改行文字を "\n" のリテラルに変換するヘルパー関数
    function formatLabel(label) {
      return label.replace(/\r\n|\r|\n/g, '\\n');
    }
  
    let output = "";
  
    // STEP 1
    output += "STEP 1;\n";
    if (model.title && model.title.trim() !== "") {
      output += `TITLE "${model.title}";\n`;
    }
    // STEP 1：input と activity の要素を抽出
    const inputs = [];
    const activities = [];
    for (const id in model.elements) {
      const elem = model.elements[id];
      if (elem.category === "input") {
        inputs.push(elem);
      } else if (elem.category === "activity") {
        activities.push(elem);
      }
    }
    if (inputs.length > 0) {
      output += "CREATE " + inputs.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
    }
    if (activities.length > 0) {
      output += "CREATE " + activities.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
    }
    // STEP 1：input -> activity の関係をグループ化して出力
    const relGroupsStep1 = {};
    model.relations.forEach(rel => {
      const fromElem = model.elements[rel.from];
      const toElem = model.elements[rel.to];
      if (fromElem && toElem && fromElem.category === "input" && toElem.category === "activity") {
        if (!relGroupsStep1[rel.from]) relGroupsStep1[rel.from] = [];
        relGroupsStep1[rel.from].push(rel.to);
      }
    });
    for (const from in relGroupsStep1) {
      output += "RELATE " + relGroupsStep1[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
  
    // STEP 2
    output += "\nSTEP 2;\n";
    // STEP 2：output 要素の抽出
    const outputs = [];
    for (const id in model.elements) {
      const elem = model.elements[id];
      if (elem.category === "output") {
        outputs.push(elem);
      }
    }
    if (outputs.length > 0) {
      output += "CREATE " + outputs.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
    }
    // STEP 2：activity -> output の関係
    const relGroupsStep2 = {};
    model.relations.forEach(rel => {
      const fromElem = model.elements[rel.from];
      const toElem = model.elements[rel.to];
      if (fromElem && toElem && fromElem.category === "activity" && toElem.category === "output") {
        if (!relGroupsStep2[rel.from]) relGroupsStep2[rel.from] = [];
        relGroupsStep2[rel.from].push(rel.to);
      }
    });
    for (const from in relGroupsStep2) {
      output += "RELATE " + relGroupsStep2[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
  
    // STEP 3
    output += "\nSTEP 3;\n";
    // STEP 3：outcome 要素の抽出
    const outcomes = [];
    for (const id in model.elements) {
      const elem = model.elements[id];
      if (elem.category === "outcome") {
        outcomes.push(elem);
      }
    }
    if (outcomes.length > 0) {
      output += "CREATE " + outcomes.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
    }
    // STEP 3：output -> outcome および outcome -> outcome の関係
    const relGroupsStep3 = {};
    model.relations.forEach(rel => {
      const fromElem = model.elements[rel.from];
      const toElem = model.elements[rel.to];
      if (fromElem && toElem) {
        if (fromElem.category === "output" && toElem.category === "outcome") {
          if (!relGroupsStep3[rel.from]) relGroupsStep3[rel.from] = [];
          relGroupsStep3[rel.from].push(rel.to);
        } else if (fromElem.category === "outcome" && toElem.category === "outcome") {
          if (!relGroupsStep3[rel.from]) relGroupsStep3[rel.from] = [];
          relGroupsStep3[rel.from].push(rel.to);
        }
      }
    });
    for (const from in relGroupsStep3) {
      output += "RELATE " + relGroupsStep3[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
  
    // STEP 4
    output += "\nSTEP 4;\n";
    // STEP 4：impact 要素の抽出
    const impacts = [];
    for (const id in model.elements) {
      const elem = model.elements[id];
      if (elem.category === "impact") {
        impacts.push(elem);
      }
    }
    if (impacts.length > 0) {
      output += "CREATE " + impacts.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
    }
    // STEP 4：outcome -> impact の関係
    const relGroupsStep4 = {};
    model.relations.forEach(rel => {
      const fromElem = model.elements[rel.from];
      const toElem = model.elements[rel.to];
      if (fromElem && toElem && fromElem.category === "outcome" && toElem.category === "impact") {
        if (!relGroupsStep4[rel.from]) relGroupsStep4[rel.from] = [];
        relGroupsStep4[rel.from].push(rel.to);
      }
    });
    for (const from in relGroupsStep4) {
      output += "RELATE " + relGroupsStep4[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
  
    output += "\nCOMPLETE;";
    return output;
  }
  
  /**
   * コマンド出力ボタン押下時の処理
   * 内部の logicModelData からコマンド文字列を生成し、クリップボードへコピーします。
   */
  function outputCommands() {
    if (!AppState.logicModelData) {
      showError(ERROR_MESSAGES.NO_MODEL_DATA);
      return;
    }
    const commandsText = generateCommandsFromModel(AppState.logicModelData);
    
    copyToClipboard(commandsText,
      () => showTemporaryMessage(ELEMENT_IDS.COPY_SUCCESS, TIMING.MESSAGE_DURATION),
      (err) => showError(ERROR_MESSAGES.COPY_FAILED, err)
    );
  }
  
  /**
   * コピー成功時のメッセージ表示
   */
  function showCopySuccess() {
    showTemporaryMessage(ELEMENT_IDS.COPY_SUCCESS, TIMING.MESSAGE_DURATION);
  }
  