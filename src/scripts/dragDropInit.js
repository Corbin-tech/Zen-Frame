// Drag and Drop Initialization Script

// Function to initialize components
function setupDragAndDrop() {
  // First try the global initialization function if available
  if (window.initTaskManagerDragDrop) {
    try {
      if (window.initTaskManagerDragDrop()) {
        return true; // Successfully initialized
      }
    } catch (error) {
      console.error('Error using global init function:', error);
    }
  }
  
  // Fallback to direct component access
  if (!window.Alpine) {
    return false; // Alpine not available yet
  }
  
  const taskComponents = document.querySelectorAll('[x-data="taskManager()"]');
  let initialized = false;
  
  taskComponents.forEach(el => {
    try {
      const component = window.Alpine.$data(el);
      if (component && typeof component.setupDragAndDrop === 'function') {
        component.setupDragAndDrop();
        component.setupComplete = true;
        initialized = true;
      }
    } catch (e) {
      console.error('Error setting up drag and drop:', e);
    }
  });
  
  return initialized;
}

// Wait for Alpine to be ready with exponential backoff
function initWithRetry(maxRetries = 3, delay = 100) {
  let retries = 0;
  
  function attempt() {
    if (setupDragAndDrop()) {
      return; // Successfully initialized
    }
    
    retries++;
    if (retries < maxRetries) {
      // Exponential backoff
      setTimeout(attempt, delay * Math.pow(2, retries - 1));
    }
  }
  
  attempt();
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  initWithRetry(3, 100);
  
  // Also listen for Alpine initialization
  document.addEventListener('alpine:initialized', function() {
    initWithRetry(1); // Just try once after Alpine is explicitly initialized
  });
  
  // Listen for tab changes and task additions - use a debounced handler
  let debounceTimer;
  function debouncedInit() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setupDragAndDrop(), 100);
  }
  
  window.addEventListener('change-tab', debouncedInit);
  document.addEventListener('task-added', debouncedInit);
});

// Export the function to make it available
export { setupDragAndDrop };
