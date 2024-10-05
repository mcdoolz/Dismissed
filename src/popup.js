document.addEventListener('DOMContentLoaded', () => {
  const filterInput = document.getElementById('filterInput');
  const filterTypeSelect = document.getElementById('filterTypeSelect');
  const companyTags = document.getElementById('companyTags');
  const titleTags = document.getElementById('titleTags');
  const dismissButton = document.getElementById('dismissButton');

  if (!filterInput) {
    console.error('filterInput element not found');
    alert('filterInput element not found');
    return;
  }

  filterInput.value = '';
  filterInput.focus();

  function saveInput() {
    if (!filterInput.value) {
      console.log("No input to save");
      return;
    }
    const items = filterInput.value.split(/[,;]/).map(item => item.trim()).filter(Boolean);
    const storageKey = filterTypeSelect.value;
    const container = storageKey === 'companies' ? companyTags : titleTags;

    chrome.storage.sync.get([storageKey], (result) => {
      if (!result[storageKey]) result[storageKey] = [];
      const updatedItems = [...new Set([...result[storageKey], ...items])];
      chrome.storage.sync.set({ [storageKey]: updatedItems }, () => {
        displayTags(updatedItems, container, storageKey);
        filterInput.value = '';
      });
    });
  }

  filterInput.addEventListener('input', () => {
    if (filterInput.value.includes(',') || filterInput.value.includes(';')) saveInput();
  });

  filterInput.addEventListener('blur', saveInput);
  filterInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') saveInput();
  });

  function formatDate(dateString) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  }

  // Function to check and set installation date
  function checkAndSetInstallDate() {
    chrome.storage.sync.get(['installDate'], ({ installDate }) => {
      if (!installDate) {
        // If install date doesn't exist, set it to current date
        const currentDate = new Date().toISOString();
        chrome.storage.sync.set({ installDate: currentDate }, () => {
          console.log('Installation date set:', currentDate);
          displayInstallDate(currentDate);
        });
      } else {
        displayInstallDate(installDate);
      }
    });
  }

  // Function to display the installation date
  function displayInstallDate(dateString) {
    const formattedDate = formatDate(dateString);
    const installDateElement = document.getElementById('installDate');
    if (installDateElement) {
      installDateElement.textContent = formattedDate;
    }
  }

  // Call the function to check and set install date
  checkAndSetInstallDate();

  dismissButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentUrl = tabs[0].url;
      if (!currentUrl.includes('linkedin.com')) {
        alert('Please navigate to LinkedIn.com to use this extension.');
        return;
      }

      chrome.storage.sync.get(['companies', 'titles'], ({ companies = [], titles = [] }) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: dismissJobs,
          args: [companies, titles],
        });
      });
    });
  });

  function displayTags(items, container, storageKey) {
    const isRegex = str => str.startsWith('/') && str.endsWith('/');
    container.style.display = items.length ? 'block' : 'none';
    container.innerHTML = '';

    items.forEach(item => {
      const tag = document.createElement('span');
      tag.className = !isRegex(item) ? 'tag' : 'tag regex';
      tag.textContent = item;

      const removeButton = document.createElement('button');
      removeButton.textContent = '\u2716';
      removeButton.title = 'Remove';
      removeButton.className = 'remove';
      removeButton.addEventListener('click', () => removeTag(item, storageKey, container));

      const editButton = document.createElement('button');
      editButton.textContent = '\u270E';
      editButton.title = 'Edit';
      editButton.className = 'edit';
      editButton.addEventListener('click', () => {
        filterInput.value = item;
        removeTag(item, storageKey, container);
      });

      tag.appendChild(removeButton);
      tag.appendChild(editButton);
      container.appendChild(tag);
    });
  }

  function removeTag(item, storageKey, container) {
    chrome.storage.sync.get([storageKey], (result) => {
      const items = result[storageKey].filter(storedItem => storedItem !== item);
      chrome.storage.sync.set({ [storageKey]: items }, () => {
        displayTags(items, container, storageKey);
      });
    });
  }

  chrome.storage.sync.get(['companies', 'titles'], ({ companies = [], titles = [] }) => {
    displayTags(companies, companyTags, 'companies');
    displayTags(titles, titleTags, 'titles');
    updateDismissedCount();
  });
});

/**
 * Update the dismissed count if dismissed is provided and over zero.
 * Else return the number of dismissed jobs thus.
 * Use chrome.storage.sync to store the count.
 * @param {number} dismissed - The number of dismissed jobs to add to the count.
 * @returns {number} - The total number of dismissed jobs.
 */
function dismissedCount(dismissed) {
  console.log('dismissedCount function called with:', dismissed);
  if (dismissed && dismissed > 0) {
    chrome.storage.sync.get(['dismissed'], ({ dismissed: currentDismissed }) => {
      const newDismissed = currentDismissed ? currentDismissed + dismissed : dismissed;
      chrome.storage.sync.set({ dismissed: newDismissed }, () => {
        return newDismissed;
      });
    });
  }
  return dismissed;
}

function dismissJobs(companiesToDismiss, titlesToDismiss) {
  const isRegex = str => str.startsWith('/') && str.endsWith('/');
  function parseRegex(str) {
    const parts = str.split('/');
    const pattern = parts[1];
    const flags = parts[2] || 'i';
    return new RegExp(pattern, flags);
  }

  if (!window.location.href.includes('linkedin.com')) {
    console.error('This script should only run on LinkedIn.com');
    return;
  }

  const jobCards = document.querySelectorAll('.job-card-container');
  let dismissed = 0;

  jobCards.forEach(card => {
    const companyName = card.querySelector('.job-card-container__primary-description').textContent.trim();
    const jobTitle = card.querySelector('.job-card-container__link').textContent.trim();

    const shouldDismiss = companiesToDismiss.some(company => {
      if (isRegex(company)) {
        return parseRegex(company).test(companyName);
      }
      return companyName.toLowerCase().includes(company.toLowerCase());
    }) || titlesToDismiss.some(title => {
      if (isRegex(title)) {
        return parseRegex(title).test(jobTitle);
      }
      return jobTitle.toLowerCase().includes(title.toLowerCase());
    });

    const isJobDismissed = card.classList.contains('job-card-list--is-dismissed');

    if (shouldDismiss && !isJobDismissed) {
      const dismissButton = card.querySelector('button[aria-label^="Dismiss"]');
      if (dismissButton) {
        dismissButton.click();
        dismissed++;

        const observer = new MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            if (mutation.target.classList.contains('job-card-list--is-dismissed')) {
              observer.disconnect();
            }
          });
        });

        observer.observe(card, { attributes: true, attributeFilter: ['class'] });
      }
    }
  });

  if (dismissed > 0) {
    chrome.storage.sync.get(['dismissed'], ({ dismissed: currentDismissed = 0 }) => {
      const newDismissed = currentDismissed + dismissed;
      chrome.storage.sync.set({ dismissed: newDismissed }, () => {
        chrome.runtime.sendMessage({ action: 'updateDismissedCount', count: newDismissed });
      });
    });
  }

  console.log(`Dismissed ${dismissed} job(s)`);
  return dismissed;
}

function updateDismissedCount() {
  chrome.storage.sync.get(['dismissed'], ({ dismissed = 0 }) => {
    const countElement = document.getElementById('dismissedCount');
    if (countElement) {
      countElement.textContent = dismissed;
    }
  });
}

// Add this listener to receive messages from the content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateDismissedCount') {
    updateDismissedCount();
  }
});