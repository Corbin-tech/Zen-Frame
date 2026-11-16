import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

// Alpine directives bind drag and drop when an element is created and
// unbind it when the element is removed, so new tasks need no extra setup.
export function registerTaskDragDrop(Alpine) {
  // x-drag-task="task.id": drag the element, by its [data-drag-handle] child if it has one
  Alpine.directive('drag-task', (el, { expression }, { evaluate, cleanup }) => {
    const taskId = evaluate(expression);

    cleanup(draggable({
      element: el,
      dragHandle: el.querySelector('[data-drag-handle]') ?? undefined,
      getInitialData: () => ({ taskId }),
      onDragStart: () => el.setAttribute('data-drag-active', 'true'),
      onDrop: () => el.removeAttribute('data-drag-active'),
    }));
  });

  // x-task-drop="expression": runs the expression with $taskId and $clientY when a task is dropped.
  // While a task is over the element it has [data-drop-active] and gets
  // "task-dragover" ({ clientY }) and "task-dragleave" events.
  Alpine.directive('task-drop', (el, { expression }, { evaluateLater, cleanup }) => {
    const onDrop = evaluateLater(expression);
    const clientYOf = (location) => location.current.input.clientY;
    const leave = () => {
      el.removeAttribute('data-drop-active');
      el.dispatchEvent(new CustomEvent('task-dragleave'));
    };

    cleanup(dropTargetForElements({
      element: el,
      canDrop: ({ source }) => typeof source.data.taskId === 'string',
      onDrag: ({ location }) => {
        el.setAttribute('data-drop-active', '');
        el.dispatchEvent(new CustomEvent('task-dragover', { detail: { clientY: clientYOf(location) } }));
      },
      onDragLeave: leave,
      onDrop: ({ source, location }) => {
        leave();
        onDrop(() => {}, { scope: { $taskId: source.data.taskId, $clientY: clientYOf(location) } });
      },
    }));
  });
}
