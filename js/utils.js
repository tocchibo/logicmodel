/* js/utils.js - 共通ユーティリティ関数 */

/**
 * オブジェクトの深いコピーを作成
 * @param {Object} obj - コピー対象のオブジェクト
 * @returns {Object} 深いコピーされたオブジェクト
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * DOM要素の表示/非表示を切り替える
 * @param {string|HTMLElement} elementOrId - 要素またはID
 * @param {boolean} show - 表示する場合true
 */
function toggleDisplay(elementOrId, show) {
  const element = typeof elementOrId === 'string' 
    ? document.getElementById(elementOrId) 
    : elementOrId;
  if (element) {
    element.style.display = show ? 'block' : 'none';
  }
}

/**
 * 複数のDOM要素の表示/非表示を一括切り替え
 * @param {Object} displayMap - {elementId: boolean} の形式
 */
function setMultipleDisplays(displayMap) {
  Object.entries(displayMap).forEach(([id, show]) => {
    toggleDisplay(id, show);
  });
}

/**
 * エラーメッセージを表示（統一的なエラー処理）
 * @param {string} message - エラーメッセージ
 * @param {Error} [error] - エラーオブジェクト（オプション）
 */
function showError(message, error = null) {
  if (error) {
    console.error(message, error);
  }
  alert(message);
}

/**
 * 成功メッセージを一時的に表示
 * @param {string} elementId - メッセージ要素のID
 * @param {number} duration - 表示時間（ミリ秒）
 */
function showTemporaryMessage(elementId, duration = 2000) {
  const element = document.getElementById(elementId);
  if (element) {
    element.style.display = 'inline';
    setTimeout(() => {
      element.style.display = 'none';
    }, duration);
  }
}

/**
 * クラスの追加/削除を遅延実行
 * @param {HTMLElement} element - 対象要素
 * @param {string} className - クラス名
 * @param {number} duration - 持続時間（ミリ秒）
 */
function addTemporaryClass(element, className, duration = 500) {
  if (element) {
    element.classList.add(className);
    setTimeout(() => {
      element.classList.remove(className);
    }, duration);
  }
}

/**
 * 要素の存在確認とコールバック実行
 * @param {string} selector - CSSセレクタ
 * @param {Function} callback - 要素が存在する場合に実行する関数
 */
function withElement(selector, callback) {
  const element = document.querySelector(selector);
  if (element) {
    callback(element);
  }
}

/**
 * 複数要素に対してコールバックを実行
 * @param {string} selector - CSSセレクタ
 * @param {Function} callback - 各要素に対して実行する関数
 */
function withElements(selector, callback) {
  document.querySelectorAll(selector).forEach(callback);
}

/**
 * デバウンス処理（連続実行を抑制）
 * @param {Function} func - 実行する関数
 * @param {number} wait - 待機時間（ミリ秒）
 * @returns {Function} デバウンスされた関数
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * ファイルダウンロードのヘルパー関数
 * @param {string} content - ファイル内容
 * @param {string} filename - ファイル名
 * @param {string} mimeType - MIMEタイプ
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * クリップボードへのコピー（エラーハンドリング付き）
 * @param {string} text - コピーするテキスト
 * @param {Function} onSuccess - 成功時のコールバック
 * @param {Function} onError - エラー時のコールバック
 */
function copyToClipboard(text, onSuccess, onError) {
  navigator.clipboard.writeText(text)
    .then(onSuccess)
    .catch(onError || ((err) => showError('コピーに失敗しました', err)));
}