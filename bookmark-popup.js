document.addEventListener('DOMContentLoaded', () => {
  const folderSelect = document.getElementById('folderSelect');
  const newFolderInput = document.getElementById('newFolderInput');
  const saveBookmarkBtn = document.getElementById('saveBookmarkBtn');

  // Load existing folders
  chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
    const folders = Object.keys(folderWiseBookmarks || {});
    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder;
      option.textContent = folder;
      folderSelect.appendChild(option);
    });
  });

  // Save bookmark
  saveBookmarkBtn.addEventListener('click', () => {
    const selectedFolder = folderSelect.value;
    const newFolder = newFolderInput.value.trim();
    const folder = newFolder || selectedFolder || 'Uncategorized';

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      saveBookmark(folder, currentTab.url);
    });
  });

  function saveBookmark(folder, url) {
    const today = new Date().toISOString().split('T')[0];
    
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      const updatedBookmarks = folderWiseBookmarks || {};
      
      if (!updatedBookmarks[folder]) {
        updatedBookmarks[folder] = {};
      }
      if (!updatedBookmarks[folder][today]) {
        updatedBookmarks[folder][today] = [];
      }
      updatedBookmarks[folder][today].push(url);
      
      chrome.storage.local.set({ folderWiseBookmarks: updatedBookmarks }, () => {
        window.close();
      });
    });
  }
});