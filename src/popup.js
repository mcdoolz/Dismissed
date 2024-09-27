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

  // Save input to storage
  function saveInput() {
    if (!filterInput.value) {
      console.log("No input to save");
      return;
    }
    const items = filterInput.value.split(/[,;]/).map(item => item.trim()).filter(Boolean);
    // console.log('Items to save:', items);
    const storageKey = filterTypeSelect.value;
    const container = storageKey === 'companies' ? companyTags : titleTags;

    chrome.storage.sync.get([storageKey], (result) => {
      if (!result[storageKey]) {
        result[storageKey] = [];
      }
      const updatedItems = [...new Set([...result[storageKey], ...items])];
      // console.log('Updating storage with:', updatedItems);
      chrome.storage.sync.set({ [storageKey]: updatedItems }, () => {
        // console.log('Storage updated');
        displayTags(updatedItems, container, storageKey);
        filterInput.value = '';
      });
    });
  }

  // Autosave and parse input
  filterInput.addEventListener('input', (e) => {
    // console.log(`Input event fired. Current value: ${filterInput.value}`);
    if (filterInput.value.includes(',') || filterInput.value.includes(';')) {
      saveInput();
    }
  });

  filterInput.addEventListener('blur', () => {
    // console.log('Blur event fired');
    saveInput();
  });

  filterInput.addEventListener('keyup', (e) => {
    // console.log(`Keyup event fired. Key: ${e.key}, Code: ${e.code}`);
    if (e.key === 'Enter' || e.code === 'Enter') {
      saveInput();
    }
  });

  // Function to format the date
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
    // console.log(`Displaying tags for ${storageKey}:`, items);
    container.style.display = 'block';
    // Get the containers parent element and hide it if no items.
    if (!items || items.length === 0) {
      container.parentElement.style.display = 'none';
    } else {
      container.parentElement.style.display = 'block';
    }

    container.innerHTML = '';
    items.forEach(item => {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = item;

      const removeButton = document.createElement('button');
      removeButton.textContent = 'x';
      removeButton.addEventListener('click', () => removeTag(item, storageKey, container));

      tag.appendChild(removeButton);
      container.appendChild(tag);
    });
  }

  // Remove a tag and update storage
  function removeTag(item, storageKey, container) {
    // console.log(`Removing tag: ${item} from ${storageKey}`);
    chrome.storage.sync.get([storageKey], (result) => {
      const items = result[storageKey].filter(storedItem => storedItem !== item);
      chrome.storage.sync.set({ [storageKey]: items }, () => {
        // console.log(`Updated ${storageKey} in storage:`, items);
        displayTags(items, container, storageKey);
      });
    });
  }

  // Display tags for titles and companies.
  chrome.storage.sync.get(['companies', 'titles'], ({ companies = [], titles = [] }) => {
    // console.log('Retrieved companies:', companies);
    // console.log('Retrieved titles:', titles);
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
  if (!window.location.href.includes('linkedin.com')) {
    console.error('This script should only run on LinkedIn.com');
    return;
  }

  const jobCards = document.querySelectorAll('.job-card-container');
  let dismissed = 0;

  jobCards.forEach(card => {
    const companyName = card.querySelector('.job-card-container__primary-description').textContent.trim().toLowerCase();
    const jobTitle = card.querySelector('.job-card-container__link').textContent.trim().toLowerCase();

    const shouldDismiss = companiesToDismiss.some(company => companyName.includes(company.toLowerCase())) ||
      titlesToDismiss.some(title => jobTitle.includes(title.toLowerCase()));
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