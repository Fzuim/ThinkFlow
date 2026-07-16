import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Modal } from "animal-island-ui";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, Diamond, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { calculateGoalProgress, useGoalStore } from "@/stores/goalStore";
import { useTaskStore, type Task, type TaskKind } from "@/stores/taskStore";

function getDescendantIds(tasks: Task[], parentId: string): string[] {
  const result: string[] = [];
  for (const child of tasks.filter((task) => task.parent_id === parentId)) {
    result.push(...getDescendantIds(tasks, child.id), child.id);
  }
  return result;
}

export default function GoalDetailView() {
  const { goalId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { goals, init: initGoals } = useGoalStore();
  const { tasks, init: initTasks, addTask, updateTask, moveTask, deleteTask } = useTaskStore();
  const [dialog, setDialog] = useState<{ open: boolean; parentId: string | null; editingId: string | null }>({ open: false, parentId: null, editingId: null });
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("task");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [contextMenu, setContextMenu] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  useEffect(() => { initGoals(); initTasks(); }, [initGoals, initTasks]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);
  const goal = goals.find((item) => item.id === goalId);
  const goalTasks = useMemo(
    () => tasks.filter((task) => task.goal_id === goalId).sort((a, b) => a.sort_order - b.sort_order),
    [tasks, goalId],
  );
  const taskIds = useMemo(() => new Set(goalTasks.map((task) => task.id)), [goalTasks]);
  const roots = useMemo(() => goalTasks.filter((task) => !task.parent_id || !taskIds.has(task.parent_id)), [goalTasks, taskIds]);
  const progress = calculateGoalProgress(goalId, tasks);

  const openAdd = (parentId: string | null, defaultKind: TaskKind = "task") => {
    setDialog({ open: true, parentId, editingId: null });
    setKind(defaultKind);
    setTitle("");
    setPlannedEnd("");
  };

  const openEdit = (task: Task) => {
    setDialog({ open: true, parentId: task.parent_id, editingId: task.id });
    setTitle(task.title);
    setKind(task.kind);
    setPlannedEnd((task.planned_end_at || task.deadline)?.slice(0, 10) ?? "");
  };

  const closeDialog = () => setDialog({ open: false, parentId: null, editingId: null });

  const saveTask = async () => {
    if (!title.trim()) return;
    if (dialog.editingId) {
      await updateTask(dialog.editingId, {
        title: title.trim(),
        kind,
        deadline: plannedEnd || null,
        planned_end_at: plannedEnd || null,
        schedule_level: kind === "milestone" ? "stage" : null,
      });
      closeDialog();
      return;
    }
    const now = new Date().toISOString();
    const siblings = goalTasks.filter((task) => task.parent_id === dialog.parentId);
    const task: Task = {
      id: crypto.randomUUID(), title: title.trim(), description: "", priority: 5,
      urgency: "normal", importance: "normal", status: "todo", deadline: plannedEnd || null,
      estimated_duration: null, energy_level: null, category: "study", tags: [], stakeholder: null,
      dependencies: [], source_text: null, progress_log: [], goal_id: goalId,
      parent_id: dialog.parentId, kind, start_at: null, planned_end_at: plannedEnd || null,
      weight: 1, sort_order: siblings.length, schedule_level: kind === "milestone" ? "stage" : null,
      created_at: now, updated_at: now, completed_at: null,
    };
    await addTask(task);
    closeDialog();
  };

  const deleteNode = async () => {
    if (!deleteTarget) return;
    const descendantIds = getDescendantIds(goalTasks, deleteTarget.id);
    for (const descendantId of descendantIds) await deleteTask(descendantId);
    await deleteTask(deleteTarget.id);
    setDeleteTarget(null);
  };

  const deleteDescendantCount = deleteTarget ? getDescendantIds(goalTasks, deleteTarget.id).length : 0;

  if (!goal) {
    return <div className="h-full flex items-center justify-center" style={{ color: "#9f927d" }}>{t("goals.notFound")}</div>;
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <button className="flex items-center gap-1 text-sm mb-4" style={{ color: "#8a7b66" }} onClick={() => navigate("/goals")}>
          <ArrowLeft size={15} />{t("goals.back")}
        </button>
        <section className="p-5" style={{ background: "#fffdf7", border: "2px solid #e8e2d6", borderRadius: 22 }}>
          <div className="flex items-start justify-between gap-5">
            <div className="flex gap-3">
              <Target size={27} style={{ color: "#19c8b9", marginTop: 2 }} />
              <div>
                <h2 className="text-2xl font-semibold" style={{ color: "#725d42" }}>{goal.title}</h2>
                <p className="text-sm mt-1" style={{ color: "#9f927d" }}>{goal.description}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="dashed" icon={<Sparkles size={16} />} onClick={() => navigate(`/capture?mode=goal&goalId=${goal.id}`)}>{t("goals.discuss")}</Button>
              <Button type="primary" icon={<Plus size={16} />} onClick={() => openAdd(null, "milestone")}>{t("goals.addStage")}</Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-5 mt-5">
            <div><div className="text-xs" style={{ color: "#9f927d" }}>{t("goals.progress")}</div><div className="text-xl font-semibold" style={{ color: "#19a99c" }}>{progress}%</div></div>
            <div><div className="text-xs" style={{ color: "#9f927d" }}>{t("goals.targetDate")}</div><div className="flex items-center gap-1 mt-1 text-sm" style={{ color: "#725d42" }}><CalendarDays size={14} />{goal.target_date || t("goals.noTargetDate")}</div></div>
            <div><div className="text-xs" style={{ color: "#9f927d" }}>{t("goals.successCriteria")}</div><div className="text-sm mt-1 line-clamp-2" style={{ color: "#725d42" }}>{goal.success_criteria || t("goals.noCriteria")}</div></div>
          </div>
          <div className="h-2 mt-4 overflow-hidden" style={{ borderRadius: 99, background: "#eee7da" }}><div className="h-full" style={{ width: `${progress}%`, background: "#19c8b9" }} /></div>
        </section>

        <section className="mt-5 p-5" style={{ background: "#fffdf7", border: "2px solid #e8e2d6", borderRadius: 22 }}>
          <div className="flex justify-between items-center mb-4">
            <div><h3 className="font-semibold" style={{ color: "#725d42" }}>{t("goals.roadmap")}</h3><p className="text-xs mt-1" style={{ color: "#9f927d" }}>{t("goals.roadmapHint")}</p></div>
            <span className="text-xs" style={{ color: "#9f927d" }}>{t("goals.taskTotal", { count: goalTasks.length })}</span>
          </div>
          {roots.length === 0 ? (
            <div className="py-14 text-center" style={{ border: "2px dashed #ded5c5", borderRadius: 18 }}>
              <Diamond size={30} className="mx-auto" style={{ color: "#b7c6e5" }} />
              <p className="text-sm mt-3 mb-4" style={{ color: "#9f927d" }}>{t("goals.noStages")}</p>
              <Button type="primary" onClick={() => openAdd(null, "milestone")}>{t("goals.addFirstStage")}</Button>
            </div>
          ) : roots.map((root) => (
            <TaskTreeNode key={root.id} task={root} allTasks={goalTasks} depth={0} onAdd={openAdd} onEdit={openEdit} onMove={moveTask} onOpenMenu={(task, x, y) => setContextMenu({ task, x, y })} />
          ))}
        </section>
      </div>

      <Modal open={dialog.open} title={dialog.editingId ? t("goals.editNode") : dialog.parentId ? t("goals.addChild") : t("goals.addStage")} onClose={closeDialog} onOk={saveTask} typewriter={false} width={500}>
        <div className="space-y-4" style={{ width: "100%" }}>
          <label className="block w-full"><span className="text-xs font-semibold block mb-1" style={{ color: "#9f927d" }}>{t("goals.form.taskTitle")}</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} {...focusHandlers} /></label>
          <div className="w-full"><span className="text-xs font-semibold block mb-2" style={{ color: "#9f927d" }}>{t("goals.form.kind")}</span><div className="grid grid-cols-2 gap-2"><Button type={kind === "task" ? "primary" : "dashed"} onClick={() => setKind("task")}>{t("goals.kind.task")}</Button><Button type={kind === "milestone" ? "primary" : "dashed"} onClick={() => setKind("milestone")}>{t("goals.kind.milestone")}</Button></div></div>
          <label className="block w-full"><span className="text-xs font-semibold block mb-1" style={{ color: "#9f927d" }}>{t("goals.form.plannedEnd")}</span><input type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} style={inputStyle} {...focusHandlers} /></label>
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        title={t("goals.deleteNode")}
        onClose={() => setDeleteTarget(null)}
        onOk={deleteNode}
        typewriter={false}
        width={420}
      >
        <p className="text-sm leading-6" style={{ color: "#725d42" }}>
          {deleteTarget && (deleteDescendantCount > 0
            ? t("goals.deleteNodeConfirmWithChildren", { title: deleteTarget.title, count: deleteDescendantCount })
            : t("goals.deleteNodeConfirm", { title: deleteTarget.title }))}
        </p>
      </Modal>

      {contextMenu && createPortal(
        <div
          className="fixed min-w-32 p-1"
          style={{
            zIndex: 99999,
            left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 150)),
            top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 56)),
            borderRadius: 10,
            border: "1px solid #ded5c5",
            background: "#fffdf7",
            boxShadow: "0 8px 24px rgba(80,65,45,0.22)",
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-left hover:bg-[#fbe9e6]"
            style={{ borderRadius: 8, color: "#d75b4e" }}
            onClick={() => {
              const task = contextMenu.task;
              setContextMenu(null);
              setDeleteTarget(task);
            }}
          >
            <Trash2 size={14} />{t("goals.deleteNode")}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  resize: "none",
  background: "rgb(247, 243, 223)",
  border: "2.5px solid #c4b89e",
  borderRadius: 18,
  padding: "10px 16px",
  fontSize: 14,
  fontWeight: 500,
  color: "#725d42",
  fontFamily: "inherit",
  outline: "none",
  boxShadow: "0 3px 0 0 #d4c9b4",
  transition: "border-color 0.25s, box-shadow 0.25s",
};

const focusHandlers = {
  onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.currentTarget.style.borderColor = "#ffcc00";
    event.currentTarget.style.boxShadow = "0 3px 0 0 #e0b800, 0 0 0 3px rgba(255,204,0,0.15)";
  },
  onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    event.currentTarget.style.borderColor = "#c4b89e";
    event.currentTarget.style.boxShadow = "0 3px 0 0 #d4c9b4";
  },
};

