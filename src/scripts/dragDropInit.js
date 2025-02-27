// Drag and Drop Initialization Script

// Function to initialize components
function setupDragAndDrop() {
  console.log('setupDragAndDrop called');
  
  // First try the global initialization function if available
  if (window.initTaskManagerDragDrop) {
    console.log('Using global initTaskManagerDragDrop function');
    if (window.initTaskManagerDragDrop()) {
      console.log('Successfully initialized via global function');
      return;
    }
  }
  
  // Fallback to direct component access
  if (!window.Alpine) {
    console.log('Alpine not available yet');
    return;
  }
  
  const taskComponents = document.querySelectorAll('[x-data="taskManager()"]');
  console.log(`Found ${taskComponents.length} task manager components`);
  
  taskComponents.forEach(el => {
    try {
      const component = window.Alpine.$data(el);
      if (component && typeof component.setupDragAndDrop === 'function') {
        console.log('Initializing drag and drop from global script');
        component.setupDragAndDrop();
        component.setupComplete = true;
      }
    } catch (e) {
      console.error('Error setting up drag and drop:', e);
    }
  });
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('DragDropInit: DOM Content Loaded');
  
  // Try multiple times
  setTimeout(setupDragAndDrop, 100);
  setTimeout(setupDragAndDrop, 300);
  setTimeout(setupDragAndDrop, 600);
  
  // Also listen for Alpine initialization
  document.addEventListener('alpine:initialized', function() {
    console.log('Alpine initialized, setting up drag and drop');
    setTimeout(setupDragAndDrop, 100);
  });
  
  // Listen for tab changes
  window.addEventListener('change-tab', function(event) {
    console.log('Tab changed, reinitializing drag and drop');
    setTimeout(setupDragAndDrop, 100);
  });
  
  // Listen for task-added events
  document.addEventListener('task-added', function(event) {
    console.log('Task added event detected in global handler');
    setTimeout(setupDragAndDrop, 100);
  });
});

// Export the function to make it available
export { setupDragAndDrop };
