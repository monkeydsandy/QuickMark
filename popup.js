document.addEventListener('DOMContentLoaded', () => {
  const bookmarkCurrentBtn = document.getElementById('bookmarkCurrentBtn');
  const searchInput = document.getElementById('searchInput');
  const bookmarksList = document.getElementById('bookmarksList');
  const exportBtn = document.getElementById('exportBtn');
  const recycleBinIcon = document.getElementById('recycleBinIcon');

  let allBookmarks = [];
  let currentTabInfo = null;
  let expandedFolders = new Set();
  let draggedBookmark = null;
  let draggedElement = null;
  let draggedFolder = null;
  let deletedBookmarks = [];

  // Load and display bookmarks
  loadBookmarks();
  loadDeletedBookmarks();

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
        showAddBookmarkModal(currentTabInfo);
      } else {
        console.error("No active tab found");
        alert("No active tab found. Please try again.");
      }
    });
  });

  function showAddBookmarkModal(tab) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Add Bookmark</h2>
        <input type="text" id="bookmarkTitle" placeholder="Enter bookmark title" value="${tab.title}">
        <select id="folderSelect">
          <option value="">Select folder</option>
        </select>
        <button id="createFolderBtn">New Folder</button>
        <button id="saveBookmarkBtn">Save</button>
        <button id="cancelBookmarkBtn">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);

    const bookmarkTitleInput = document.getElementById('bookmarkTitle');
    const folderSelect = document.getElementById('folderSelect');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const saveBookmarkBtn = document.getElementById('saveBookmarkBtn');
    const cancelBookmarkBtn = document.getElementById('cancelBookmarkBtn');

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
      if (newFolder && newFolder.trim() !== "") {
        const option = document.createElement('option');
        option.value = newFolder;
        option.textContent = newFolder;
        folderSelect.appendChild(option);
        folderSelect.value = newFolder;
      }
    });

    saveBookmarkBtn.addEventListener('click', () => {
      const title = bookmarkTitleInput.value.trim();
      const folder = folderSelect.value;
      if (title && folder) {
        saveBookmark(tab.url, title, folder);
        document.body.removeChild(modal);
      } else {
        alert("Please enter a title and select a folder.");
      }
    });

    cancelBookmarkBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  function saveBookmark(url, title, folder) {
    const today = new Date().toISOString().split('T')[0];
    
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      const updatedBookmarks = folderWiseBookmarks || {};
      
      if (!updatedBookmarks[folder]) {
        updatedBookmarks[folder] = {};
      }
      if (!updatedBookmarks[folder][today]) {
        updatedBookmarks[folder][today] = [];
      }
      updatedBookmarks[folder][today].unshift({ url, title, date: today });
      
      chrome.storage.local.set({ folderWiseBookmarks: updatedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving bookmark:", chrome.runtime.lastError);
          alert("Error saving bookmark. Please try again.");
        } else {
          console.log("Bookmark saved successfully");
          loadBookmarks();
          setTimeout(() => highlightFolder(folder), 100);
        }
      });
    });
  }

  // Search functionality
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();
    if (query) {
      const results = fuzzySearch(query, allBookmarks);
      displayBookmarks(allBookmarks, query, new Set(results.map(r => r.folder)));
    } else {
      displayBookmarks(allBookmarks);
    }
  });

  // Add event listener for export button
  exportBtn.addEventListener('click', exportBookmarks);

  function loadBookmarks() {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      allBookmarks = flattenBookmarks(folderWiseBookmarks || {});
      console.log("All bookmarks:", allBookmarks);
      displayBookmarks(allBookmarks);
    });
  }

  function displayBookmarks(bookmarks, query = '', foldersToExpand = new Set()) {
    bookmarksList.innerHTML = '';
    const folderWiseBookmarks = groupBookmarksByFolder(bookmarks);
    
    for (const [folder, dateWiseBookmarks] of Object.entries(folderWiseBookmarks)) {
      const folderElement = createFolderElement(folder, dateWiseBookmarks, query, foldersToExpand);
      bookmarksList.appendChild(folderElement);
    }

    // Enable folder sorting
    new Sortable(bookmarksList, {
      animation: 150,
      handle: '.folder-header',
      onEnd: () => {
        const newOrder = Array.from(bookmarksList.children).map(el => el.dataset.folder);
        reorderFolders(newOrder);
      }
    });
  }

  function createFolderElement(folder, dateWiseBookmarks, query, foldersToExpand) {
    const folderElement = document.createElement('div');
    folderElement.className = 'folder';
    folderElement.dataset.folder = folder;
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
    if (expandedFolders.has(folder) || foldersToExpand.has(folder)) {
      bookmarkListElement.classList.add('open');
      folderHeader.querySelector('.folder-toggle').classList.add('open');
    }
    
    let folderHasMatchingBookmarks = false;
    for (const [date, bookmarks] of Object.entries(dateWiseBookmarks)) {
      for (const bookmark of bookmarks) {
        if (!query || fuzzyMatch(query, bookmark.title.toLowerCase()) || fuzzyMatch(query, bookmark.url.toLowerCase())) {
          folderHasMatchingBookmarks = true;
          const bookmarkElement = createBookmarkElement(bookmark, query);
          bookmarkListElement.appendChild(bookmarkElement);
        }
      }
    }
    
    // Always append the bookmarkListElement, even if it's empty
    folderElement.appendChild(bookmarkListElement);
    
    // Add folder event listeners
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

    return folderElement;
  }

  function createBookmarkElement(bookmark, query = '', isRecycleBin = false) {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.className = 'bookmark';
    
    const faviconElement = document.createElement('img');
    faviconElement.className = 'bookmark-favicon';
    faviconElement.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`;
    faviconElement.alt = '';
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'bookmark-content';
    
    const linkElement = document.createElement('a');
    linkElement.href = bookmark.url;
    linkElement.className = 'bookmark-link';
    linkElement.target = '_blank';
    linkElement.innerHTML = query ? highlightText(bookmark.title, query) : bookmark.title;
    
    const dateElement = document.createElement('span');
    dateElement.className = 'bookmark-date';
    dateElement.textContent = formatDate(bookmark.date);
    
    contentWrapper.appendChild(linkElement);
    contentWrapper.appendChild(dateElement);
    
    const actionsWrapper = document.createElement('div');
    actionsWrapper.className = 'bookmark-actions';
    
    if (!isRecycleBin) {
      const moveButton = document.createElement('button');
      moveButton.className = 'bookmark-action move-bookmark';
      moveButton.innerHTML = '<span class="material-icons">drive_file_move</span>';
      moveButton.title = 'Move bookmark';
      moveButton.addEventListener('click', (e) => {
        e.preventDefault();
        showFolderSelection(bookmark, moveBookmark);
      });
      
      const deleteButton = document.createElement('button');
      deleteButton.className = 'bookmark-action delete-bookmark';
      deleteButton.innerHTML = '<span class="material-icons">delete</span>';
      deleteButton.title = 'Delete bookmark';
      deleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        deleteBookmark(bookmark);
      });
      
      actionsWrapper.appendChild(moveButton);
      actionsWrapper.appendChild(deleteButton);
    } else {
      const restoreButton = document.createElement('button');
      restoreButton.className = 'bookmark-action restore-bookmark';
      restoreButton.innerHTML = '<span class="material-icons">restore</span>';
      restoreButton.title = 'Restore bookmark';
      restoreButton.addEventListener('click', (e) => {
        e.preventDefault();
        restoreBookmark(bookmark);
      });
      
      const permanentDeleteButton = document.createElement('button');
      permanentDeleteButton.className = 'bookmark-action permanent-delete-bookmark';
      permanentDeleteButton.innerHTML = '<span class="material-icons">delete_forever</span>';
      permanentDeleteButton.title = 'Permanently delete bookmark';
      permanentDeleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        permanentDeleteBookmark(bookmark);
      });
      
      actionsWrapper.appendChild(restoreButton);
      actionsWrapper.appendChild(permanentDeleteButton);
    }
    
    bookmarkElement.appendChild(faviconElement);
    bookmarkElement.appendChild(contentWrapper);
    bookmarkElement.appendChild(actionsWrapper);
    
    return bookmarkElement;
  }

  function highlightText(text, query) {
    const words = query.toLowerCase().split(/\s+/);
    let result = text;
    words.forEach(word => {
      if (word.length > 0) {
        const regex = new RegExp(`(${word})`, 'gi');
        result = result.replace(regex, '<span class="highlight">$1</span>');
      }
    });
    return result;
  }

  function deleteBookmark(bookmark) {
    chrome.storage.local.get(['folderWiseBookmarks', 'deletedBookmarks'], ({ folderWiseBookmarks, deletedBookmarks = [] }) => {
      // Remove from folder
      const folder = bookmark.folder;
      const date = bookmark.date;
      folderWiseBookmarks[folder][date] = folderWiseBookmarks[folder][date].filter(b => b.url !== bookmark.url);
      
      if (folderWiseBookmarks[folder][date].length === 0) {
        delete folderWiseBookmarks[folder][date];
      }
      
      // Add to deleted bookmarks
      deletedBookmarks = [{ ...bookmark, deletedDate: new Date().toISOString() }, ...deletedBookmarks].slice(0, 100);

      chrome.storage.local.set({ folderWiseBookmarks, deletedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error deleting bookmark:", chrome.runtime.lastError);
          alert("Error deleting bookmark. Please try again.");
        } else {
          console.log("Bookmark moved to recycle bin successfully");
          loadBookmarks();
          updateRecycleBinIcon();
        }
      });
    });
  }

  function restoreBookmark(bookmark) {
    chrome.storage.local.get(['folderWiseBookmarks', 'deletedBookmarks'], ({ folderWiseBookmarks, deletedBookmarks }) => {
      // Remove from deleted bookmarks
      deletedBookmarks = deletedBookmarks.filter(b => b.url !== bookmark.url);

      // Add to folder
      const folder = bookmark.folder;
      const date = bookmark.date;
      if (!folderWiseBookmarks[folder]) {
        folderWiseBookmarks[folder] = {};
      }
      if (!folderWiseBookmarks[folder][date]) {
        folderWiseBookmarks[folder][date] = [];
      }
      folderWiseBookmarks[folder][date].push(bookmark);

      chrome.storage.local.set({ folderWiseBookmarks, deletedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error restoring bookmark:", chrome.runtime.lastError);
          alert("Error restoring bookmark. Please try again.");
        } else {
          console.log("Bookmark restored successfully");
          loadBookmarks();
          loadDeletedBookmarks();
          highlightAndScrollToFolder(folder);
        }
      });
    });
  }

  function permanentDeleteBookmark(bookmark) {
    chrome.storage.local.get('deletedBookmarks', ({ deletedBookmarks }) => {
      deletedBookmarks = deletedBookmarks.filter(b => b.url !== bookmark.url);

      chrome.storage.local.set({ deletedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error permanently deleting bookmark:", chrome.runtime.lastError);
          alert("Error permanently deleting bookmark. Please try again.");
        } else {
          console.log("Bookmark permanently deleted successfully");
          loadDeletedBookmarks();
        }
      });
    });
  }

  function showFolderSelection(bookmark, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Move Bookmark</h2>
        <select id="folderSelect">
          <option value="">Select folder</option>
        </select>
        <button id="createFolderBtn">New Folder</button>
        <button id="moveFolderBtn">Move</button>
        <button id="cancelFolderBtn">Cancel</button>
      </div>
    `;
    document.body.appendChild(modal);

    const folderSelect = document.getElementById('folderSelect');
    const createFolderBtn = document.getElementById('createFolderBtn');
    const moveFolderBtn = document.getElementById('moveFolderBtn');
    const cancelFolderBtn = document.getElementById('cancelFolderBtn');

    // Populate folder options
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      const folders = Object.keys(folderWiseBookmarks || {});
      folders.forEach(folder => {
        if (folder !== bookmark.folder) {
          const option = document.createElement('option');
          option.value = folder;
          option.textContent = folder;
          folderSelect.appendChild(option);
        }
      });
    });

    createFolderBtn.addEventListener('click', () => {
      const newFolder = prompt("Enter new folder name:");
      if (newFolder && newFolder.trim() !== "") {
        const option = document.createElement('option');
        option.value = newFolder;
        option.textContent = newFolder;
        folderSelect.appendChild(option);
        folderSelect.value = newFolder;
      }
    });

    moveFolderBtn.addEventListener('click', () => {
      const selectedFolder = folderSelect.value;
      if (selectedFolder) {
        callback(bookmark, selectedFolder);
        document.body.removeChild(modal);
      } else {
        alert("Please select or create a folder.");
      }
    });

    cancelFolderBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  function moveBookmark(bookmark, newFolder) {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      const oldFolder = bookmark.folder;
      const date = bookmark.date;

      // Remove from old folder
      folderWiseBookmarks[oldFolder][date] = folderWiseBookmarks[oldFolder][date].filter(b => b.url !== bookmark.url);
      
      if (folderWiseBookmarks[oldFolder][date].length === 0) {
        delete folderWiseBookmarks[oldFolder][date];
      }
      
      // Add to new folder
      if (!folderWiseBookmarks[newFolder]) {
        folderWiseBookmarks[newFolder] = {};
      }
      if (!folderWiseBookmarks[newFolder][date]) {
        folderWiseBookmarks[newFolder][date] = [];
      }
      folderWiseBookmarks[newFolder][date].push({ ...bookmark, folder: newFolder });

      chrome.storage.local.set({ folderWiseBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error moving bookmark:", chrome.runtime.lastError);
          alert("Error moving bookmark. Please try again.");
        } else {
          console.log("Bookmark moved successfully");
          loadBookmarks();
        }
      });
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
    const words = query.toLowerCase().split(/\s+/);
    return bookmarks.filter(bookmark => {
      return words.every(word => 
        bookmark.title.toLowerCase().includes(word) || 
        bookmark.url.toLowerCase().includes(word)
      );
    });
  }

  function fuzzyMatch(query, str) {
    const regex = new RegExp(query.split('').join('.*?'), 'i');
    return regex.test(str);
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  function reorderFolders(newOrder) {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      const reorderedBookmarks = {};
      newOrder.forEach(folder => {
        if (folderWiseBookmarks[folder]) {
          reorderedBookmarks[folder] = folderWiseBookmarks[folder];
        }
      });

      chrome.storage.local.set({ folderWiseBookmarks: reorderedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error reordering folders:", chrome.runtime.lastError);
          alert("Error reordering folders. Please try again.");
        } else {
          console.log("Folders reordered successfully");
          loadBookmarks();
        }
      });
    });
  }

  function exportBookmarks() {
    chrome.storage.local.get('folderWiseBookmarks', ({ folderWiseBookmarks }) => {
      if (chrome.runtime.lastError) {
        console.error("Error getting bookmarks:", chrome.runtime.lastError);
        alert("Error exporting bookmarks. Please try again.");
        return;
      }

      const bookmarkHTML = generateBookmarkHTML(folderWiseBookmarks);
      const blob = new Blob([bookmarkHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bookmarks_export.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function generateBookmarkHTML(folderWiseBookmarks) {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
    <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
    <TITLE>Bookmarks</TITLE>
    <H1>Bookmarks</H1>
    <DL><p>
    `;

    for (const [folder, dateWiseBookmarks] of Object.entries(folderWiseBookmarks)) {
      html += `    <DT><H3>${escapeHTML(folder)}</H3>\n    <DL><p>\n`;
      
      for (const [date, bookmarks] of Object.entries(dateWiseBookmarks)) {
        for (const bookmark of bookmarks) {
          html += `        <DT><A HREF="${escapeHTML(bookmark.url)}" ADD_DATE="${Math.floor(new Date(bookmark.date).getTime() / 1000)}">${escapeHTML(bookmark.title)}</A>\n`;
        }
      }
      
      html += `    </DL><p>\n`;
    }

    html += `</DL><p>`;
    return html;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  function loadDeletedBookmarks() {
    chrome.storage.local.get('deletedBookmarks', ({ deletedBookmarks = [] }) => {
      if (deletedBookmarks.length > 0) {
        recycleBinIcon.style.display = 'flex';
        recycleBinIcon.querySelector('.recycle-bin-count').textContent = deletedBookmarks.length;
      } else {
        recycleBinIcon.style.display = 'none';
      }
    });
  }

  recycleBinIcon.addEventListener('click', showRecycleBin);

  function showRecycleBin() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content recycle-bin-modal">
        <h2>Recycle Bin</h2>
        <div id="recycleBinList"></div>
        <button id="closeRecycleBinBtn">Close</button>
      </div>
    `;
    document.body.appendChild(modal);

    const recycleBinList = modal.querySelector('#recycleBinList');
    const closeRecycleBinBtn = modal.querySelector('#closeRecycleBinBtn');

    loadDeletedBookmarks(recycleBinList);

    closeRecycleBinBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  function loadDeletedBookmarks(container) {
    chrome.storage.local.get('deletedBookmarks', ({ deletedBookmarks = [] }) => {
      container.innerHTML = '';
      if (deletedBookmarks.length > 0) {
        deletedBookmarks.forEach(bookmark => {
          const bookmarkElement = createDeletedBookmarkElement(bookmark);
          container.appendChild(bookmarkElement);
        });
      } else {
        container.innerHTML = '<p>No deleted bookmarks</p>';
      }
    });
  }

  function createDeletedBookmarkElement(bookmark) {
    const bookmarkElement = document.createElement('div');
    bookmarkElement.className = 'bookmark deleted-bookmark';
    
    const faviconElement = document.createElement('img');
    faviconElement.className = 'bookmark-favicon';
    faviconElement.src = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}`;
    faviconElement.alt = '';
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'bookmark-content';
    
    const linkElement = document.createElement('a');
    linkElement.href = bookmark.url;
    linkElement.className = 'bookmark-link';
    linkElement.target = '_blank';
    linkElement.textContent = bookmark.title;
    
    const dateElement = document.createElement('span');
    dateElement.className = 'bookmark-date';
    dateElement.textContent = `Deleted: ${formatDate(bookmark.deletedDate)}`;
    
    contentWrapper.appendChild(linkElement);
    contentWrapper.appendChild(dateElement);
    
    const restoreButton = document.createElement('button');
    restoreButton.className = 'bookmark-action restore-bookmark';
    restoreButton.innerHTML = '<span class="material-icons">restore</span>';
    restoreButton.title = 'Restore bookmark';
    restoreButton.addEventListener('click', (e) => {
      e.preventDefault();
      restoreBookmark(bookmark);
    });
    
    bookmarkElement.appendChild(faviconElement);
    bookmarkElement.appendChild(contentWrapper);
    bookmarkElement.appendChild(restoreButton);
    
    return bookmarkElement;
  }

  function restoreBookmark(bookmark) {
    chrome.storage.local.get(['folderWiseBookmarks', 'deletedBookmarks'], ({ folderWiseBookmarks, deletedBookmarks }) => {
      // Remove from deleted bookmarks
      deletedBookmarks = deletedBookmarks.filter(b => b.url !== bookmark.url);

      // Add to folder
      const folder = bookmark.folder;
      const date = bookmark.date;
      if (!folderWiseBookmarks[folder]) {
        folderWiseBookmarks[folder] = {};
      }
      if (!folderWiseBookmarks[folder][date]) {
        folderWiseBookmarks[folder][date] = [];
      }
      folderWiseBookmarks[folder][date].push(bookmark);

      chrome.storage.local.set({ folderWiseBookmarks, deletedBookmarks }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error restoring bookmark:", chrome.runtime.lastError);
          alert("Error restoring bookmark. Please try again.");
        } else {
          console.log("Bookmark restored successfully");
          loadBookmarks();
          updateRecycleBinIcon();
          highlightAndScrollToFolder(folder);
          
          // Refresh the recycle bin list
          const recycleBinList = document.querySelector('#recycleBinList');
          if (recycleBinList) {
            loadDeletedBookmarks(recycleBinList);
          }
        }
      });
    });
  }

  function highlightAndScrollToFolder(folderName) {
    const folderElement = document.querySelector(`.folder[data-folder="${folderName}"]`);
    if (folderElement) {
      // Highlight the folder
      folderElement.classList.add('highlight');
      setTimeout(() => folderElement.classList.remove('highlight'), 2000);

      // Expand the folder if it's not already expanded
      const bookmarkList = folderElement.querySelector('.bookmark-list');
      const folderToggle = folderElement.querySelector('.folder-toggle');
      if (!bookmarkList.classList.contains('open')) {
        bookmarkList.classList.add('open');
        folderToggle.classList.add('open');
        expandedFolders.add(folderName);
      }

      // Scroll to the folder
      folderElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Call this function when the popup is opened
  updateRecycleBinIcon();
});

  