document.getElementById('result').innerText = `<<<${chrome.devtools.inspectedWindow.eval(
  'JSON.stringify(getCombinedState(), null, 2)',
)}>>>`;
