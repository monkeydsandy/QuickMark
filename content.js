let popupJustOpened = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "popupOpened") {
    popupJustOpened = true;
    setTimeout(() => {
      popupJustOpened = false;
    }, 100);
  }
});

document.addEventListener('click', function(event) {
  if (!popupJustOpened) {
    chrome.runtime.sendMessage({action: "closePopup"});
  }
});