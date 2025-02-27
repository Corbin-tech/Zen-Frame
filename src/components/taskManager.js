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
      
      // Setup task drop zones (first, as they're the targets)
      this.setupTaskDropZones();
      this.setupClusterDropZones();
      
      // Then setup draggable items
      this.setupTaskDraggables();
      this.setupClusterDraggables();
      
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
      
      // Check if this is a task or a cluster
      const taskEl = document.getElementById(`task-${taskId}`);
      const clusterEl = document.getElementById(`cluster-${taskId}`);
      
      // Initialize the appropriate element
      if (taskEl && !initializedElements.has(taskEl)) {
        console.log('Found task element, setting up:', taskId);
        this.makeTaskDraggable(taskEl);
        this.makeTaskDropTarget(taskEl);
        initializedElements.add(taskEl);
        return true;
      }
      
      if (clusterEl && !initializedElements.has(clusterEl)) {
        console.log('Found cluster element, setting up:', taskId);
        this.makeClusterDraggable(clusterEl);
        initializedElements.add(clusterEl);
        return true;
      }
      
      // If we didn't find the element
      if (!taskEl && !clusterEl) {
        console.log('Element not found in the DOM yet:', taskId);
        return false;
      }
      
      return true;
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
  
  // Make all tasks draggable
  setupTaskDraggables() {
    const taskElements = document.querySelectorAll('[data-task]');
    console.log(`Found ${taskElements.length} task elements to make draggable`);
    taskElements.forEach(taskEl => {
      if (!initializedElements.has(taskEl)) {
        this.makeTaskDraggable(taskEl);
        initializedElements.add(taskEl);
      }
    });
  },
  
  // Make a single task draggable
  makeTaskDraggable(taskEl) {
    try {
      const taskId = taskEl.id.replace('task-', '');
      
      // Set up draggable
      const cleanup = draggable({
        element: taskEl,
        dragHandle: taskEl.querySelector('[data-drag-handle]'),
        getInitialData: () => ({
          id: taskId,
          type: 'task'
        }),
        onDragStart: () => {
          console.log(`Started dragging task: ${taskId}`);
        },
        onDropped: () => {
          console.log(`Dropped task: ${taskId}`);
        }
      });
      
      // Store cleanup function with element ID for targeted cleanup
      cleanup.elementId = taskEl.id;
      this._cleanupFunctions.push(cleanup);
    } catch (e) {
      console.error('Error setting up task draggable:', e);
    }
  },
  
  // Make all clusters draggable
  setupClusterDraggables() {
    const clusterElements = document.querySelectorAll('[data-cluster]');
    console.log(`Found ${clusterElements.length} cluster elements to make draggable`);
    clusterElements.forEach(clusterEl => {
      if (!initializedElements.has(clusterEl)) {
        this.makeClusterDraggable(clusterEl);
        initializedElements.add(clusterEl);
      }
    });
  },
  
  // Make a single cluster draggable
  makeClusterDraggable(clusterEl) {
    try {
      const handle = clusterEl.querySelector('[data-drag-handle]');
      const clusterId = clusterEl.id.replace('cluster-', '');
      
      if (!handle) {
        console.warn(`Cluster ${clusterEl.id} missing drag handle`);
        return;
      }
      
      const cleanup = draggable({
        element: clusterEl,
        dragHandle: handle,
        getInitialData: () => ({
          id: clusterId,
          type: 'cluster'
        }),
        onDragStart: () => {
          console.log(`Started dragging cluster: ${clusterId}`);
        },
        onDropped: () => {
          console.log(`Dropped cluster: ${clusterId}`);
        }
      });
      
      // Store cleanup function with element ID for targeted cleanup
      cleanup.elementId = clusterEl.id;
      this._cleanupFunctions.push(cleanup);
    } catch (e) {
      console.error('Error setting up cluster draggable:', e);
    }
  },
  
  // Set up drop zones for tasks
  setupTaskDropZones() {
    const taskElements = document.querySelectorAll('[data-task]');
    console.log(`Found ${taskElements.length} task elements to make drop targets`);
    taskElements.forEach(taskEl => {
      if (!initializedElements.has(taskEl + '-dropzone')) {
        this.makeTaskDropTarget(taskEl);
        initializedElements.add(taskEl + '-dropzone');
      }
    });
  },
  
  // Make a single task a drop target
  makeTaskDropTarget(taskEl) {
    try {
      const taskId = taskEl.id.replace('task-', '');
      
      if (initializedElements.has(taskEl.id + '-drop')) {
        return;
      }
      
      // Define drop zones with larger detection areas
      const dropZoneSize = 25; // pixels - increased for better detection
      let activeDropZone = null;
      
      const cleanup = dropTargetForElements({
        element: taskEl,
        getData: () => ({ id: taskId, type: 'task' }),
        onDragEnter: ({ location }) => {
          updateDropZone(location);
        },
        onDragLeave: () => {
          clearDropZone();
        },
        onDragMove: ({ location }) => {
          updateDropZone(location);
        },
        onDrop: ({ source }) => {
          const sourceData = source.data;
          const sourceId = sourceData.id;
          
          // Only handle drops if we have an active drop zone and it's not onto itself
          if (activeDropZone && sourceId !== taskId) {
            console.log(`Dropping task ${sourceId} ${activeDropZone} ${taskId}`);
            this.moveTaskRelativeTo(sourceId, taskId, activeDropZone);
          }
          
          clearDropZone();
        }
      });
      
      // Helper to update the drop zone based on mouse position
      const updateDropZone = (location) => {
        const rect = taskEl.getBoundingClientRect();
        const relativeY = location.clientY - rect.top;
        const percentage = relativeY / rect.height * 100;
        
        // Clear existing state
        clearDropZone();
        
        // Determine drop zone with percentage-based detection
        if (percentage <= 40) {
          activeDropZone = 'above';
          taskEl.classList.add('drop-target-above');
        } else if (percentage >= 60) {
          activeDropZone = 'below';
          taskEl.classList.add('drop-target-below');
        } else {
          activeDropZone = null;
        }
      };
      
      // Helper to clear drop zone state
      const clearDropZone = () => {
        taskEl.classList.remove('drop-target-above', 'drop-target-below');
        activeDropZone = null;
      };
      
      this._cleanupFunctions.push(cleanup);
      initializedElements.add(taskEl.id + '-drop');
    } catch (e) {
      console.error('Error setting up task drop target:', e);
    }
  },
  
  // Set up drop zones for clusters
  setupClusterDropZones() {
    const clusterElements = document.querySelectorAll('[data-cluster]');
    console.log(`Found ${clusterElements.length} cluster elements to make drop targets`);
    clusterElements.forEach(clusterEl => {
      try {
        const clusterId = clusterEl.id.replace('cluster-', '');
        
        // Check if this element already has a drop target
        if (initializedElements.has(clusterEl.id + '-drop')) {
          console.log('Cluster already has a drop target:', clusterEl.id);
          return;
        }
        
        // Set up a single drop target for the entire cluster
        const cleanup = dropTargetForElements({
          element: clusterEl,
          getData: () => ({ id: clusterId, type: 'cluster' }),
          onDragEnter: ({ location }) => {
            // Determine where in the cluster the drag entered
            const rect = clusterEl.getBoundingClientRect();
            const relativeY = location.clientY - rect.top;
            const relativePosition = relativeY / rect.height;
            
            // Apply classes based on drag position
            if (relativePosition < 0.25) {
              // Top 25% - drop above
              clusterEl.classList.remove('drop-target-below', 'drop-target-cluster');
              clusterEl.classList.add('drop-target-above');
            } else if (relativePosition > 0.75) {
              // Bottom 25% - drop below
              clusterEl.classList.remove('drop-target-above', 'drop-target-cluster');
              clusterEl.classList.add('drop-target-below');
            } else {
              // Middle 50% - drop into
              clusterEl.classList.remove('drop-target-above', 'drop-target-below');
              clusterEl.classList.add('drop-target-cluster');
            }
          },
          onDragLeave: () => {
            // Clear all indicators
            clusterEl.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
          },
          onDragMove: ({ location }) => {
            // Update indicators as drag moves
            const rect = clusterEl.getBoundingClientRect();
            const relativeY = location.clientY - rect.top;
            const relativePosition = relativeY / rect.height;
            
            if (relativePosition < 0.25) {
              // Top 25% - drop above
              clusterEl.classList.remove('drop-target-below', 'drop-target-cluster');
              clusterEl.classList.add('drop-target-above');
            } else if (relativePosition > 0.75) {
              // Bottom 25% - drop below
              clusterEl.classList.remove('drop-target-above', 'drop-target-cluster');
              clusterEl.classList.add('drop-target-below');
            } else {
              // Middle 50% - drop into
              clusterEl.classList.remove('drop-target-above', 'drop-target-below');
              clusterEl.classList.add('drop-target-cluster');
            }
          },
          onDrop: ({ source, location }) => {
            // Determine drop position
            const rect = clusterEl.getBoundingClientRect();
            const relativeY = location.clientY - rect.top;
            const relativePosition = relativeY / rect.height;
            
            // Get source data
            const sourceData = source.data;
            const sourceId = sourceData.id;
            const sourceType = sourceData.type;
            
            // Clear all indicators
            clusterEl.classList.remove('drop-target-above', 'drop-target-below', 'drop-target-cluster');
            
            // Skip if dragging onto itself
            if (sourceType === 'cluster' && sourceId === clusterId) {
              return;
            }
            
            // Handle drop based on position
            if (relativePosition < 0.25) {
              // Top 25% - drop above
              console.log(`Drop above cluster: ${sourceType} ${sourceId} -> above ${clusterId}`);
              if (sourceType === 'task') {
                this.moveTaskRelativeToCluster(sourceId, clusterId, 'above');
              } else if (sourceType === 'cluster') {
                this.moveClusterRelativeTo(sourceId, clusterId, 'above');
              }
            } else if (relativePosition > 0.75) {
              // Bottom 25% - drop below
              console.log(`Drop below cluster: ${sourceType} ${sourceId} -> below ${clusterId}`);
              if (sourceType === 'task') {
                this.moveTaskRelativeToCluster(sourceId, clusterId, 'below');
              } else if (sourceType === 'cluster') {
                this.moveClusterRelativeTo(sourceId, clusterId, 'below');
              }
            } else {
              // Middle 50% - drop into
              console.log(`Drop into cluster: ${sourceType} ${sourceId} -> into ${clusterId}`);
              if (sourceType === 'task') {
                this.moveTaskToCluster(sourceId, clusterId);
              }
            }
          }
        });
        
        this._cleanupFunctions.push(cleanup);
        initializedElements.add(clusterEl.id + '-drop');
      } catch (e) {
        console.error('Error setting up cluster drop target:', e);
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
  
  moveTaskRelativeToCluster(sourceId, targetId, position) {
    console.log(`Moving task ${sourceId} ${position} cluster ${targetId}`);
    
    // Clone tasks array
    let newTasks = [...this.tasks];
    
    // Find source task
    const sourceIndex = newTasks.findIndex(t => t.id === sourceId);
    
    if (sourceIndex === -1) {
      console.error('Source task not found', sourceId);
      return;
    }
    
    // Remove source task
    const [sourceTask] = newTasks.splice(sourceIndex, 1);
    
    // Find target cluster and its children
    const targetIndex = newTasks.findIndex(t => t.id === targetId);
    
    if (targetIndex === -1) {
      console.error('Target cluster not found', targetId);
      return;
    }
    
    // Find all children of target cluster
    const children = newTasks.filter(t => t.parentId === targetId);
    console.log(`Found ${children.length} children of cluster ${targetId}`);
    
    // Remove all children
    newTasks = newTasks.filter(t => t.parentId !== targetId);
    
    // Insert task before or after cluster
    if (position === 'above') {
      newTasks.splice(targetIndex, 0, sourceTask);
    } else if (position === 'below') {
      newTasks.splice(targetIndex + 1, 0, sourceTask);
    }
    
    // Insert all children after task
    if (position === 'above') {
      newTasks.splice(targetIndex + 1, 0, ...children);
    } else if (position === 'below') {
      newTasks.splice(targetIndex + 2, 0, ...children);
    }
    
    // Update and save
    this.tasks = newTasks;
    Alpine.store('todos').saveTodos();
  },
  
  moveClusterRelativeTo(sourceId, targetId, position) {
    console.log(`Moving cluster ${sourceId} ${position} cluster ${targetId}`);
    
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
    
    // Insert cluster before or after target
    if (position === 'above') {
      newTasks.splice(newTargetIndex, 0, sourceCluster);
    } else if (position === 'below') {
      newTasks.splice(newTargetIndex + 1, 0, sourceCluster);
    }
    
    // Insert all children after cluster
    if (position === 'above') {
      newTasks.splice(newTargetIndex + 1, 0, ...children);
    } else if (position === 'below') {
      newTasks.splice(newTargetIndex + 2, 0, ...children);
    }
    
    // Update and save
    this.tasks = newTasks;
    Alpine.store('todos').saveTodos();
  }
}));
