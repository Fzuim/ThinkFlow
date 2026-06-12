import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useTaskStore, type Task, type TaskStatus, type TaskCategory } from "@/stores/taskStore";
import { Input } from "animal-island-ui";
import { Select } from "animal-island-ui";
import { Button, Icon } from "animal-island-ui";
import TaskCard from "@/components/shared/TaskCard";
import EmptyState from "@/components/shared/EmptyState";
import {
  Plus,
  Search,
  SlidersHorizontal,
  X,
  ClipboardList,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const columns: { status: TaskStatus; accentColor: string }[] = [
  { status: "todo", accentColor: "#9f927d" },
  { status: "in_progress", accentColor: "#889df0" },
  { status: "done", accentColor: "#8ac68a" },
];

/** Hit-test all column rects and return the matching status, or null. */
function hitTestColumn(
  columnRefs: Record<string, HTMLDivElement | null>,
  x: number,
  y: number,
): TaskStatus | null {
  for (const { status } of columns) {
    const el = columnRefs[status];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return status;
    }
  }
  return null;
}

export default function TaskBoard() {
  const { t } = useTranslation();
  const {
    tasks,
    selectedTaskId,
    filters,
    init,
    getFilteredTasks,
    getTaskStats,
    addTask,
    moveTask,
    selectTask,
    setFilters,
    clearFilters,
  } = useTaskStore();

  useEffect(() => {
    init();
  }, [init]);

  const navigate = useNavigate();

  const [showFilters, setShowFilters] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<TaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");

  // ── Pointer-based drag state ──
  const columnRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const moveTaskRef = useRef(moveTask);
  moveTaskRef.current = moveTask;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Mutable drag info (no re-render on every pointermove)
  const dragInfo = useRef<{
    taskId: string;
    taskTitle: string;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  // Rendering state (only updates when visual feedback changes)
  const [dragGhost, setDragGhost] = useState<{
    id: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  // Global pointermove / pointerup listeners — added once, use refs internally
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragInfo.current) return;

      // Activate only after moving past a small threshold (avoids accidental drags on click)
      if (!dragInfo.current.active) {
        const dx = Math.abs(e.clientX - dragInfo.current.startX);
        const dy = Math.abs(e.clientY - dragInfo.current.startY);
        if (dx < 4 && dy < 4) return;
        dragInfo.current.active = true;
        // Prevent text selection while dragging
        document.body.style.userSelect = "none";
        document.body.style.webkitUserSelect = "none";
      }

      setDragGhost({
        id: dragInfo.current.taskId,
        title: dragInfo.current.taskTitle,
        x: e.clientX,
        y: e.clientY,
      });
      setDragOverStatus(hitTestColumn(columnRefs.current, e.clientX, e.clientY));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragInfo.current) return;

      if (dragInfo.current.active) {
        const targetStatus = hitTestColumn(columnRefs.current, e.clientX, e.clientY);
        if (targetStatus) {
          moveTaskRef.current(dragInfo.current.taskId, targetStatus);
        }
      }

      dragInfo.current = null;
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      setDragGhost(null);
      setDragOverStatus(null);
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  // Capture pointerdown on any TaskCard inside the board
  const handleBoardPointerDown = useCallback((e: React.PointerEvent) => {
    // Only left-button
    if (e.button !== 0) return;
    const cardEl = (e.target as HTMLElement).closest<HTMLElement>("[data-task-id]");
    if (!cardEl) return;
    const taskId = cardEl.dataset.taskId;
    if (!taskId) return;
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task) return;

    dragInfo.current = {
      taskId,
      taskTitle: task.title,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  }, []);

  const stats = useMemo(() => getTaskStats(), [tasks, getTaskStats]);
  const filteredTasks = useMemo(() => getFilteredTasks(), [tasks, filters, getFilteredTasks]);

  const hasActiveFilters =
    filters.category !== null ||
    filters.priority !== null ||
    filters.search !== "";

  const handleQuickAdd = useCallback(() => {
    if (!quickAddTitle.trim() || !quickAddStatus) return;
    const task = {
      id: crypto.randomUUID(),
      title: quickAddTitle.trim(),
      description: "",
      priority: 5,
      urgency: "normal" as const,
      importance: "normal" as const,
      status: quickAddStatus,
      deadline: null,
      estimated_duration: null,
      energy_level: null,
      category: null,
      tags: [] as string[],
      stakeholder: null,
      dependencies: [] as string[],
      source_text: null,
      progress_log: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    addTask(task);
    setQuickAddTitle("");
    setQuickAddStatus(null);
  }, [quickAddTitle, quickAddStatus, addTask]);

  const handleQuickAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); handleQuickAdd(); }
      else if (e.key === "Escape") { setQuickAddTitle(""); setQuickAddStatus(null); }
    },
    [handleQuickAdd]
  );

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], done: [], archived: [] };
    for (const t of filteredTasks) {
      if (map[t.status]) map[t.status].push(t);
    }
    return map;
  }, [filteredTasks]);

  const columnLabels: Record<TaskStatus, string> = {
    todo: t("taskBoard.todo"),
    in_progress: t("taskBoard.inProgress"),
    done: t("taskBoard.done"),
    archived: t("taskBoard.archived"),
  };

  // Select options for category filter
  const categoryOptions = [
    { key: "all", label: t("taskBoard.allCategories") },
    { key: "work", label: "Work" },
    { key: "life", label: "Life" },
    { key: "study", label: "Study" },
    { key: "health", label: "Health" },
  ];

  // Select options for priority filter
  const priorityOptions = [
    { key: "all", label: t("taskBoard.allPriorities") },
    { key: "9", label: t("taskBoard.criticalPriority") },
    { key: "7", label: t("taskBoard.highPriority") },
    { key: "5", label: t("taskBoard.mediumPriority") },
    { key: "2", label: t("taskBoard.lowPriority") },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <Icon name="icon-variant" size={24} style={{ color: "#19c8b9" }} />
          <h2 className="text-2xl font-semibold" style={{ color: "#725d42" }}>{t("taskBoard.title")}</h2>
          <div className="flex items-center gap-2 text-xs" style={{ color: "#9f927d" }}>
            <span
              style={{
                borderRadius: 50,
                background: "#f0e8d8",
                padding: "2px 8px",
                fontWeight: 600,
                fontSize: 12,
                color: "#725d42",
              }}
            >
              {t("taskBoard.stats", { count: stats.total })}
            </span>
            <span
              style={{
                borderRadius: 50,
                border: "2px solid #c4b89e",
                padding: "2px 8px",
                fontWeight: 600,
                fontSize: 12,
                color: "#725d42",
              }}
            >
              {stats.byStatus.todo} {t("taskBoard.todo")}
            </span>
            <span
              style={{
                borderRadius: 50,
                border: "2px solid #c4b89e",
                padding: "2px 8px",
                fontWeight: 600,
                fontSize: 12,
                color: "#725d42",
              }}
            >
              {stats.byStatus.in_progress} {t("taskBoard.inProgress")}
            </span>
            <span
              style={{
                borderRadius: 50,
                border: "2px solid #c4b89e",
                padding: "2px 8px",
                fontWeight: 600,
                fontSize: 12,
                color: "#725d42",
              }}
            >
              {stats.byStatus.done} {t("taskBoard.done")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              size="small"
              placeholder={t("taskBoard.search")}
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              prefix={<Search size={14} style={{ color: "#c4b89e" }} />}
            />
          </div>
          <Button
            type={hasActiveFilters ? "default" : "text"}
            onClick={() => setShowFilters(!showFilters)}
            title={t("taskBoard.filters")}
          >
            <SlidersHorizontal size={16} />
          </Button>
          <Button type="primary" onClick={() => navigate("/capture")} icon={<Plus size={16} />}>
            {t("taskBoard.quickCapture")}
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="flex items-center gap-3 px-6 pb-4">
          <Select
            value={filters.category ?? "all"}
            onChange={(v) => setFilters({ category: v === "all" || !v ? null : (v as TaskCategory) })}
            options={categoryOptions}
            placeholder={t("taskBoard.allCategories")}
          />
          <Select
            value={filters.priority?.toString() ?? "all"}
            onChange={(v) => setFilters({ priority: !v || v === "all" ? null : parseInt(v) })}
            options={priorityOptions}
            placeholder={t("taskBoard.allPriorities")}
          />
          {hasActiveFilters && (
            <Button type="text" onClick={clearFilters}>
              <X size={12} className="mr-1" />
              <span className="text-xs">{t("taskBoard.clearFilters")}</span>
            </Button>
          )}
        </div>
      )}

      {/* Board area — pointerdown captures drag start on TaskCards */}
      <div
        className="flex-1 px-6 pb-6 overflow-auto"
        onPointerDown={handleBoardPointerDown}
      >
        <div className="grid grid-cols-3 gap-4 h-full">
          {columns.map(({ status, accentColor }) => {
            const columnTasks = tasksByStatus[status];
            const isDropTarget = dragOverStatus === status;
            return (
              <div
                key={status}
                ref={(el) => { columnRefs.current[status] = el; }}
                className="flex flex-col min-h-0 h-full"
              >
                <div
                  className="flex flex-col flex-1 min-h-0"
                  style={{
                    borderRadius: 20,
                    background: "rgb(247, 243, 223)",
                    borderTop: `3px solid ${accentColor}`,
                    boxShadow: isDropTarget
                      ? "0 0 0 2px #19c8b9, 0 4px 20px rgba(25,200,185,0.2)"
                      : "0 4px 10px rgba(107,92,67,0.42)",
                    transition: "all 0.3s ease",
                    overflow: "hidden",
                  }}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between p-4 pb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: "#725d42" }}>
                        {columnLabels[status]}
                      </span>
                      <span
                        style={{
                          borderRadius: 50,
                          background: isDropTarget ? "#19c8b9" : "#f0e8d8",
                          color: isDropTarget ? "#fff" : "#725d42",
                          padding: "2px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          transition: "all 0.3s",
                        }}
                      >
                        {columnTasks.length}
                      </span>
                    </div>
                    <Button
                      type="text"
                      onClick={() => { setQuickAddStatus(status); setQuickAddTitle(""); }}
                      title={t("taskBoard.addTask", { column: columnLabels[status] })}
                    >
                      <Plus size={14} />
                    </Button>
                  </div>

                  {/* Column content */}
                  <div
                    className="flex-1 overflow-auto space-y-2 px-3 pb-3 min-h-[120px]"
                    style={{
                      background: isDropTarget ? "rgba(25,200,185,0.05)" : "transparent",
                      transition: "background 0.3s",
                    }}
                  >
                    {quickAddStatus === status && (
                      <div className="flex gap-1">
                        <Input
                          autoFocus
                          size="small"
                          placeholder={t("taskBoard.taskPlaceholder")}
                          value={quickAddTitle}
                          onChange={(e) => setQuickAddTitle(e.target.value)}
                          onKeyDown={handleQuickAddKeyDown}
                          onBlur={() => { if (!quickAddTitle.trim()) setQuickAddStatus(null); }}
                        />
                      </div>
                    )}
                    {columnTasks.map((task, index) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        isSelected={selectedTaskId === task.id}
                        isBeingDragged={dragGhost?.id === task.id}
                        onSelect={selectTask}
                        style={index === 0 ? { marginTop: 2 } : undefined}
                      />
                    ))}
                    {columnTasks.length === 0 && quickAddStatus !== status && (
                      <EmptyState
                        icon={<ClipboardList size={28} />}
                        title={t(`taskBoard.empty${status === "todo" ? "Todo" : status === "in_progress" ? "InProgress" : status === "done" ? "Done" : "Archived"}`)}
                        description={t(`taskBoard.empty${status === "todo" ? "Todo" : status === "in_progress" ? "InProgress" : status === "done" ? "Done" : "Archived"}Desc`)}
                        action={
                          <Button
                            type="dashed"
                            size="small"
                            onClick={() => { setQuickAddStatus(status); setQuickAddTitle(""); }}
                            icon={<Plus size={14} />}
                          >
                            {t("taskBoard.addTask", { column: columnLabels[status] })}
                          </Button>
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag ghost overlay — rendered via portal so it's never clipped by overflow containers */}
      {dragGhost && createPortal(
        <div
          className="fixed pointer-events-none z-[9999] max-w-[220px] truncate"
          style={{
            left: dragGhost.x + 14,
            top: dragGhost.y + 14,
            opacity: 0.85,
            borderRadius: 18,
            border: "2px solid #c4b89e",
            background: "rgb(247, 243, 223)",
            padding: "8px 12px",
            boxShadow: "0 4px 12px rgba(107,92,67,0.3)",
            fontSize: 14,
            fontWeight: 600,
            color: "#725d42",
          }}
        >
          {dragGhost.title}
        </div>,
        document.body,
      )}
    </div>
  );
}
