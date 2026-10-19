import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

// Alpine directives bind drag and drop when an element is created and
// unbind it when the element is removed, so new tasks need no extra setup.
export function registerTaskDragDrop(Alpine) {
  // x-drag-task="task.id": drag the element by its [data-drag-handle] child
  Alpine.directive('drag-task', (el, { expression }, { evaluate, cleanup }) => {
    const taskId = evaluate(expression);

    cleanup(draggable({
      element: el,
      dragHandle: el.querySelector('[data-drag-handle]'),
      getInitialData: () => ({ taskId }),
      onDragStart: () => el.setAttribute('data-drag-active', 'true'),
      onDrop: () => el.removeAttribute('data-drag-active'),
    }));
  });

  // x-cluster-drop="cluster.id": dropping a task here moves it into the cluster
  Alpine.directive('cluster-drop', (el, { expression }, { evaluate, cleanup }) => {
    const clusterId = evaluate(expression);

    cleanup(dropTargetForElements({
      element: el,
      canDrop: ({ source }) => typeof source.data.taskId === 'string',
      onDragEnter: () => el.classList.add('drop-target-cluster'),
      onDragLeave: () => el.classList.remove('drop-target-cluster'),
      onDrop: ({ source }) => {
        el.classList.remove('drop-target-cluster');
        Alpine.store('todos').moveTask(source.data.taskId, clusterId);
      },
    }));
  });
}
