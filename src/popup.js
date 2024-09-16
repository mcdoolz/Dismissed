document.addEventListener('DOMContentLoaded', () => {
  const companyInput = document.getElementById('companyInput');
  const titleInput = document.getElementById('titleInput');
  const companyTags = document.getElementById('companyTags');
  const titleTags = document.getElementById('titleTags');
  const saveButton = document.getElementById('saveButton');
  const clearButton = document.getElementById('clearButton');
  const dismissButton = document.getElementById('dismissButton');

  // Load and display stored companies and titles
  chrome.storage.sync.get(['companies', 'titles'], ({ companies = [], titles = [] }) => {
    displayTags(companies, companyTags, 'companies');
    displayTags(titles, titleTags, 'titles');
  });

  // Save companies and titles
  saveButton.addEventListener('click', () => {
    saveInput(companyInput, 'companies', companyTags);
    saveInput(titleInput, 'titles', titleTags);
  });

  // Clear all data
  clearButton.addEventListener('click', () => {
    chrome.storage.sync.set({ companies: [], titles: [] }, () => {
      companyTags.innerHTML = '';
      titleTags.innerHTML = '';
    });
  });

  // Dismiss jobs on LinkedIn
  dismissButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.storage.sync.get(['companies', 'titles'], ({ companies = [], titles = [] }) => {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: dismissJobs,
          args: [companies, titles],
        });
      });
    });
  });

  // Helper to save input and display tags
  function saveInput(inputElement, key, container) {
    const items = inputElement.value.split(',').map(item => item.trim()).filter(Boolean);
    chrome.storage.sync.set({ [key]: items }, () => {
      displayTags(items, container, key);
      inputElement.value = '';
    });
  }

  // Display tags with remove button
  function displayTags(items, container, storageKey) {
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
    chrome.storage.sync.get([storageKey], (result) => {
      const items = result[storageKey].filter(storedItem => storedItem !== item);
      chrome.storage.sync.set({ [storageKey]: items }, () => displayTags(items, container, storageKey));
    });
  }
});

// This runs in the context of the LinkedIn page
function dismissJobs(companiesToDismiss, titlesToDismiss) {
  const jobCards = document.querySelectorAll('.job-card-container');

  jobCards.forEach(card => {
    const companyName = card.querySelector('.job-card-container__primary-description').textContent.trim().toLowerCase();
    const jobTitle = card.querySelector('.job-card-container__link').textContent.trim().toLowerCase();

    const shouldDismiss = companiesToDismiss.some(company => companyName.includes(company.toLowerCase())) ||
      titlesToDismiss.some(title => jobTitle.includes(title.toLowerCase()));
    const isJobDismissed = card.classList.contains('job-card-list--is-dismissed')

    if (shouldDismiss) {
      if (isJobDismissed) {
        console.log(`Job "${jobTitle}" from ${companyName} is already dismissed`);
        return;
      }
      // Locate the dismiss buttons
      const dismissButton = card.querySelector('button[aria-label^="Dismiss"]');
      if (dismissButton) {
        // Click the dismiss button
        dismissButton.click();

        // Post-validation: Wait for the job to be marked as dismissed
        const observer = new MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            if (mutation.target.classList.contains('job-card-list--is-dismissed')) {
              console.log("Job successfully dismissed.");
              observer.disconnect();  // Stop observing once dismissed
            }
          });
        });

        // Observe changes to the job element
        observer.observe(card, { attributes: true, attributeFilter: ['class'] });
      } else {
        console.log(`Dismiss button not found for job "${jobTitle}" from ${companyName}`);
      }
    }
  });
}
