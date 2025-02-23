export interface Group {
        id: string;
        name: string;
}

export interface GroupManager {
  groups: Group[];
  editingGroupId: string | null;
  editedName: string;
      newGroupName: string;
      _dndCleanup?: () => void;
      persist(): void;
      addGroup(): void;
  startEditing(group: Group): void;
  finishEditing(group: Group): void;
      deleteGroup(groupId: string): void;
      initDragAndDrop(): void;
      init(): void;
}

export type DragHandler = {
  cleanup: () => void;
};

export type DropHandler = {
  cleanup: () => void;
};
