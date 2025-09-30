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
    
    // カテゴリーの定義順序（ロジックモデルの階層構造）
    const categoryOrder = ["input", "activity", "output", "outcome", "impact"];
    
    // カテゴリーごとに要素を分類
    const elementsByCategory = {
      input: [],
      activity: [],
      output: [],
      outcome: [],
      impact: []
    };
    
    for (const id in model.elements) {
      const elem = model.elements[id];
      if (elementsByCategory[elem.category]) {
        elementsByCategory[elem.category].push(elem);
      }
    }
    
    // 各ステップで作成済みの要素を記録
    const createdElements = new Set();
    
    // STEP 1: input と activity
    output += "STEP 1;\n";
    if (model.title && model.title.trim() !== "") {
      output += `TITLE "${model.title}";\n`;
    }
    
    // input 要素の作成
    if (elementsByCategory.input.length > 0) {
      output += "CREATE " + elementsByCategory.input.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
      elementsByCategory.input.forEach(elem => createdElements.add(elem.id));
    }
    
    // activity 要素の作成
    if (elementsByCategory.activity.length > 0) {
      output += "CREATE " + elementsByCategory.activity.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
      elementsByCategory.activity.forEach(elem => createdElements.add(elem.id));
    }
    
    // STEP 1 での関係（input/activity から input/activity への全ての関係）
    const relGroupsStep1 = {};
    model.relations.forEach(rel => {
      if (createdElements.has(rel.from) && createdElements.has(rel.to)) {
        if (!relGroupsStep1[rel.from]) relGroupsStep1[rel.from] = [];
        relGroupsStep1[rel.from].push(rel.to);
      }
    });
    for (const from in relGroupsStep1) {
      output += "RELATE " + relGroupsStep1[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
    
    // STEP 2: output
    output += "\nSTEP 2;\n";
    if (elementsByCategory.output.length > 0) {
      output += "CREATE " + elementsByCategory.output.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
      elementsByCategory.output.forEach(elem => createdElements.add(elem.id));
    }
    
    // STEP 2 での関係（既存要素から output への関係、output 同士の関係）
    const relGroupsStep2 = {};
    model.relations.forEach(rel => {
      if (createdElements.has(rel.from) && createdElements.has(rel.to)) {
        const toElem = model.elements[rel.to];
        if (toElem && toElem.category === "output") {
          // 既に STEP 1 で出力した関係は除外
          if (!relGroupsStep1[rel.from] || !relGroupsStep1[rel.from].includes(rel.to)) {
            if (!relGroupsStep2[rel.from]) relGroupsStep2[rel.from] = [];
            relGroupsStep2[rel.from].push(rel.to);
          }
        }
      }
    });
    for (const from in relGroupsStep2) {
      output += "RELATE " + relGroupsStep2[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
    
    // STEP 3: outcome
    output += "\nSTEP 3;\n";
    if (elementsByCategory.outcome.length > 0) {
      output += "CREATE " + elementsByCategory.outcome.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
      elementsByCategory.outcome.forEach(elem => createdElements.add(elem.id));
    }
    
    // STEP 3 での関係（既存要素から outcome への関係、outcome 同士の関係）
    const relGroupsStep3 = {};
    model.relations.forEach(rel => {
      if (createdElements.has(rel.from) && createdElements.has(rel.to)) {
        const toElem = model.elements[rel.to];
        if (toElem && toElem.category === "outcome") {
          // 既に出力した関係は除外
          const alreadyOutput = (relGroupsStep1[rel.from] && relGroupsStep1[rel.from].includes(rel.to)) ||
                               (relGroupsStep2[rel.from] && relGroupsStep2[rel.from].includes(rel.to));
          if (!alreadyOutput) {
            if (!relGroupsStep3[rel.from]) relGroupsStep3[rel.from] = [];
            relGroupsStep3[rel.from].push(rel.to);
          }
        }
      }
    });
    for (const from in relGroupsStep3) {
      output += "RELATE " + relGroupsStep3[from].map(to => `${from} ${to}`).join(", ") + ";\n";
    }
    
    // STEP 4: impact
    output += "\nSTEP 4;\n";
    if (elementsByCategory.impact.length > 0) {
      output += "CREATE " + elementsByCategory.impact.map(elem => `${elem.id} "${formatLabel(elem.label)}"`).join(", ") + ";\n";
      elementsByCategory.impact.forEach(elem => createdElements.add(elem.id));
    }
    
    // STEP 4 での関係（既存要素から impact への関係、impact 同士の関係）
    const relGroupsStep4 = {};
    model.relations.forEach(rel => {
      if (createdElements.has(rel.from) && createdElements.has(rel.to)) {
        const toElem = model.elements[rel.to];
        if (toElem && toElem.category === "impact") {
          // 既に出力した関係は除外
          const alreadyOutput = (relGroupsStep1[rel.from] && relGroupsStep1[rel.from].includes(rel.to)) ||
                               (relGroupsStep2[rel.from] && relGroupsStep2[rel.from].includes(rel.to)) ||
                               (relGroupsStep3[rel.from] && relGroupsStep3[rel.from].includes(rel.to));
          if (!alreadyOutput) {
            if (!relGroupsStep4[rel.from]) relGroupsStep4[rel.from] = [];
            relGroupsStep4[rel.from].push(rel.to);
          }
        }
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
  