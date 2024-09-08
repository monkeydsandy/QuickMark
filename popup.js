document.addEventListener('DOMContentLoaded', () => {
  const bookmarkCurrentBtn = document.getElementById('bookmarkCurrentBtn');
  const searchInput = document.getElementById('searchInput');
  const bookmarksList = document.getElementById('bookmarksList');

  let allBookmarks = [];
  let currentTabInfo = null;
  let expandedFolders = new Set();

  // Load and display bookmarks
  loadBookmarks();

  // Add this at the beginning of the DOMContentLoaded listener
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "popupOpened"});
    }
  });

  // Add this listener for the close message
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "closePopup") {
      window.close();
    }
  });

  // Prevent clicks inside the popup from closing it
  document.body.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  // Add event listener for bookmarking current page
  bookmarkCurrentBtn.addEventListener('click', () => {
    console.log("Bookmark button clicked");
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error("Error querying tabs:", chrome.runtime.lastError);
        alert("Error accessing current tab. Please try again.");
        return;
      }
      
      if (tabs && tabs.length > 0) {
        currentTabInfo = tabs[0];
        console.log("Current tab:", currentTabInfo);
        showFolderSelection();
      } else {
        console.error("No active tab found");
        alert("No active tab found. Please try again.");
      }
    });
  });

  // Search functionality
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query) {
      const results = fuzzySearch(query, allBookmarks);
      displayBookmarks(results, query);
    } else {
      displayBookmarks(allBookmarks);
    }
  });

  function showFolderSelection() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Select Folder</h2>
        <select id="folderSelect"></select>
        <button id="createFolderBtn">Create New Folder</button>
        <button id="saveFolderBtn">Save</button>
        <button id="cancelFolderBtn">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);

    const folderSelect = document.getElementById('folderSelect');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const saveFolderBtn = document.getElementById('saveFolderBtn');
    const cancelFolderBtn = document.getElementById('cancelFolderBtn');

    // Populate folder options
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      const folders = Object.keys(folderWiseBookmarks || {});
      folders.forEach(folder => {
        const option = document.createElement('option');
        option.value = folder;
        option.textContent = folder;
        folderSelect.appendChild(option);
      });
    });

    createFolderBtn.addEventListener('click', () => {
      const newFolder = prompt("Enter new folder name:");
      if (newFolder) {
        const option = document.createElement('option');
        option.value = newFolder;
        option.textContent = newFolder;
        folderSelect.appendChild(option);
        folderSelect.value = newFolder;
      }
    });

    saveFolderBtn.addEventListener('click', () => {
      const selectedFolder = folderSelect.value;
      saveBookmark(selectedFolder, currentTabInfo.url, currentTabInfo.title);
      document.body.removeChild(modal);
    });

    cancelFolderBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  function saveBookmark(folder, url, title) {
    console.log("Saving bookmark:", folder, url, title);
    const today = new Date().toISOString().split('T')[0];
    
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting bookmarks:", chrome.runtime.lastError);
        alert("Error saving bookmark. Please try again.");
        return;
      }

      const updatedBookmarks = folderWiseBookmarks || {};
      
      if (!updatedBookmarks[folder]) {
        updatedBookmarks[folder] = {};
      }
      if (!updatedBookmarks[folder][today]) {
        updatedBookmarks[folder][today] = [];
      }
      updatedBookmarks[folder][today].unshift({ url, title });
      
      chrome.storage.local.set({ folderWiseBookmarks: updatedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving bookmarks:", chrome.runtime.lastError);
          alert("Error saving bookmark. Please try again.");
        } else {
          console.log("Bookmark saved successfully");
          loadBookmarks();
          setTimeout(() => highlightFolder(folder), 100);
        }
      });
    });
  }

  function loadBookmarks() {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      allBookmarks = flattenBookmarks(folderWiseBookmarks || {});
      console.log("All bookmarks:", allBookmarks);
      displayBookmarks(allBookmarks);
    });
  }

  function displayBookmarks(bookmarks, query = '') {
    bookmarksList.innerHTML = '';
    const folderWiseBookmarks = groupBookmarksByFolder(bookmarks);
    
    for (const [folder, dateWiseBookmarks] of Object.entries(folderWiseBookmarks)) {
      const folderElement = document.createElement('div');
      folderElement.className = 'folder';
      folderElement.id = `folder-${folder.replace(/\s+/g, '-').toLowerCase()}`;
      
      const folderHeader = document.createElement('div');
      folderHeader.className = 'folder-header';
      folderHeader.innerHTML = `
        <span class="folder-name">${folder}</span>
        <button class="folder-toggle material-icons">arrow_drop_down</button>
        <button class="rename-folder material-icons" title="Rename Folder">edit</button>
        <button class="delete-folder material-icons" title="Delete Folder">delete</button>
      `;
      folderElement.appendChild(folderHeader);
      
      const bookmarkListElement = document.createElement('div');
      bookmarkListElement.className = 'bookmark-list';
      if (expandedFolders.has(folder)) {
        bookmarkListElement.classList.add('open');
        folderHeader.querySelector('.folder-toggle').classList.add('open');
      }
      
      for (const [date, bookmarkList] of Object.entries(dateWiseBookmarks)) {
        for (const bookmark of bookmarkList) {
          const bookmarkElement = createBookmarkElement(bookmark, query);
          bookmarkListElement.appendChild(bookmarkElement);
        }
      }
      
      folderElement.appendChild(bookmarkListElement);
      bookmarksList.appendChild(folderElement);
      
      folderHeader.addEventListener('click', () => {
        bookmarkListElement.classList.toggle('open');
        folderHeader.querySelector('.folder-toggle').classList.toggle('open');
        if (bookmarkListElement.classList.contains('open')) {
          expandedFolders.add(folder);
        } else {
          expandedFolders.delete(folder);
        }
      });

      folderHeader.querySelector('.rename-folder').addEventListener('click', (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new folder name:", folder);
        if (newName && newName !== folder) {
          renameFolder(folder, newName);
        }
      });

      folderHeader.querySelector('.delete-folder').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete the folder "${folder}" and all its bookmarks?`)) {
          deleteFolder(folder);
        }
      });
    }
  }

  function createBookmarkElement(bookmark, query) {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.className = 'bookmark';
    
    const dateElement = document.createElement('div');
    dateElement.className = 'date';
    dateElement.textContent = bookmark.date;
    bookmarkElement.appendChild(dateElement);

    const linkElement = document.createElement('a');
    linkElement.href = bookmark.url;
    // Limit the title to the first two lines
    const limitedTitle = bookmark.title.split('\n').slice(0, 2).join('\n').trim();
    linkElement.textContent = limitedTitle || bookmark.url;
    linkElement.title = bookmark.title; // Show full title on hover
    linkElement.target = '_blank';
    
    if (query) {
      linkElement.innerHTML = highlightMatch(limitedTitle || bookmark.url, query);
    }
    
    bookmarkElement.appendChild(linkElement);

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<span class="material-icons">close</span>';
    deleteBtn.className = 'deleteBtn';
    deleteBtn.title = 'Delete bookmark';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteBookmark(bookmark.folder, bookmark.date, bookmark.url);
    });
    bookmarkElement.appendChild(deleteBtn);

    return bookmarkElement;
  }

  function deleteBookmark(folder, date, url) {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      if (folderWiseBookmarks[folder] && folderWiseBookmarks[folder][date]) {
        folderWiseBookmarks[folder][date] = folderWiseBookmarks[folder][date].filter(b => b.url !== url);
        
        if (folderWiseBookmarks[folder][date].length === 0) {
          delete folderWiseBookmarks[folder][date];
        }
        
        if (Object.keys(folderWiseBookmarks[folder]).length === 0) {
          delete folderWiseBookmarks[folder];
          expandedFolders.delete(folder);
        }

        chrome.storage.local.set({ folderWiseBookmarks }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error deleting bookmark:", chrome.runtime.lastError);
            alert("Error deleting bookmark. Please try again.");
          } else {
            console.log("Bookmark deleted successfully");
            loadBookmarks();
          }
        });
      }
    });
  }

  function renameFolder(oldName, newName) {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      if (folderWiseBookmarks[oldName]) {
        folderWiseBookmarks[newName] = folderWiseBookmarks[oldName];
        delete folderWiseBookmarks[oldName];

        chrome.storage.local.set({ folderWiseBookmarks }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error renaming folder:", chrome.runtime.lastError);
            alert("Error renaming folder. Please try again.");
          } else {
            console.log("Folder renamed successfully");
            if (expandedFolders.has(oldName)) {
              expandedFolders.delete(oldName);
              expandedFolders.add(newName);
            }
            loadBookmarks();
          }
        });
      }
    });
  }

  function deleteFolder(folderName) {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      if (folderWiseBookmarks[folderName]) {
        delete folderWiseBookmarks[folderName];
        expandedFolders.delete(folderName);

        chrome.storage.local.set({ folderWiseBookmarks }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error deleting folder:", chrome.runtime.lastError);
            alert("Error deleting folder. Please try again.");
          } else {
            console.log("Folder deleted successfully");
            loadBookmarks();
          }
        });
      }
    });
  }

  function flattenBookmarks(folderWiseBookmarks) {
    const flattened = [];
    for (const [folder, dateWiseBookmarks] of Object.entries(folderWiseBookmarks)) {
      for (const [date, bookmarks] of Object.entries(dateWiseBookmarks)) {
        for (const bookmark of bookmarks) {
          flattened.push({ ...bookmark, folder, date });
        }
      }
    }
    return flattened;
  }

  function groupBookmarksByFolder(bookmarks) {
    const grouped = {};
    for (const bookmark of bookmarks) {
      if (!grouped[bookmark.folder]) {
        grouped[bookmark.folder] = {};
      }
      if (!grouped[bookmark.folder][bookmark.date]) {
        grouped[bookmark.folder][bookmark.date] = [];
      }
      grouped[bookmark.folder][bookmark.date].push(bookmark);
    }
    return grouped;
  }

  function fuzzySearch(query, bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return [];
    }
    const fuse = new Fuse(bookmarks, {
      keys: ['folder', 'date', 'url', 'title'],
      threshold: 0.4,
    });
    return fuse.search(query).map(result => result.item);
  }

  function highlightMatch(text, query) {
    const regex = new RegExp(query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    return text.replace(regex, match => `<span class="highlight">${match}</span>`);
  }

  function highlightFolder(folderName) {
    const folderId = `folder-${folderName.replace(/\s+/g, '-').toLowerCase()}`;
    const folderElement = document.getElementById(folderId);
    if (folderElement) {
      folderElement.classList.add('highlight-folder');
      setTimeout(() => {
        folderElement.classList.remove('highlight-folder');
      }, 2000);
    }
  }
});