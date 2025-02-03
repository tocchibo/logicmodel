let lastProcessTime = 0;
const DEBOUNCE_TIME = 300;

async function processCommands() {
  const currentTime = Date.now();
  if (currentTime - lastProcessTime < DEBOUNCE_TIME) {
    return;
  }
  lastProcessTime = currentTime;

  const commands = document.getElementById('commands').value;
  if (commands.trim() === '') {
    document.getElementById('output').innerHTML = '';
    return;
  }
  const dotData = generateDot(commands);
  await renderLogicModel(dotData);
}

function clearAll() {
  document.getElementById('commands').value = '';
  document.getElementById('output').innerHTML = '';
}
