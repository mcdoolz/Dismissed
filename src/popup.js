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

  // Dismiss jobs on LinkedIn
  dismissButton.addEventListener('click', () => {
    // console.log('Dismiss button clicked');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.storage.sync.get(['companies', 'titles'], ({ companies = [], titles = [] }) => {
        // console.log('Dismissing jobs with:', { companies, titles });
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
  });

});

// This runs in the context of the LinkedIn page
function dismissJobs(companiesToDismiss, titlesToDismiss) {
  // console.log('dismissJobs function called with:', { companiesToDismiss, titlesToDismiss });
  const jobCards = document.querySelectorAll('.job-card-container');
  // console.log(`Found ${jobCards.length} job cards`);

  jobCards.forEach(card => {
    const companyName = card.querySelector('.job-card-container__primary-description').textContent.trim().toLowerCase();
    const jobTitle = card.querySelector('.job-card-container__link').textContent.trim().toLowerCase();
    // console.log(`Checking job: "${jobTitle}" at ${companyName}`);

    const shouldDismiss = companiesToDismiss.some(company => companyName.includes(company.toLowerCase())) ||
      titlesToDismiss.some(title => jobTitle.includes(title.toLowerCase()));
    const isJobDismissed = card.classList.contains('job-card-list--is-dismissed')

    if (shouldDismiss) {
      if (isJobDismissed) {
        // console.log(`Job "${jobTitle}" from ${companyName} is already dismissed`);
        return;
      }
      // Locate the dismiss buttons
      const dismissButton = card.querySelector('button[aria-label^="Dismiss"]');
      if (dismissButton) {
        // console.log(`Dismissing job: "${jobTitle}" from ${companyName}`);
        // Click the dismiss button
        dismissButton.click();

        // Post-validation: Wait for the job to be marked as dismissed
        const observer = new MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            if (mutation.target.classList.contains('job-card-list--is-dismissed')) {
              // console.log(`Job "${jobTitle}" from ${companyName} successfully dismissed`);
              observer.disconnect();  // Stop observing once dismissed
            }
          });
        });

        // Observe changes to the job element
        observer.observe(card, { attributes: true, attributeFilter: ['class'] });
      } else {
        console.error(`Dismiss button not found for job "${jobTitle}" from ${companyName}`);
      }
    }
    // Else do nothing.
  });
}