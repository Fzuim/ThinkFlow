import { useState, useRef, useEffect, useCallback } from "react";
import type { Task, TaskStatus } from "@/stores/taskStore";
import { useTaskStore } from "@/stores/taskStore";
import { useTranslation } from "react-i18next";
import PriorityBadge from "@/components/shared/PriorityBadge";
import CategoryBadge from "@/components/shared/CategoryBadge";
import EnergyLevelIndicator from "@/components/shared/EnergyLevelIndicator";
import TaskEditModal from "@/components/shared/TaskEditModal";
import {
  Calendar,
  Tag,
  User,
  Link,
  ChevronDown,
  ChevronUp,
  Pencil,
  CheckCircle,
  Circle,
  Play,
  Trash2,
  GripVertical,
  Archive,
} from "lucide-react";

interface TaskCardProps {
  task: Task;
  isSelected: boolean;
  isBeingDragged?: boolean;
  onSelect: (id: string | null) => void;
  style?: React.CSSProperties;
}

const statusRingColor: Record<TaskStatus, string> = {
  todo: "#9f927d",
  in_progress: "#889df0",
  done: "#8ac68a",
  archived: "#9f927d",
};

export default function TaskCard({
  task,
  isSelected,
  isBeingDragged,
  onSelect,
  style,
}: TaskCardProps) {
  const { t } = useTranslation();
  const { updateTask, moveTask, deleteTask, tasks } = useTaskStore();
  const parent = tasks.find((item) => item.id === task.parent_id);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setEditModalOpen(true);
      onSelect(task.id);
    },
    [task.id, onSelect]
  );

  const handleEditSave = useCallback(() => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      updateTask(task.id, { title: trimmed });
    }
    setIsEditing(false);
  }, [editTitle, task.id, task.title, updateTask]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleEditSave();
      } else if (e.key === "Escape") {
        setEditTitle(task.title);
        setIsEditing(false);
      }
    },
    [handleEditSave, task.title]
  );

  const isOverdue =
    task.deadline && task.deadline.length > 0 && new Date(task.deadline) < new Date() && task.status !== "done";

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(isSelected ? null : task.id);
    },
    [isSelected, onSelect, task.id]
  );

  // Close other context menus by listening globally, then open this one
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Defer opening to allow global capture-phase listener to close other menus first
    setTimeout(() => {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }, 0);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Adjust menu position to stay within viewport
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({ left: -9999, top: -9999, visibility: "hidden" });
  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current) {
      setMenuStyle({ left: -9999, top: -9999, visibility: "hidden" });
      return;
    }
    // Use RAF to wait for the menu to render, then measure and adjust
    const raf = requestAnimationFrame(() => {
      const menu = contextMenuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const style: React.CSSProperties = {};

      // Default: position at click + 16px right offset
      let left = contextMenu.x + 16;
      let top = contextMenu.y;

      // If menu overflows right edge, flip to left of click
      if (left + rect.width > vw - 8) {
        left = contextMenu.x - rect.width - 8;
      }
      // If menu overflows bottom edge, flip above click
      if (top + rect.height > vh - 8) {
        top = contextMenu.y - rect.height;
      }
      // If still overflows left edge, clamp to viewport
      if (left < 8) left = 8;
      if (top < 8) top = 8;

      style.left = left;
      style.top = top;
      style.visibility = "visible";
      setMenuStyle(style);
    });
    return () => cancelAnimationFrame(raf);
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = (e: Event) => {
      // Close when clicking/right-clicking outside the menu
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
    };
    // Use capture phase so this fires before any card's onContextMenu handler
    document.addEventListener("click", handleClose, true);
    document.addEventListener("contextmenu", handleClose, true);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClose, true);
      document.removeEventListener("contextmenu", handleClose, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu, closeContextMenu]);

  const statusActions: { status: TaskStatus; icon: React.ReactNode; labelKey: string }[] =
    task.status === "todo"
      ? [
          { status: "in_progress", icon: <Play size={14} />, labelKey: "taskBoard.contextMenu.moveToInProgress" },
          { status: "done", icon: <CheckCircle size={14} />, labelKey: "taskBoard.contextMenu.moveToDone" },
          { status: "archived", icon: <Archive size={14} />, labelKey: "taskBoard.contextMenu.moveToArchive" },
        ]
      : task.status === "in_progress"
      ? [
          { status: "todo", icon: <Circle size={14} />, labelKey: "taskBoard.contextMenu.moveToTodo" },
          { status: "done", icon: <CheckCircle size={14} />, labelKey: "taskBoard.contextMenu.moveToDone" },
          { status: "archived", icon: <Archive size={14} />, labelKey: "taskBoard.contextMenu.moveToArchive" },
        ]
      : task.status === "done"
      ? [
          { status: "todo", icon: <Circle size={14} />, labelKey: "taskBoard.contextMenu.moveToTodo" },
          { status: "in_progress", icon: <Play size={14} />, labelKey: "taskBoard.contextMenu.moveToInProgress" },
          { status: "archived", icon: <Archive size={14} />, labelKey: "taskBoard.contextMenu.moveToArchive" },
        ]
      : [
          { status: "todo", icon: <Circle size={14} />, labelKey: "taskBoard.contextMenu.moveToTodo" },
          { status: "in_progress", icon: <Play size={14} />, labelKey: "taskBoard.contextMenu.moveToInProgress" },
          { status: "done", icon: <CheckCircle size={14} />, labelKey: "taskBoard.contextMenu.moveToDone" },
        ];

  const handleContextMenuAction = useCallback(
    (action: string, status?: TaskStatus) => {
      closeContextMenu();
      switch (action) {
        case "edit":
          setEditModalOpen(true);
          break;
        case "move":
          if (status) moveTask(task.id, status);
          break;
        case "delete":
          deleteTask(task.id);
          break;
      }
    },
    [closeContextMenu, task.id, task.title, moveTask, deleteTask]
  );

  return (
    <div
      data-task-id={task.id}
      className="group relative select-none"
      style={{
        ...style,
                borderRadius: 18,
        background: "rgb(247, 243, 223)",
        color: "#725d42",
        transition: "all 0.3s ease",
        boxShadow: isSelected
          ? `0 0 0 2px ${statusRingColor[task.status]}, 0 4px 12px rgba(107,92,67,0.3)`
          : isOverdue
            ? "0 4px 10px rgba(107,92,67,0.42), 0 0 0 1px rgba(224,90,90,0.5)"
            : "0 4px 10px rgba(107,92,67,0.42)",
        opacity: isBeingDragged ? 0.4 : 1,
        transform: isBeingDragged ? "scale(0.95)" : undefined,
      }}
      onClick={() => !isEditing && !isSelected && onSelect(task.id)}
      onContextMenu={handleContextMenu}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setEditModalOpen(true);
        onSelect(task.id);
      }}
    >
      <div className="flex flex-col p-3 gap-1.5">
        {/* Grip handle */}
        <div className="flex justify-center -mt-1 mb-0.5 opacity-0 group-hover:opacity-40 transition-opacity">
          <GripVertical size={14} style={{ color: "#9f927d" }} />
        </div>
        {/* Top row: title + expand toggle */}
        <div className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={editRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleEditSave}
                onKeyDown={handleEditKeyDown}
                className="w-full bg-transparent border-none outline-none text-sm font-medium p-0"
                style={{ color: "#725d42" }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p
                className="text-sm font-medium leading-snug cursor-text"
                style={{
                  color: task.status === "done" ? "#c4b89e" : "#725d42",
                  textDecoration: task.status === "done" ? "line-through" : "none",
                }}
                onDoubleClick={handleDoubleClick}
                onMouseDown={(e) => e.preventDefault()}
              >
                {task.title}
              </p>
            )}
          </div>

          <button
            onClick={handleToggleExpand}
            className="shrink-0 transition-colors"
            style={{ color: "#c4b89e" }}
          >
            {isSelected ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        </div>

        {parent && (
          <div className="text-[10px] truncate" style={{ color: "#9f927d" }}>
            {parent.title}
          </div>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1">
          <PriorityBadge priority={task.priority} size="sm" />
          {task.category && (
            <CategoryBadge category={task.category} size="sm" />
          )}
          {task.energy_level && (
            <EnergyLevelIndicator level={task.energy_level} size="sm" />
          )}
          {task.deadline && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                borderRadius: 50,
                padding: "2px 6px",
                fontSize: 10,
                fontWeight: 600,
                background: isOverdue ? "rgba(224,90,90,0.15)" : "#f0e8d8",
                color: isOverdue ? "#e05a5a" : "#725d42",
              }}
            >
              <Calendar size={10} />
              {task.deadline.slice(0, 10)}
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail section */}
      {isSelected && (
        <div className="px-3 py-3 space-y-3" style={{ borderTop: "2px solid #e8e2d6" }}>
          {task.description && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#9f927d" }}>
                Description
              </p>
              <p className="text-xs whitespace-pre-wrap" style={{ color: "#725d42", opacity: 0.8 }}>
                {task.description}
              </p>
            </div>
          )}

          {task.tags.length > 0 && (
            <div className="flex items-start gap-2">
              <Tag size={12} className="mt-0.5 shrink-0" style={{ color: "#9f927d" }} />
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      borderRadius: 50,
                      background: "#f0e8d8",
                      padding: "2px 8px",
                      fontSize: 10,
                      fontWeight: 600,
                      color: "#725d42",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {task.stakeholder && (
            <div className="flex items-center gap-2">
              <User size={12} style={{ color: "#9f927d" }} />
              <span className="text-xs" style={{ color: "#725d42", opacity: 0.7 }}>
                {task.stakeholder}
              </span>
            </div>
          )}

          {task.dependencies.length > 0 && (
            <div className="flex items-start gap-2">
              <Link size={12} className="mt-0.5" style={{ color: "#9f927d" }} />
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: "#9f927d" }}>
                  Dependencies
                </p>
                <ul className="list-disc list-inside text-xs space-y-0.5" style={{ color: "#725d42", opacity: 0.6 }}>
                  {task.dependencies.map((dep) => (
                    <li key={dep}>{dep}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {task.source_text && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "#9f927d" }}>
                Source
              </p>
              <p className="text-xs italic line-clamp-3" style={{ color: "#725d42", opacity: 0.5 }}>
                &ldquo;{task.source_text}&rdquo;
              </p>
            </div>
          )}

          <p className="text-[10px]" style={{ color: "#c4b89e" }}>
            Created {new Date(task.created_at).toLocaleString()}
            {task.completed_at &&
              ` · Completed ${new Date(task.completed_at).toLocaleString()}`}
          </p>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] p-1"
          style={{
            // position handled by menuStyle
            
            ...menuStyle,
            borderRadius: 18,
            border: "2px solid #c4b89e",
            background: "rgb(247, 243, 223)",
            boxShadow: "0 4px 16px rgba(107,92,67,0.3)",
            color: "#725d42",
          }}
        >
          <button
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors"
            style={{ borderRadius: 12 }}
            onClick={() => handleContextMenuAction("edit")}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#d6dff0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Pencil size={14} />
            {t("taskEdit.contextMenuLabel")}
          </button>
          <div className="my-1 h-px" style={{ background: "#e8e2d6" }} />
          {statusActions.map(({ status, icon, labelKey }) => (
            <button
              key={status}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors"
              style={{ borderRadius: 12 }}
              onClick={() => handleContextMenuAction("move", status)}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#d6dff0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {icon}
              {t(labelKey)}
            </button>
          ))}
          <div className="my-1 h-px" style={{ background: "#e8e2d6" }} />
          <button
            className="flex w-full items-center gap-2 px-2 py-1.5 text-xs transition-colors"
            style={{ borderRadius: 12, color: "#e05a5a" }}
            onClick={() => handleContextMenuAction("delete")}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(224,90,90,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <Trash2 size={14} />
            {t("taskBoard.contextMenu.deleteTask")}
          </button>
        </div>
      )}

      {/* Edit modal */}
      <TaskEditModal
        open={editModalOpen}
        task={task}
        onClose={() => setEditModalOpen(false)}
      />
    </div>
  );
}
