function showCopySuccess() {
    const successMsg = document.getElementById('copySuccess');
    successMsg.style.display = 'inline';
    setTimeout(() => {
      successMsg.style.display = 'none';
    }, 2000);
  }
  