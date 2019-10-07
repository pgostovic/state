chrome.devtools.panels.create('Phnq State', null, 'panel.html');

// alert('a');

const backgroundPageConnection = chrome.runtime.connect({
  name: 'devtools-page',
});
// alert('b');

backgroundPageConnection.onMessage.addListener(message => {
  // Handle responses from the background page, if any
  alert(JSON.stringify(message));
});

backgroundPageConnection.postMessage({
  tabId: chrome.devtools.inspectedWindow.tabId,
  scriptToInject: 'content_script.js',
});

// alert('backgroundPageConnection' + Object.keys(backgroundPageConnection).join(', '));

// alert('ww: ' + chrome.runtime.sendMessage);
// chrome.runtime.sendMessage({
//   tabId: chrome.devtools.inspectedWindow.tabId,
//   scriptToInject: 'content_script.js',
// });
// Relay the tab ID to the background page
