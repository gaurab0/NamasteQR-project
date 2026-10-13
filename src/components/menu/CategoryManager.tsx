import React, { useState } from 'react';
import { MenuCategory } from '../../types/rbac';
import { Plus, MoreVertical, Edit2, Trash2, Check, X, GripVertical, ArrowLeft, ArrowRight } from 'lucide-react';

interface CategoryManagerProps {
  categories: MenuCategory[];
  selectedCategory: string;
  onSelectCategory: (categoryName: string) => void;
  canManageCategories: boolean;
  onAddCategory?: (name: string) => Promise<any> | void;
  onRenameCategory?: (id: string, newName: string) => Promise<any> | void;
  onDeleteCategory?: (id: string) => Promise<any> | void;
  onReorderCategories?: (reorderedCategories: MenuCategory[]) => Promise<any> | void;
  categoryCounts?: Record<string, number>;
  totalCount?: number;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  canManageCategories,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
  onReorderCategories,
  categoryCounts = {},
  totalCount = 0,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [addingLoading, setAddingLoading] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim() || !onAddCategory) return;
    try {
      setAddingLoading(true);
      await onAddCategory(newCatName.trim());
      setNewCatName('');
      setIsAdding(false);
    } catch (err: any) {
      alert(err.message || 'Failed to add category');
    } finally {
      setAddingLoading(false);
    }
  };

  const handleStartRename = (cat: MenuCategory) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setActiveMenuId(null);
  };

  const handleSaveRename = async (id: string) => {
    if (!editingName.trim() || !onRenameCategory) return;
    try {
      await onRenameCategory(id, editingName.trim());
      setEditingId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to rename category');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setActiveMenuId(null);
    if (!onDeleteCategory) return;
    if (confirm(`Are you sure you want to delete the category "${name}"? Menu items in this category will remain.`)) {
      try {
        await onDeleteCategory(id);
        if (selectedCategory === name) {
          onSelectCategory('All');
        }
      } catch (err: any) {
        alert(err.message || 'Failed to delete category');
      }
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!canManageCategories || editingId) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (draggedIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = async (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === toIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const fromIndex = draggedIndex;
    setDraggedIndex(null);
    setDragOverIndex(null);

    const updated = [...categories];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    if (onReorderCategories) {
      try {
        await onReorderCategories(updated);
      } catch (err: any) {
        console.error('Failed to reorder categories:', err);
      }
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Keyboard / Click Alternative for Reordering (Accessibility & Touch)
  const handleMove = async (fromIndex: number, direction: 'left' | 'right') => {
    const toIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= categories.length) return;
    setActiveMenuId(null);

    const updated = [...categories];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);

    if (onReorderCategories) {
      try {
        await onReorderCategories(updated);
      } catch (err: any) {
        console.error('Failed to move category:', err);
      }
    }
  };

  return (
    <div id="category-manager-container" className="w-full space-y-3">
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center gap-1.5 min-w-max">
          {/* ALL Category button (Fixed at start) */}
          <button
            id="category-tab-all"
            type="button"
            onClick={() => onSelectCategory('All')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
              selectedCategory === 'All'
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
            }`}
          >
            <span>All Items</span>
            {totalCount > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  selectedCategory === 'All'
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {totalCount}
              </span>
            )}
          </button>

          {/* Dynamic Draggable Categories */}
          {categories.map((cat, idx) => {
            const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
            const count = categoryCounts[cat.name.toLowerCase()] || 0;
            const isEditing = editingId === cat.id;
            const isBeingDragged = draggedIndex === idx;
            const isDragOver = dragOverIndex === idx && draggedIndex !== idx;

            if (isEditing) {
              return (
                <div
                  key={cat.id}
                  className="flex items-center gap-1 bg-white border border-indigo-300 rounded-lg px-2 py-1 shadow-xs shrink-0"
                >
                  <input
                    id={`rename-category-${cat.id}`}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="text-xs font-semibold text-zinc-900 focus:outline-hidden w-24"
                    autoFocus
                  />
                  <button
                    id={`save-rename-${cat.id}`}
                    onClick={() => handleSaveRename(cat.id)}
                    className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                    title="Save"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    id={`cancel-rename-${cat.id}`}
                    onClick={() => setEditingId(null)}
                    className="p-0.5 text-zinc-400 hover:bg-zinc-100 rounded cursor-pointer"
                    title="Cancel"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={cat.id}
                draggable={canManageCategories && !editingId}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                className={`relative group flex items-center shrink-0 transition-all ${
                  canManageCategories ? 'cursor-grab active:cursor-grabbing' : ''
                } ${
                  isBeingDragged ? 'opacity-35 scale-95 border-dashed border-amber-400' : ''
                } ${
                  isDragOver ? 'ring-2 ring-amber-500 rounded-lg scale-105 z-10' : ''
                }`}
                title={canManageCategories ? `Drag "${cat.name}" to reorder` : undefined}
              >
                <button
                  id={`category-tab-${cat.id}`}
                  type="button"
                  onClick={() => onSelectCategory(cat.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-zinc-900 text-white shadow-xs'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900'
                  }`}
                >
                  {/* Drag Grip Handle for Categories Manager */}
                  {canManageCategories && (
                    <span
                      className="text-zinc-400 group-hover:text-zinc-600 transition-colors -ml-1 cursor-grab active:cursor-grabbing"
                      title="Drag to reposition category"
                    >
                      <GripVertical className="w-3 h-3" />
                    </span>
                  )}

                  <span>{cat.name}</span>
                  {count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                        isSelected
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>

                {canManageCategories && (
                  <div className="relative">
                    <button
                      id={`category-actions-${cat.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === cat.id ? null : cat.id);
                      }}
                      className={`p-1 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/80 transition ml-0.5 cursor-pointer ${
                        isSelected ? 'text-zinc-300 hover:text-white' : ''
                      }`}
                      title="Category options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {activeMenuId === cat.id && (
                      <div
                        id={`category-menu-dropdown-${cat.id}`}
                        className="absolute left-0 top-full mt-1 w-36 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-30 text-xs"
                      >
                        {idx > 0 && (
                          <button
                            id={`btn-move-left-${cat.id}`}
                            type="button"
                            onClick={() => handleMove(idx, 'left')}
                            className="w-full text-left px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer"
                          >
                            <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Move Left</span>
                          </button>
                        )}
                        {idx < categories.length - 1 && (
                          <button
                            id={`btn-move-right-${cat.id}`}
                            type="button"
                            onClick={() => handleMove(idx, 'right')}
                            className="w-full text-left px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer"
                          >
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Move Right</span>
                          </button>
                        )}
                        <button
                          id={`btn-rename-${cat.id}`}
                          type="button"
                          onClick={() => handleStartRename(cat)}
                          className="w-full text-left px-3 py-1.5 text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Rename</span>
                        </button>
                        <button
                          id={`btn-delete-${cat.id}`}
                          type="button"
                          onClick={() => handleDelete(cat.id, cat.name)}
                          className="w-full text-left px-3 py-1.5 text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Category Button for Admin/Manager */}
          {canManageCategories && !isAdding && (
            <button
              id="btn-add-new-category"
              type="button"
              onClick={() => setIsAdding(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 bg-zinc-50 border border-dashed border-zinc-300 hover:border-zinc-400 hover:bg-zinc-100 transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-zinc-500" />
              <span>Add Category</span>
            </button>
          )}

          {canManageCategories && isAdding && (
            <form onSubmit={handleCreate} className="flex items-center gap-1 bg-white border border-zinc-300 rounded-lg px-2 py-1 shadow-xs shrink-0">
              <input
                id="input-new-category-name"
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name..."
                className="text-xs font-semibold text-zinc-900 focus:outline-hidden w-28"
                autoFocus
              />
              <button
                id="btn-submit-new-category"
                type="submit"
                disabled={addingLoading || !newCatName.trim()}
                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer disabled:opacity-50"
                title="Create"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-cancel-new-category"
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewCatName('');
                }}
                className="p-1 text-zinc-400 hover:bg-zinc-100 rounded cursor-pointer"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
