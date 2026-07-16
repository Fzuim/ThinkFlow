import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Input, Modal } from "animal-island-ui";
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, Diamond, Plus, Sparkles, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { calculateGoalProgress, useGoalStore } from "@/stores/goalStore";
import { useTaskStore, type Task, type TaskKind } from "@/stores/taskStore";

export default function GoalDetailView() {
  const { goalId = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { goals, init: initGoals } = useGoalStore();
  const { tasks, init: initTasks, addTask, moveTask } = useTaskStore();
  const [dialog, setDialog] = useState<{ open: boolean; parentId: string | null }>({ open: false, parentId: null });
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("task");
  const [plannedEnd, setPlannedEnd] = useState("");

  useEffect(() => { initGoals(); initTasks(); }, [initGoals, initTasks]);
  const goal = goals.find((item) => item.id === goalId);
  const goalTasks = useMemo(
    () => tasks.filter((task) => task.goal_id === goalId).sort((a, b) => a.sort_order - b.sort_order),
    [tasks, goalId],
  );
  const taskIds = useMemo(() => new Set(goalTasks.map((task) => task.id)), [goalTasks]);
  const roots = useMemo(() => goalTasks.filter((task) => !task.parent_id || !taskIds.has(task.parent_id)), [goalTasks, taskIds]);
  const progress = calculateGoalProgress(goalId, tasks);

  const openAdd = (parentId: string | null, defaultKind: TaskKind = "task") => {
    setDialog({ open: true, parentId });
    setKind(defaultKind);
    setTitle("");
    setPlannedEnd("");
  };

  const createTask = async () => {
    if (!title.trim()) return;
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
    setDialog({ open: false, parentId: null });
  };

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
            <TaskTreeNode key={root.id} task={root} allTasks={goalTasks} depth={0} onAdd={openAdd} onMove={moveTask} />
          ))}
        </section>
      </div>

      <Modal open={dialog.open} title={dialog.parentId ? t("goals.addChild") : t("goals.addStage")} onClose={() => setDialog({ open: false, parentId: null })} onOk={createTask} typewriter={false} width={500}>
        <div className="space-y-4">
          <label className="block"><span className="text-xs font-semibold block mb-1" style={{ color: "#8a7b66" }}>{t("goals.form.taskTitle")}</span><Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <div><span className="text-xs font-semibold block mb-2" style={{ color: "#8a7b66" }}>{t("goals.form.kind")}</span><div className="flex gap-2"><Button type={kind === "task" ? "primary" : "dashed"} onClick={() => setKind("task")}>{t("goals.kind.task")}</Button><Button type={kind === "milestone" ? "primary" : "dashed"} onClick={() => setKind("milestone")}>{t("goals.kind.milestone")}</Button></div></div>
          <label className="block"><span className="text-xs font-semibold block mb-1" style={{ color: "#8a7b66" }}>{t("goals.form.plannedEnd")}</span><Input type="date" value={plannedEnd} onChange={(event) => setPlannedEnd(event.target.value)} /></label>
        </div>
      </Modal>
    </div>
  );
}

function TaskTreeNode({ task, allTasks, depth, onAdd, onMove }: {
  task: Task; allTasks: Task[]; depth: number;
  onAdd: (parentId: string | null, kind?: TaskKind) => void;
  onMove: (id: string, status: Task["status"]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const children = allTasks.filter((child) => child.parent_id === task.id).sort((a, b) => a.sort_order - b.sort_order);
  const completed = children.filter((child) => child.status === "done").length;
  const isParent = children.length > 0 || task.kind === "milestone";
  return (
    <div>
      <div className="group flex items-center gap-2 py-2 px-2 hover:bg-[#f7f2e8]" style={{ marginLeft: depth * 24, borderRadius: 12 }}>
        <button onClick={() => setExpanded((value) => !value)} className="w-5" style={{ color: "#9f927d" }}>{isParent ? (expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />) : null}</button>
        {task.kind === "milestone" ? <Diamond size={15} style={{ color: "#889df0" }} /> : task.status === "done" ? <CheckCircle2 size={16} style={{ color: "#70b970" }} /> : <Circle size={16} style={{ color: "#b0a38d" }} />}
        <button className="flex-1 text-left text-sm font-medium" style={{ color: task.status === "done" ? "#9f927d" : "#725d42", textDecoration: task.status === "done" ? "line-through" : "none" }} onClick={() => task.kind === "task" && onMove(task.id, task.status === "done" ? "todo" : "done")}>{task.title}</button>
        {children.length > 0 && <span className="text-xs" style={{ color: "#9f927d" }}>{completed}/{children.length}</span>}
        {(task.planned_end_at || task.deadline) && <span className="text-xs" style={{ color: "#9f927d" }}>{(task.planned_end_at || task.deadline)?.slice(0, 10)}</span>}
        <button className="opacity-0 group-hover:opacity-100 text-xs px-2 py-1" style={{ color: "#168f85" }} onClick={() => onAdd(task.id)}><Plus size={13} className="inline" /> {t("goals.child")}</button>
      </div>
      {expanded && children.map((child) => <TaskTreeNode key={child.id} task={child} allTasks={allTasks} depth={depth + 1} onAdd={onAdd} onMove={onMove} />)}
    </div>
  );
}
