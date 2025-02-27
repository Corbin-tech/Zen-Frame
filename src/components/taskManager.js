import { 
  draggable, 
  dropTargetForElements,
  monitorForElements 
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import Alpine from 'alpinejs';

// Global flag to track if initialization has been done
let globalInitComplete = false;

// Keep track of elements that have been initialized for drag and drop
const initializedElements = new Set();

// Add a document-level listener to ensure initialization happens
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOMContentLoaded - ensuring drag and drop setup');
  setTimeout(() => {
    // Force reinitialize any existing task manager components
    document.querySelectorAll('[x-data="taskManager"]').forEach(el => {
      const component = Alpine.$data(el);
      if (component && typeof component.setupDragAndDrop === 'function') {
        console.log('Forcing initialization from DOMContentLoaded handler');
        component.setupDragAndDrop();
        component.setupComplete = true;
      }
    });
    globalInitComplete = true;
  }, 500); // Increased timeout for more reliable initialization
});

// Make the task manager setup function globally available for external scripts
window.initTaskManagerDragDrop = function() {
  console.log('Global initTaskManagerDragDrop called');
  const taskManagerEl = document.querySelector('[x-data="taskManager"]');
  if (taskManagerEl) {
    try {
      const component = Alpine.$data(taskManagerEl);
      if (component && typeof component.setupDragAndDrop === 'function') {
        console.log('Setting up drag and drop via global function');
        component.setupDragAndDrop();
        component.setupComplete = true;
        return true;
      }
    } catch (e) {
      console.error('Error initializing via global function:', e);
    }
  }
  return false;
};

