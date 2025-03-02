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
      // We're only keeping drag functionality for clusters, not for reordering
      this.setupDropZones('cluster', '[data-cluster]', this.handleClusterDrop.bind(this));
      this.setupDraggables('task', '[data-task]');
      
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
  setupDropZones(type, selector, dropHandler) {
    const elements = document.querySelectorAll(selector);
    console.log(`Setting up ${elements.length} ${type} drop zones`);
    
    elements.forEach(element => {
      // Skip if already initialized
      if (initializedElements.has(`${element.id}-drop`)) {
        return;
      }
      
      // Ensure the element has a unique identifier
      const elementId = element.id || 
        (element.dataset.clusterId ? `cluster-${element.dataset.clusterId}` : 
        (element.dataset.taskId ? `task-${element.dataset.taskId}` : 
        `drop-zone-${Math.random().toString(36).substr(2, 9)}`));
      
      // Create drop target with enhanced handling
      this.createDropTarget(element, type, {
        onDragEnter: (args) => {
          // Add visual feedback for drop target
          element.classList.add('drop-target');
          
          // If it's a cluster, add specific cluster drop target class
          if (element.hasAttribute('data-cluster')) {
            element.classList.add('drop-target-cluster');
          }
        },
        onDragLeave: (args) => {
          // Remove drop target classes
          element.classList.remove('drop-target', 'drop-target-cluster');
        },
        onDrop: (args) => {
          // Remove drop target classes
          element.classList.remove('drop-target', 'drop-target-cluster');
          
          // Call the provided drop handler if exists
          if (dropHandler) {
            dropHandler({
              ...args,
              element: element,  // Pass the actual drop target element
              location: {
                type: element.hasAttribute('data-cluster') ? 'cluster' : 'task',
                id: elementId
              }
            });
          }
        }
      });
      
      // Mark as initialized
      initializedElements.add(`${elementId}-drop`);
    });
  },
  
  // Unified method to set up draggables
  setupDraggables(type, selector) {
    const items = document.querySelectorAll(selector);
    console.log(`Setting up ${items.length} ${type} draggables`);
    
    items.forEach(item => {
      // Check if already initialized to avoid duplicates
      if (initializedElements.has(item.id)) {
        return;
      }
      
      // Get the task ID from data attribute
      const taskId = item.dataset.taskId;
      const clusterId = item.dataset.clusterId;
      
      // Set up drag source
      const dragHandles = item.querySelectorAll('[data-drag-handle]');
      if (dragHandles.length > 0) {
        dragHandles.forEach(handle => {
          // Create draggable with handle
          const draggable = this.createDraggable({
            element: item,
            dragHandle: handle,
            data: { type, taskId: taskId || item.id.replace('task-', ''), clusterId },
            onDragStart: () => {
              console.log(`Started dragging ${type} ${taskId || item.id}`);
              document.body.classList.add('dragging-active');
              this.isDragging = true;
            },
            onDragEnd: () => {
              console.log(`Ended dragging ${type} ${taskId || item.id}`);
              document.body.classList.remove('dragging-active');
              this.isDragging = false;
              
              // Force refresh after drag to ensure all handlers are up-to-date
              setTimeout(() => this.setupDragAndDrop(), 50);
            }
          });
          
          console.log(`Set up draggable for ${type} ${taskId || item.id}`);
        });
      } else {
        console.warn(`No drag handles found for ${type} ${item.id}`);
      }
      
      // Mark as initialized
      initializedElements.add(item.id);
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
          onDragEnter: (params) => {
            // Add the drop target class to the container
            container.classList.add('drop-target');
            
            // Check if this is the main container and we're at the top
            if (containerId === 'mainContainer') {
              const rect = container.getBoundingClientRect();
              const relativeY = params.location.clientY - rect.top;
              
              // If we're in the top area, show the top drop indicator
              if (relativeY < 30) {
                container.classList.add('drop-target-top');
                
                // Clear all other indicators
                document.querySelectorAll('.drop-target-above, .drop-target-below')
                  .forEach(el => {
                    el.classList.remove('drop-target-above', 'drop-target-below');
                  });
              }
            }
          },
          onDragLeave: () => {
            container.classList.remove('drop-target', 'drop-target-top');
          },
          onDragMove: (params) => {
            // Update indicators based on position
            this.updateDropZone(container, params.location);
          },
          onDrop: (params) => {
            // Remove all drop target classes
            container.classList.remove('drop-target', 'drop-target-top');
            document.querySelectorAll('.drop-target-above, .drop-target-below, .drop-target-cluster, .drop-target-top')
              .forEach(el => {
                el.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster', 'drop-target-top');
              });
            document.body.classList.remove('dragging-active');
            
            // Get source info
            const sourceId = params.source?.data?.id;
            const sourceType = params.source?.data?.type;
            
            // Skip if not a valid task
            if (!sourceId || sourceType !== 'task') {
              return;
            }
            
            // Check if this is a drop at the top of mainContainer
            if (containerId === 'mainContainer') {
              const rect = container.getBoundingClientRect();
              const relativeY = params.location.clientY - rect.top;
              
              // If we're dropping at the very top (increased to 30px for better usability)
              if (relativeY < 30) {
                // Find the first task in the container
                const firstTask = container.querySelector('[data-task]');
                
                if (firstTask) {
                  const firstTaskId = firstTask.id.replace('task-', '');
                  
                  // Don't try to drop onto self
                  if (sourceId === firstTaskId) {
                    console.log('Dropping onto self, ignoring');
                    return;
                  }
                  
                  console.log(`Dropping task at the top: ${sourceId} -> above ${firstTaskId}`);
                  
                  // Move the task above the first task
                  this.moveTaskRelativeTo(sourceId, firstTaskId, 'above');
                  
                  // Force refresh
                  setTimeout(() => {
                    this.setupDragAndDrop();
                  }, 100);
                  
                  return;
                } else {
                  // If there are no tasks, just add to container
                  console.log(`Drop task into empty container: ${sourceId}`);
                  this.removeTaskFromCluster(sourceId);
                  return;
                }
              }
            }
            
            // Standard container drop handling
            console.log(`Drop task into container: ${sourceId}`);
            this.removeTaskFromCluster(sourceId);
            
            // Force refresh
            setTimeout(() => {
              this.setupDragAndDrop();
            }, 100);
          }
        });
        
        this._cleanupFunctions.push(cleanup);
        initializedElements.add(containerId + '-drop');
        initializedElements.add(containerId);
      } catch (e) {
        console.error('Error setting up container drop target:', e);
      }
    });
  },
  
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
    
    try {
      // Access the Alpine.js store
      const store = window.Alpine.store('todos');
      
      // Update the parentId of the task to point to the cluster
      store.setParentId(taskId, clusterId);
      
      // Notify that the task has been moved
      document.dispatchEvent(new CustomEvent('task-moved', { 
        detail: { taskId, targetId: clusterId, position: 'into' } 
      }));
      
      // Force refresh drag and drop bindings after a short delay
      setTimeout(() => {
        this.setupDragAndDrop();
      }, 100);
      
    } catch (error) {
      console.error('Error moving task to cluster:', error);
    }
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
      // Clear any previous top container indicator
      const mainContainer = document.getElementById('mainContainer');
      if (mainContainer) {
        mainContainer.classList.remove('drop-target-top');
      }
      
      // Special check for the top of the container - this needs to happen first
      if (mainContainer) {
        const containerRect = mainContainer.getBoundingClientRect();
        const relativeY = location.clientY - containerRect.top;
        
        // If we're near the top of the container (expanded to 30px)
        if (relativeY < 30) {
          // Find the first task
          const firstTask = mainContainer.querySelector('[data-task]');
          
          // Only show the indicator if there's a task and we're not dragging the first task
          if (firstTask) {
            const draggedElement = document.querySelector('[data-drag-active="true"]');
            if (draggedElement && draggedElement.id !== firstTask.id) {
              mainContainer.classList.add('drop-target-top');
              
              // Clear all other indicators
              document.querySelectorAll('.drop-target-above, .drop-target-below')
                .forEach(el => {
                  el.classList.remove('drop-target-above', 'drop-target-below');
                });
              
              return; // Exit early since we're showing the top indicator
            }
          }
        }
      }
      
      // Get the current dragged element
      const draggedElement = document.querySelector('[data-drag-active="true"]');
      
      // Check if we're dragging to the same position
      if (draggedElement && element.hasAttribute('data-task')) {
        const draggedId = draggedElement.id;
        const targetId = element.id;
        
        // Get dimensions to calculate drop position
        const rect = element.getBoundingClientRect();
        const relativeY = location.clientY - rect.top;
        const percentage = relativeY / rect.height * 100;
        
        // Determine which indicator would be shown
        let wouldShowAbove = percentage <= 30;
        let wouldShowBelow = percentage > 30;
        
        // For special cases like the first task, expand the "above" zone
        const isFirstTask = !element.previousElementSibling || 
          (element.previousElementSibling && !element.previousElementSibling.hasAttribute('data-task'));
          
        if (isFirstTask && percentage <= 40) {
          wouldShowAbove = true;
          wouldShowBelow = false;
        }
        
        // Check all cases where we should NOT show an indicator:
        
        // Case 1: Dragging task 3 to position above task 3 itself
        const isAboveSelf = 
          wouldShowAbove && 
          draggedId === targetId;
        
        // Case 2: Dragging task 2 to position below task 2 itself
        const isBelowSelf = 
          wouldShowBelow && 
          draggedId === targetId;
        
        // Case 3: Dragging task 2 to position above task 3, when task 2 is already above task 3
        const isAlreadyAboveTarget = 
          wouldShowAbove && 
          element.previousElementSibling && 
          element.previousElementSibling.id === draggedId;
        
        // Case 4: Dragging task 3 to position below task 2, when task 3 is already below task 2
        const isAlreadyBelowTarget = 
          wouldShowBelow && 
          element.nextElementSibling && 
          element.nextElementSibling.id === draggedId;
        
        // If any of these cases are true, we're trying to drag to the current position
        if (isAboveSelf || isBelowSelf || isAlreadyAboveTarget || isAlreadyBelowTarget) {
          element.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
          return;
        }
      }
      
      // Get dimensions to calculate drop position
      const rect = element.getBoundingClientRect();
      const relativeY = location.clientY - rect.top;
      const percentage = relativeY / rect.height * 100;
      
      console.log(`Drop zone: ${percentage.toFixed(1)}% of height ${rect.height}px for ${element.id}`);
      
      // Mark the entire document as dragging for animation effects
      document.body.classList.add('dragging-active');
      
      // Remove existing drop target indicators
      element.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
      
      // Special handling for clusters
      if (element.hasAttribute('data-cluster')) {
        // For clusters, use three zones: above, into, below
        if (percentage <= 25) {
          element.classList.add('drop-target-above');
        } else if (percentage >= 75) {
          element.classList.add('drop-target-below');
        } else {
          element.classList.add('drop-target-cluster');
        }
      } else {
        // For tasks, just use above or below
        // Special handling for first task in container
        const isFirstTask = !element.previousElementSibling || 
          (element.previousElementSibling && !element.previousElementSibling.hasAttribute('data-task'));
          
        // Expanded the "above" zone for the first task to make it easier to hit
        if ((isFirstTask && percentage <= 40) || percentage <= 30) {
          element.classList.add('drop-target-above');
        } else {
          // Handle both middle and bottom as "below"
          element.classList.add('drop-target-below');
        }
      }
    } catch (e) {
      console.error('Error updating drop zone:', e);
    }
  },
  
  // Modified to only handle dropping tasks into clusters
  handleTaskDrop({ source, location, element }) {
    // Remove all temporary classes first
    this.removeAllDropTargetClasses();
    
    // If there's no source information or no element, ignore
    if (!source || !source.data || !element) {
      console.log('Missing source or element data');
      return;
    }
    
    try {
      // Get the IDs from the data attributes
      const sourceId = source.data.taskId;
      const targetId = element.dataset.taskId || element.dataset.clusterId;
      
      if (!sourceId || !targetId) {
        console.log('Missing source or target IDs');
        return;
      }
      
      // Determine drop location type
      const isTargetCluster = element.hasAttribute('data-cluster') || 
                              location.type === 'cluster' || 
                              element.closest('[data-cluster]') !== null;
      
      if (isTargetCluster) {
        // Ensure we get the correct cluster ID
        const actualClusterId = element.dataset.clusterId || 
                                (element.closest('[data-cluster]')?.dataset.clusterId);
        
        if (actualClusterId) {
          // Move task into cluster
          console.log(`Moving task ${sourceId} into cluster ${actualClusterId}`);
          this.moveTaskToCluster(sourceId, actualClusterId);
          return;
        }
      }
      
      // If not a cluster drop, fallback to default task movement
      console.log(`Dropping task ${sourceId} near task ${targetId}`);
      this.moveTaskRelativeTo(sourceId, targetId, 'after');
      
    } catch (e) {
      console.error('Error in handleTaskDrop:', e);
    }
  },
  
  // Handler for cluster drops
  handleClusterDrop({ source, location, element }) {
    // Remove temporary classes
    this.removeAllDropTargetClasses();
    
    if (!source || !source.data || !element) {
      console.log('Missing source or element data');
      return;
    }
    
    try {
      // Get task and cluster IDs
      const sourceTaskId = source.data.taskId;
      const targetClusterId = element.dataset.clusterId;
      
      if (!sourceTaskId || !targetClusterId) {
        console.log('Missing task or cluster IDs');
        return;
      }
      
      // Move the task to the cluster
      console.log(`Moving task ${sourceTaskId} into cluster ${targetClusterId}`);
      this.moveTaskToCluster(sourceTaskId, targetClusterId);
      
    } catch (e) {
      console.error('Error handling cluster drop:', e);
    }
  },
  
  // Helper function for drag source initialization
  createDraggable(options) {
    const id = options.element.id.replace(`${options.type}-`, '');
    const dragHandle = options.element.querySelector('[data-drag-handle]');
    
    if (!dragHandle) {
      console.warn(`No drag handle found for ${options.type} ${id}`);
      return;
    }
    
    // Use a drag handle to initialize the drag
    const cleanup = draggable({
      element: options.element,
      dragHandle,
      getInitialData: () => ({ 
        id, 
        type: options.type,
        element: options.element
      }),
      onDragStart: () => {
        // Add drag active state to the element
        options.element.setAttribute('data-drag-active', 'true');
        
        // Add a class to the body for global styling during drag
        document.body.classList.add('dragging-active');
        
        // Set global flag
        this.isDragging = true;
        
        // Clear any existing drop targets
        document.querySelectorAll('.drop-target-above, .drop-target-below, .drop-target-cluster, .drop-target-top')
          .forEach(el => {
            el.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster', 'drop-target-top');
          });
        
        console.log(`Started dragging ${options.type}: ${options.element.id}`);
        
        if (options.onDragStart) {
          options.onDragStart();
        }
      },
      onDrop: () => {
        // Remove drag active state from the element
        options.element.removeAttribute('data-drag-active');
        
        // Remove global dragging class
        document.body.classList.remove('dragging-active');
        
        // Clear global flag
        this.isDragging = false;
        
        console.log(`Dropped ${options.type}: ${options.element.id}`);
        
        // Clean up any lingering drop target indicators
        document.querySelectorAll(
          '.drop-target-above, .drop-target-below, .drop-target-cluster, ' + 
          '.drop-target, .drop-target-top, .drag-over-top, .drag-over-bottom'
        ).forEach(el => {
          el.classList.remove(
            'drop-target-above', 
            'drop-target-below', 
            'drop-target-cluster', 
            'drop-target',
            'drop-target-top',
            'drag-over-top',
            'drag-over-bottom'
          );
        });
        
        if (options.onDrop) {
          options.onDrop();
        }
        
        // Force reinitialization of draggables and drop targets
        setTimeout(() => {
          this.setupDragAndDrop();
        }, 50);
      }
    });
    
    this._cleanupFunctions.push(cleanup);
    initializedElements.add(`${options.element.id}-drag`);
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
  
  removeAllDropTargetClasses() {
    document.querySelectorAll('.drop-target-above, .drop-target-below, .drop-target-cluster, .drop-target-top')
      .forEach(el => {
        el.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster', 'drop-target-top');
      });
  },
}));