function TaskTreeNode({ task, allTasks, depth, onAdd, onEdit, onMove, onOpenMenu }: {
  task: Task; allTasks: Task[]; depth: number;
  onAdd: (parentId: string | null, kind?: TaskKind) => void;
  onEdit: (task: Task) => void;
  onMove: (id: string, status: Task["status"]) => Promise<void>;
  onOpenMenu: (task: Task, x: number, y: number) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const children = allTasks.filter((child) => child.parent_id === task.id).sort((a, b) => a.sort_order - b.sort_order);
  const completed = children.filter((child) => child.status === "done").length;
  const isParent = children.length > 0 || task.kind === "milestone";
  return (
    <div>
      <div
        className="group flex items-center gap-2 py-2 px-2 hover:bg-[#f7f2e8]"
        style={{ marginLeft: depth * 24, borderRadius: 12 }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(task, event.clientX, event.clientY);
        }}
      >
        <button onClick={() => setExpanded((value) => !value)} className="w-5" style={{ color: "#9f927d" }}>{isParent ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}</button>
        {task.kind === "milestone" ? <Diamond size={15} style={{ color: "#889df0" }} /> : (
          <button
            aria-label={task.status === "done" ? t("goals.markTodo") : t("goals.markDone")}
            title={task.status === "done" ? t("goals.markTodo") : t("goals.markDone")}
            onClick={() => onMove(task.id, task.status === "done" ? "todo" : "done")}
          >
            {task.status === "done" ? <CheckCircle2 size={16} style={{ color: "#70b970" }} /> : <Circle size={16} style={{ color: "#b0a38d" }} />}
          </button>
        )}
        <button
          className="flex-1 text-left text-sm font-medium"
          style={{ color: task.status === "done" ? "#9f927d" : "#725d42", textDecoration: task.status === "done" ? "line-through" : "none" }}
          title={t("goals.doubleClickEdit")}
          onDoubleClick={() => onEdit(task)}
        >
          {task.title}
        </button>
        {children.length > 0 && <span className="text-xs" style={{ color: "#9f927d" }}>{completed}/{children.length}</span>}
        {(task.planned_end_at || task.deadline) && <span className="text-xs" style={{ color: "#9f927d" }}>{(task.planned_end_at || task.deadline)?.slice(0, 10)}</span>}
        <button className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1" style={{ color: "#168f85" }} onClick={() => onAdd(task.id)}><Plus size={13} className="inline" /> {t("goals.child")}</button>
      </div>
      {expanded && children.map((child) => <TaskTreeNode key={child.id} task={child} allTasks={allTasks} depth={depth + 1} onAdd={onAdd} onEdit={onEdit} onMove={onMove} onOpenMenu={onOpenMenu} />)}
    </div>
  );
}