// Register component
Alpine.data('taskManager', () => ({
  // Use a getter to make tasks reactive
  get tasks() {
    return Alpine.store('todos').items;
  },
  isDragging: false,
  setupComplete: false,
  
  init() {
    if (this._initialized) return;
    this._initialized = true;
    
    console.log('Task manager initialized');
    
    // Add helper method to Alpine store for getting sorted items
    if (window.Alpine && window.Alpine.store('todos')) {
      window.Alpine.store('todos').getSortedItems = function() {
        console.log('getSortedItems called, items:', this.items.length);
        
        // Debug output to see what items we have
        this.items.forEach(item => {
          console.log(`Item ${item.id}: isCluster=${item.isCluster}, parentId=${item.parentId}, section=${item.section}, todo=${item.todo}`);
        });
        
        // Return all root items (clusters and unclustered tasks) in order
        // Make sure to include tasks in the mainContainer section
        return this.items.filter(item => 
          (item.isCluster === true) || 
          (!item.isCluster && !item.parentId) ||
          (!item.isCluster && item.section === 'mainContainer')
        );
      };
    }
    
    // Initial setup
    this.$nextTick(() => {
      this.setupDragAndDrop();
      this.setupComplete = true;
      
      // Set up mutation observer to detect new tasks/clusters
      this.setupMutationObserver();
    });
    
    // Watch for changes to the tasks array
    this.$watch('tasks', (newTasks, oldTasks) => {
      console.log('Tasks changed:', newTasks.length, 'vs', oldTasks ? oldTasks.length : 'none');
      
      // Only update if we have new tasks that weren't there before
      if (newTasks.length > (oldTasks ? oldTasks.length : 0)) {
        console.log('New tasks detected, updating drag and drop');
        
        // Find the new task(s)
        const newTaskIds = newTasks
          .filter(task => !oldTasks || !oldTasks.find(t => t.id === task.id))
          .map(task => task.id);
          
        console.log('New task IDs:', newTaskIds);
        
        // Set up just the new tasks with a delay to ensure DOM is updated
        // Use multiple attempts with increasing delays to ensure it works
        newTaskIds.forEach(taskId => {
          // Try immediately
          setTimeout(() => this.setupSingleTask(taskId), 50);
          // Try again after a short delay
          setTimeout(() => this.setupSingleTask(taskId), 200);
          // Try again after a longer delay
          setTimeout(() => this.setupSingleTask(taskId), 500);
          // Final attempt with a very long delay
          setTimeout(() => this.setupSingleTask(taskId), 1000);
        });
      }
    });
    
    // Set up event listeners
    this.setupEventListeners();
    this.initDragAndDropListeners();
  },
  
  // Set up a mutation observer to watch for new elements
  setupMutationObserver() {
    // Create a mutation observer to watch for new elements
    const observer = new MutationObserver((mutations) => {
      let needsSetup = false;
      
      // Check if any new task or cluster elements were added
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if it's a task or cluster element
              if (node.matches('[data-task]') || node.matches('[data-cluster]')) {
                needsSetup = true;
              } else {
                // Check for child elements that might be tasks or clusters
                const tasks = node.querySelectorAll('[data-task]');
                const clusters = node.querySelectorAll('[data-cluster]');
                if (tasks.length > 0 || clusters.length > 0) {
                  needsSetup = true;
                }
              }
            }
          });
        }
      });
      
      // If we found new elements, set them up
      if (needsSetup) {
        console.log('Mutation observer detected new elements, setting up drag and drop');
        this.setupDragAndDrop();
      }
    });
    
    // Start observing the entire component
    observer.observe(this.$el, {
      childList: true,
      subtree: true
    });
    
    // Store the observer to clean it up later if needed
    this._observer = observer;
  },
  
  // Set up event listeners
  setupEventListeners() {
    // Listen for task-added events
    document.addEventListener('task-added', (event) => {
      console.log('task-added event received', event.detail);
      
      // Try multiple times with increasing delays to ensure the element is found
      if (event.detail && event.detail.taskId) {
        const taskId = event.detail.taskId;
        
        // Try immediately
        setTimeout(() => this.setupSingleTask(taskId), 50);
        // Try again after a short delay
        setTimeout(() => this.setupSingleTask(taskId), 200);
        // Try again after a medium delay
        setTimeout(() => this.setupSingleTask(taskId), 500);
        // Final attempt with a very long delay
        setTimeout(() => this.setupSingleTask(taskId), 1000);
      } else {
        // If no specific ID, do a full setup with multiple attempts
        setTimeout(() => this.setupDragAndDrop(), 100);
        setTimeout(() => this.setupDragAndDrop(), 500);
      }
    });
    
    // Listen for task-moved events
    document.addEventListener('task-moved', (event) => {
      console.log('task-moved event received', event.detail);
      // Refresh drag and drop after task movement
      setTimeout(() => {
        this.setupDragAndDrop();
      }, 200);
    });
  },
  
  // Set up drag and drop event listeners
  initDragAndDropListeners() {
    console.log('Initializing drag and drop event listeners');
    
    // Listen for when DOM is updated
    document.addEventListener('task-added', (event) => {
      console.log('task-added event received', event.detail);
      // Set up the new task for drag and drop
      const taskId = event.detail.id;
      if (taskId) {
        // Allow slight delay for DOM to update
        setTimeout(() => {
          this.setupSingleTask(taskId);
        }, 50);
      }
    });
    
    // Listen for task updates that require refreshing drag and drop
    document.addEventListener('task-updated', (event) => {
      console.log('task-updated event received', event.detail);
      // Check if we need to refresh drag and drop
      if (event.detail.id && event.detail.refresh) {
        this.setupSingleTask(event.detail.id);
      }
    });
    
    // Task moved events
    document.addEventListener('task-moved', (event) => {
      console.log('task-moved event received', event.detail);
      // Refresh drag and drop after task movement
      setTimeout(() => {
        this.setupDragAndDrop();
      }, 200);
    });
  },
  
  // Store cleanup functions
  _cleanupFunctions: [],
  
  // Alias for setupDragAndDrop to maintain compatibility
  initializeDragAndDrop() {
    this.setupDragAndDrop();
  },
  
  // Main drag and drop setup
  setupDragAndDrop() {
    try {
      console.log('Setting up drag and drop');
      
      // First, clean up any existing handlers to avoid duplicates
      this.cleanupDragAndDrop();
      initializedElements.clear();
      
      // Set up global monitoring
      this.setupMonitoring();
      
      // Set up drop zones and draggables using unified methods
      this.setupDropZones('task', '[data-task]', this.handleTaskDrop.bind(this));
      this.setupDropZones('cluster', '[data-cluster]', this.handleClusterDrop.bind(this));
      this.setupDraggables('task', '[data-task]');
      this.setupDraggables('cluster', '[data-cluster]');
      
      // Set up containers as drop targets
      this.setupContainerDropZones();
      
      // Mark as completed
      this.setupComplete = true;
      
      // Log available tasks for debugging
      this.logTaskElements();
      
      console.log('Drag and drop setup complete!');
      
      // Add data attribute to indicate completed setup
      const container = document.querySelector('[data-drag-drop-container]');
      if (container) {
        container.setAttribute('data-drag-drop-ready', 'true');
      }
      
      // Dispatch event to notify that drag and drop is set up
      document.dispatchEvent(new CustomEvent('drag-drop-ready'));
      
      return true;
    } catch (error) {
      console.error('Error setting up drag and drop:', error);
      return false;
    }
  },
  
  // Helper function to log available task elements for debugging
  logTaskElements() {
    const taskElements = document.querySelectorAll('[data-task]');
    console.log(`Found ${taskElements.length} task elements:`);
    taskElements.forEach(el => {
      console.log(`- Task: ${el.id}`);
    });
    
    const taskIds = this.tasks.map(task => task.id);
    console.log('Task IDs in store:', taskIds);
  },
  
  // Clean up handlers
  cleanupDragAndDrop() {
    if (this._cleanupFunctions.length) {
      console.log(`Cleaning up ${this._cleanupFunctions.length} previous handlers`);
      this._cleanupFunctions.forEach(cleanup => cleanup());
      this._cleanupFunctions = [];
    }
  },
  
  // Set up a single task for drag and drop
  setupSingleTask(taskId) {
    try {
      console.log('Setting up single task or cluster:', taskId);
      
      if (!taskId) {
        console.warn('Invalid ID passed to setupSingleTask');
        return false;
      }
      
      // Check if this is a task or a cluster
      const taskEl = document.getElementById(`task-${taskId}`);
      const clusterEl = document.getElementById(`cluster-${taskId}`);
      
      let initialized = false;
      
      // Initialize as task if needed
      if (taskEl && !initializedElements.has(`task-${taskId}-drag`)) {
        console.log('Found task element, setting up:', taskId);
        this.createDraggable(taskEl, 'task', {
          onDragStart: () => this.isDragging = true,
          onDrop: () => this.isDragging = false
        });
        this.createDropTarget(taskEl, 'task', {
          onDrop: this.handleTaskDrop.bind(this)
        });
        initialized = true;
      }
      
      // Initialize as cluster if needed
      if (clusterEl && !initializedElements.has(`cluster-${taskId}-drag`)) {
        console.log('Found cluster element, setting up:', taskId);
        this.createDraggable(clusterEl, 'cluster', {
          onDragStart: () => this.isDragging = true,
          onDrop: () => this.isDragging = false
        });
        this.createDropTarget(clusterEl, 'cluster', {
          onDrop: this.handleClusterDrop.bind(this)
        });
        initialized = true;
      }
      
      // If we didn't find the element
      if (!taskEl && !clusterEl) {
        console.log('Element not found in the DOM yet:', taskId);
        return false;
      }
      
      return initialized;
    } catch (error) {
      console.error('Error setting up single task:', error);
      return false;
    }
  },
  
  // Set up global monitoring for drag operations
  setupMonitoring() {
    const cleanup = monitorForElements({
      onDrag: ({ source }) => {
        this.isDragging = true;
        console.log('Started dragging:', source.data);
      },
      onDrop: () => {
        this.isDragging = false;
        console.log('Dropped item');
        
        // Clean up any lingering drop target indicators
        document.querySelectorAll('[data-task-item], [data-cluster], [data-droppable], [data-container]')
          .forEach(el => {
            el.classList.remove(
              'drop-target-above', 
              'drop-target-below', 
              'drop-target-cluster', 
              'drop-target',
              'drag-over-top',
              'drag-over-bottom'
            );
            
            // Reset margins that were added by CSS classes
            el.style.marginTop = '';
            el.style.marginBottom = '';
          });
      }
    });
    
    this._cleanupFunctions.push(cleanup);
  },
  
  // Unified method to set up drop zones
  setupDropZones(type, selector, onDrop) {
    const elements = document.querySelectorAll(selector);
    console.log(`Found ${elements.length} ${type} elements to make drop targets`);
    elements.forEach(element => {
      if (!initializedElements.has(`${element.id}-drop`)) {
        try {
          this.createDropTarget(element, type, { onDrop });
          initializedElements.add(`${element.id}-drop`);
          console.log(`Successfully made ${type} drop target: ${element.id}`);
        } catch (e) {
          console.error(`Error creating ${type} drop target: ${element.id}`, e);
        }
      }
    });
  },
  
  // Unified method to set up draggables
  setupDraggables(type, selector) {
    const elements = document.querySelectorAll(selector);
    console.log(`Found ${elements.length} ${type} elements to make draggable`);
    elements.forEach(element => {
      if (!initializedElements.has(`${element.id}-drag`)) {
        try {
          this.createDraggable(element, type, {
            onDragStart: () => this.isDragging = true,
            onDrop: () => this.isDragging = false
          });
          initializedElements.add(`${element.id}-drag`);
          console.log(`Successfully made ${type} draggable: ${element.id}`);
        } catch (e) {
          console.error(`Error making ${type} draggable: ${element.id}`, e);
        }
      }
    });
  },
  
  // Set up containers as drop targets
  setupContainerDropZones() {
    const containers = document.querySelectorAll('[data-container]');
    console.log(`Found ${containers.length} containers to make drop targets`);
    
    containers.forEach(container => {
      try {
        const containerId = container.id || 'main-container';
        
        // Check if this container already has a drop target
        if (initializedElements.has(containerId + '-drop')) {
          console.log('Container already has a drop target:', containerId);
          return;
        }
        
        const cleanup = dropTargetForElements({
          element: container,
          getData: () => ({ id: containerId, type: 'container' }),
          onDragEnter: () => {
            // Only add the drop target class to the container itself
            // when dragging over empty space or between tasks
            container.classList.add('drop-target');
          },
          onDragLeave: () => {
            container.classList.remove('drop-target');
          },
          onDrop: ({ source }) => {
            // Remove all drop target classes
            container.classList.remove('drop-target');
            
            if (source.data.type === 'task') {
              const sourceId = source.data.id;
              console.log(`Drop task directly into container: ${sourceId} -> ${containerId}`);
              
              // Remove task from any clusters
              this.removeTaskFromCluster(sourceId);
            }
          }
        });
        
        this._cleanupFunctions.push(cleanup);
        initializedElements.add(containerId + '-drop');
        initializedElements.add(containerId); // Add tracking for initialized container elements
      } catch (e) {
        console.error('Error setting up container drop target:', e);
      }
    });
  },
  
  // Handle a task being dropped on a container
  handleTaskDroppedOnContainer(taskId, containerId) {
    // Find parent cluster if any
    const containerEl = document.getElementById(containerId);
    if (!containerEl) return;
    
    const clusterEl = containerEl.closest('[data-cluster]');
    if (clusterEl) {
      const clusterId = clusterEl.id.replace('cluster-', '');
      console.log(`Container is in cluster ${clusterId}`);
      this.moveTaskToCluster(taskId, clusterId);
    } else {
      console.log(`Container is in main container`);
      // Dropped in main container - remove from any cluster
      this.removeTaskFromCluster(taskId);
    }
  },
  
  // Move a task relative to another task (above or below)
  moveTaskRelativeTo(sourceId, targetId, position) {
    console.log(`Moving task ${sourceId} ${position} task ${targetId}`);
    
    // Use the store's reorderTask method directly
    Alpine.store('todos').reorderTask(sourceId, targetId, position);
    
    // Dispatch event to refresh drag and drop
    document.dispatchEvent(new CustomEvent('task-moved', { 
      detail: { taskId: sourceId, position, targetId } 
    }));
  },
  
  moveClusterAfter(sourceId, targetId) {
    console.log(`Moving cluster ${sourceId} after cluster ${targetId}`);
    
    // Clone tasks array
    let newTasks = [...this.tasks];
    
    // Find source cluster and its children
    const sourceIndex = newTasks.findIndex(t => t.id === sourceId);
    const targetIndex = newTasks.findIndex(t => t.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('Source or target cluster not found', {sourceId, targetId, sourceIndex, targetIndex});
      return;
    }
    
    // Remove source cluster
    const [sourceCluster] = newTasks.splice(sourceIndex, 1);
    
    // Find all children of source cluster
    const children = newTasks.filter(t => t.parentId === sourceId);
    console.log(`Found ${children.length} children of cluster ${sourceId}`);
    
    // Remove all children
    newTasks = newTasks.filter(t => t.parentId !== sourceId);
    
    // Find new target index (after removing source and children)
    const newTargetIndex = newTasks.findIndex(t => t.id === targetId);
    
    // Insert cluster after target
    newTasks.splice(newTargetIndex + 1, 0, sourceCluster);
    
    // Insert all children after cluster
    newTasks.splice(newTargetIndex + 2, 0, ...children);
    
    // Update and save
    this.tasks = newTasks;
    Alpine.store('todos').saveTodos();
  },
  
  moveTaskToCluster(taskId, clusterId) {
    console.log(`Moving task ${taskId} to cluster ${clusterId}`);
    
    // Get the store
    const store = Alpine.store('todos');
    
    // Find task
    const task = store.items.find(t => t.id === taskId);
    
    if (!task) {
      console.error('Task not found', taskId);
      return;
    }
    
    // Check if task is already in this cluster
    if (task.parentId === clusterId) {
      console.log('Task already in this cluster');
      return;
    }
    
    // Update task's parent and section
    store.updateTask(taskId, { 
      parentId: clusterId,
      section: 'cluster'
    });
    
    // Dispatch event to refresh drag and drop
    document.dispatchEvent(new CustomEvent('task-moved', { 
      detail: { taskId, clusterId } 
    }));
  },
  
  removeTaskFromCluster(taskId) {
    console.log(`Removing task ${taskId} from cluster`);
    
    // Get the store
    const store = Alpine.store('todos');
    
    // Find task
    const task = store.items.find(t => t.id === taskId);
    
    if (!task) {
      console.error('Task not found', taskId);
      return;
    }
    
    // If task already has no parent, do nothing
    if (!task.parentId) {
      return;
    }
    
    // Update task to remove parent and set section to mainContainer
    store.updateTask(taskId, { 
      parentId: null,
      section: 'mainContainer'
    });
    
    // Dispatch event to refresh drag and drop
    document.dispatchEvent(new CustomEvent('task-moved', { 
      detail: { taskId } 
    }));
  },
  
  moveTaskRelativeToCluster(sourceId, targetId, position = 'above') {
    console.log(`Moving task ${sourceId} ${position} cluster ${targetId}`);
    
    // Clone tasks array
    let newTasks = [...this.tasks];
    
    // Find source and target
    const sourceIndex = newTasks.findIndex(t => t.id === sourceId);
    const targetIndex = newTasks.findIndex(t => t.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('Source or target not found', {sourceId, targetId, sourceIndex, targetIndex});
      return;
    }
    
    // Remove source from array
    const [sourceTask] = newTasks.splice(sourceIndex, 1);
    
    // Find all children if this is a cluster
    const isSourceCluster = sourceTask.type === 'cluster';
    const children = isSourceCluster ? newTasks.filter(t => t.parentId === sourceId) : [];
    
    // Remove all children
    if (isSourceCluster) {
      newTasks = newTasks.filter(t => t.parentId !== sourceId);
    }
    
    // Get target's children if any
    const targetChildren = newTasks.filter(t => t.parentId === targetId);
    
    // Remove all children of target
    newTasks = newTasks.filter(t => t.parentId !== targetId);
    
    // Insert task before or after cluster
    if (position === 'above') {
      newTasks.splice(targetIndex, 0, sourceTask);
    } else if (position === 'below') {
      newTasks.splice(targetIndex + 1, 0, sourceTask);
    }
    
    // Insert all children after task
    if (isSourceCluster) {
      if (position === 'above') {
        newTasks.splice(targetIndex + 1, 0, ...children);
      } else if (position === 'below') {
        newTasks.splice(targetIndex + 2, 0, ...children);
      }
    }
    
    // Update and save
    this.tasks = newTasks;
    Alpine.store('todos').saveTodos();
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('task-moved', { 
      detail: { taskId: sourceId, position, targetId } 
    }));
  },
  
  moveClusterRelativeTo(sourceId, targetId, position) {
    console.log(`Moving cluster ${sourceId} ${position} cluster ${targetId}`);
    
    // Skip if trying to move onto itself
    if (sourceId === targetId) {
      console.log('Cannot move a cluster relative to itself');
      return;
    }
    
    // Clone tasks array
    let newTasks = [...this.tasks];
    
    // Find source cluster and its children
    const sourceIndex = newTasks.findIndex(t => t.id === sourceId);
    const targetIndex = newTasks.findIndex(t => t.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) {
      console.error('Source or target cluster not found', {sourceId, targetId, sourceIndex, targetIndex});
      return;
    }
    
    // Debug: Log the clusters
    console.log('Source cluster:', newTasks[sourceIndex]);
    console.log('Target cluster:', newTasks[targetIndex]);
    
    // Remove source cluster
    const [sourceCluster] = newTasks.splice(sourceIndex, 1);
    
    // Find all children of source cluster
    const children = newTasks.filter(t => t.parentId === sourceId);
    console.log(`Found ${children.length} children of cluster ${sourceId}:`);
    children.forEach(child => {
      console.log(`- Child ${child.id}: ${child.todo}`);
    });
    
    // Remove all children
    newTasks = newTasks.filter(t => t.parentId !== sourceId);
    
    // Find new target index (after removing source and children)
    const newTargetIndex = newTasks.findIndex(t => t.id === targetId);
    console.log(`New target index: ${newTargetIndex}`);
    
    // Insert cluster before or after target
    if (position === 'above') {
      console.log(`Inserting cluster ${sourceId} above cluster ${targetId} at index ${newTargetIndex}`);
      newTasks.splice(newTargetIndex, 0, sourceCluster);
    } else if (position === 'below') {
      console.log(`Inserting cluster ${sourceId} below cluster ${targetId} at index ${newTargetIndex + 1}`);
      newTasks.splice(newTargetIndex + 1, 0, sourceCluster);
    }
    
    // Insert all children after cluster
    if (position === 'above') {
      console.log(`Inserting ${children.length} children after cluster at index ${newTargetIndex + 1}`);
      newTasks.splice(newTargetIndex + 1, 0, ...children);
    } else if (position === 'below') {
      console.log(`Inserting ${children.length} children after cluster at index ${newTargetIndex + 2}`);
      newTasks.splice(newTargetIndex + 2, 0, ...children);
    }
    
    // Update and save
    console.log('Updating tasks array with new order');
    this.tasks = newTasks;
    Alpine.store('todos').saveTodos();
    
    // Dispatch event
    document.dispatchEvent(new CustomEvent('task-moved', { 
      detail: { taskId: sourceId, position, targetId } 
    }));
  },
  
  // Unified drop zone position updater
  updateDropZone(element, location) {
    if (!element || !location) {
      console.warn('Invalid element or location for updateDropZone');
      return;
    }
    
    try {
      const rect = element.getBoundingClientRect();
      const relativeY = location.clientY - rect.top;
      const percentage = relativeY / rect.height * 100;
      
      console.log(`Drop zone: ${percentage.toFixed(1)}% of height ${rect.height}px for ${element.id}`);
      
      element.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
      
      if (element.hasAttribute('data-cluster')) {
        // For clusters, use three zones: above, into, below
        if (percentage <= 15) {
          element.classList.add('drop-target-above');
        } else if (percentage >= 85) {
          element.classList.add('drop-target-below');
        } else {
          element.classList.add('drop-target-cluster');
        }
      } else {
        // For tasks, just use above or below
        if (percentage <= 30) {
          element.classList.add('drop-target-above');
        } else if (percentage >= 70) {
          element.classList.add('drop-target-below');
        }
      }
    } catch (e) {
      console.error('Error updating drop zone:', e);
      // Clean up all drop zone classes
      element.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
    }
  },
  
  // Default handler for drops when no specific handler is provided
  handleDefaultDrop(element, source, location) {
    // Add null checking
    if (!source || !source.data || !element) {
      console.warn('Drop received with invalid data');
      return;
    }

    const targetId = element.id.replace(/(task|cluster)-/, '');
    const targetType = element.hasAttribute('data-task') ? 'task' : 'cluster';
    const sourceId = source.data.id;
    const sourceType = source.data.type;
    
    // Skip if dropping onto self
    if (sourceId === targetId && sourceType === targetType) {
      console.log('Dropping onto self, ignoring');
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const relativeY = location.clientY - rect.top;
    const percentage = relativeY / rect.height * 100;
    
    if (targetType === 'task') {
      // Task drop targets
      if (percentage <= 30) {
        // Above
        console.log(`Drop above task: ${sourceType} ${sourceId} -> above ${targetId}`);
        this.moveTaskRelativeTo(sourceId, targetId, 'above');
      } else if (percentage >= 70) {
        // Below
        console.log(`Drop below task: ${sourceType} ${sourceId} -> below ${targetId}`);
        this.moveTaskRelativeTo(sourceId, targetId, 'below');
      }
    } else if (targetType === 'cluster') {
      // Cluster drop targets
      if (percentage <= 15) {
        // Above
        console.log(`Drop above cluster: ${sourceType} ${sourceId} -> above ${targetId}`);
        if (sourceType === 'task') {
          this.moveTaskRelativeToCluster(sourceId, targetId, 'above');
        } else if (sourceType === 'cluster') {
          this.moveClusterRelativeTo(sourceId, targetId, 'above');
        }
      } else if (percentage >= 85) {
        // Below
        console.log(`Drop below cluster: ${sourceType} ${sourceId} -> below ${targetId}`);
        if (sourceType === 'task') {
          this.moveTaskRelativeToCluster(sourceId, targetId, 'below');
        } else if (sourceType === 'cluster') {
          this.moveClusterRelativeTo(sourceId, targetId, 'below');
        }
      } else {
        // Into
        console.log(`Drop into cluster: ${sourceType} ${sourceId} -> into ${targetId}`);
        if (sourceType === 'task') {
          this.moveTaskToCluster(sourceId, targetId);
        }
      }
    }
  },
  
  // Handler for task drops
  handleTaskDrop({ source, location, element }) {
    // Add null checking to prevent errors
    if (!source || !source.data) {
      console.warn('Task drop received with no source data');
      return;
    }

    const targetId = element.id.replace('task-', '');
    const sourceId = source.data.id;
    const sourceType = source.data.type;
    
    if (sourceType !== 'task') return;
    if (sourceId === targetId) return;
    
    const rect = element.getBoundingClientRect();
    const relativeY = location.clientY - rect.top;
    const percentage = relativeY / rect.height * 100;
    
    if (percentage <= 30) {
      console.log(`Task drop above: ${sourceId} -> above ${targetId}`);
      this.moveTaskRelativeTo(sourceId, targetId, 'above');
    } else if (percentage >= 70) {
      console.log(`Task drop below: ${sourceId} -> below ${targetId}`);
      this.moveTaskRelativeTo(sourceId, targetId, 'below');
    }
  },
  
  // Handler for cluster drops
  handleClusterDrop({ source, location, element }) {
    // Add null checking to prevent errors
    if (!source || !source.data) {
      console.warn('Cluster drop received with no source data');
      return;
    }

    const targetId = element.id.replace('cluster-', '');
    const sourceId = source.data.id;
    const sourceType = source.data.type;
    
    if (sourceId === targetId && sourceType === 'cluster') return;
    
    const rect = element.getBoundingClientRect();
    const relativeY = location.clientY - rect.top;
    const percentage = relativeY / rect.height * 100;
    
    if (percentage <= 15) {
      // Above cluster
      if (sourceType === 'task') {
        this.moveTaskRelativeToCluster(sourceId, targetId, 'above');
      } else if (sourceType === 'cluster') {
        this.moveClusterRelativeTo(sourceId, targetId, 'above');
      }
    } else if (percentage >= 85) {
      // Below cluster
      if (sourceType === 'task') {
        this.moveTaskRelativeToCluster(sourceId, targetId, 'below');
      } else if (sourceType === 'cluster') {
        this.moveClusterRelativeTo(sourceId, targetId, 'below');
      }
    } else {
      // Into cluster (middle)
      if (sourceType === 'task') {
        this.moveTaskToCluster(sourceId, targetId);
      }
    }
  },
  
  // Helper function for draggable initialization
  createDraggable(element, type, config) {
    try {
      const id = element.id.replace(`${type}-`, '');
      
      // Use different handle selectors for tasks vs clusters
      let dragHandle;
      
      if (type === 'task') {
        // First try to find a specific drag handle
        dragHandle = element.querySelector('[data-task-drag-handle]');
        
        // Fall back to the element itself if needed
        if (!dragHandle) {
          dragHandle = element;
          console.log(`Using task element as its own drag handle: ${id}`);
        }
      } else if (type === 'cluster') {
        // Try specific cluster drag handle
        dragHandle = element.querySelector('[data-cluster-drag-handle]');
        
        // Fall back to general drag handle
        if (!dragHandle) {
          dragHandle = element.querySelector('[data-drag-handle]');
        }
        
        // Last resort, use the element itself
        if (!dragHandle) {
          // Find cluster header as a better drag handle
          dragHandle = element.querySelector('.cluster-header') || element;
          console.log(`Using cluster header as drag handle for: ${id}`);
        }
      }
      
      if (!dragHandle) {
        console.warn(`Could not find drag handle for ${type}: ${id}`);
        return;
      }
      
      // Verify element is in DOM before proceeding
      if (!document.body.contains(element)) {
        console.warn(`Element ${element.id} is not in the DOM, skipping draggable setup`);
        return;
      }
      
      console.log(`Setting up draggable for ${type}: ${id} with drag handle:`, dragHandle);
      
      const cleanup = draggable({
        element,
        dragHandle,
        getInitialData: () => ({ id, type }),
        onDragStart: () => {
          console.log(`Started dragging ${type}: ${id}`);
          element.setAttribute('data-drag-active', 'true');
          document.body.classList.add('is-dragging');
          config.onDragStart?.();
        },
        onDrop: () => {
          console.log(`Dropped ${type}: ${id}`);
          element.removeAttribute('data-drag-active');
          document.body.classList.remove('is-dragging');
          config.onDrop?.();
        }
      });
      
      this._cleanupFunctions.push(cleanup);
      initializedElements.add(`${element.id}-drag`);
    } catch (e) {
      console.error(`Error making ${type} draggable:`, e);
    }
  },
  
  // Helper function for drop target initialization
  createDropTarget(element, type, handlers) {
    try {
      const id = element.id.replace(`${type}-`, '');
      
      const cleanup = dropTargetForElements({
        element,
        getData: () => ({ id, type }),
        onDragEnter: (args) => {
          const { location } = args;
          this.updateDropZone(element, location);
          if (handlers.onDragEnter) {
            handlers.onDragEnter(args);
          }
        },
        onDragLeave: (args) => {
          element.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
          if (handlers.onDragLeave) {
            handlers.onDragLeave(args);
          }
        },
        onDragMove: (args) => {
          const { location } = args;
          this.updateDropZone(element, location);
          if (handlers.onDragMove) {
            handlers.onDragMove(args);
          }
        },
        onDrop: (args) => {
          console.log('Drop event received:', { element: element.id, args });
          
          // Common drop zone cleanup
          element.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
          
          // Ensure we have all the required properties before calling handlers
          if (!args || !args.source) {
            console.warn('Drop event missing source data');
            return;
          }

          // If we have a dedicated handler, use it
          if (handlers.onDrop) {
            // Make sure to pass the full args plus element
            handlers.onDrop({
              ...args,
              element
            });
            return;
          }
          
          // Otherwise, use default drop handling
          this.handleDefaultDrop(element, args.source, args.location);
        }
      });
      
      this._cleanupFunctions.push(cleanup);
      initializedElements.add(`${element.id}-drop`);
    } catch (e) {
      console.error(`Error creating ${type} drop target:`, e);
    }
  },
}));
