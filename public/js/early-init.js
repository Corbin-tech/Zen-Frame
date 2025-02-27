// Early initialization script
// This script will run as soon as it's loaded

console.log('Early initialization script loaded');

// Function to initialize drag and drop
function initDragDrop() {
  console.log('Early init: Attempting to initialize drag and drop');
  
  if (window.initTaskManagerDragDrop) {
    console.log('Early init: Found global init function');
    window.initTaskManagerDragDrop();
  } else {
    console.log('Early init: Global function not available yet');
  }
}

// Try immediately
setTimeout(initDragDrop, 100);

// And at various intervals
setTimeout(initDragDrop, 500);
setTimeout(initDragDrop, 1000);
setTimeout(initDragDrop, 2000);

// Also try when document is ready
document.addEventListener('DOMContentLoaded', function() {
  console.log('Early init: DOMContentLoaded event');
  setTimeout(initDragDrop, 100);
  setTimeout(initDragDrop, 300);
});

// Also try when page becomes fully interactive
window.addEventListener('load', function() {
  console.log('Early init: Load event');
  setTimeout(initDragDrop, 100);
  setTimeout(initDragDrop, 300);
});

// Try on any user interaction
document.addEventListener('click', function() {
  console.log('Early init: User interaction');
  initDragDrop();
}, { once: true });

console.log('Early initialization script completed setup');
