import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Button, Icon, Modal, Progress } from "animal-island-ui";
import { CalendarDays, Flag, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { calculateGoalProgress, useGoalStore, type Goal } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";

export default function GoalListView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { goals, init, addGoal, deleteGoal } = useGoalStore();
  const { tasks, deleteTask } = useTaskStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [targetDateFocused, setTargetDateFocused] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ goal: Goal; x: number; y: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  useEffect(() => { init(); }, [init]);
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

  const activeGoals = useMemo(
    () => goals.filter((goal) => !["abandoned"].includes(goal.status)),
    [goals],
  );

  const handleCreate = async () => {
    if (!title.trim()) return;
    const goal = await addGoal({
      title: title.trim(),
      description,
      success_criteria: criteria,
      start_date: new Date().toISOString().slice(0, 10),
      target_date: targetDate || null,
    });
    setOpen(false);
    setTitle("");
    setDescription("");
    setCriteria("");
    setTargetDate("");
    navigate(`/goals/${goal.id}`);
  };

  const confirmDeleteGoal = async () => {
    if (!deleteTarget) return;
    const taskIds = tasks.filter((task) => task.goal_id === deleteTarget.id).map((task) => task.id);
    for (const taskId of taskIds) await deleteTask(taskId);
    await deleteGoal(deleteTarget.id);
    setDeleteTarget(null);
  };

  const deleteTaskCount = deleteTarget ? tasks.filter((task) => task.goal_id === deleteTarget.id).length : 0;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Icon name="icon-helicopter" size={25} />
              <h2 className="text-2xl font-semibold" style={{ color: "#725d42" }}>{t("goals.title")}</h2>
            </div>
            <p className="text-sm mt-1" style={{ color: "#9f927d" }}>{t("goals.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button type="dashed" icon={<Sparkles size={16} />} onClick={() => navigate("/capture?mode=goal")}>{t("goals.aiPlan")}</Button>
            <Button type="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>{t("goals.create")}</Button>
          </div>
        </div>

        {activeGoals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center" style={{ border: "2px dashed #ded5c5", borderRadius: 24 }}>
            <Flag size={42} style={{ color: "#b7c6e5" }} />
            <h3 className="font-semibold mt-4" style={{ color: "#725d42" }}>{t("goals.empty")}</h3>
            <p className="text-sm mt-1 mb-5" style={{ color: "#9f927d" }}>{t("goals.emptyHint")}</p>
            <Button type="primary" onClick={() => setOpen(true)}>{t("goals.createFirst")}</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeGoals.map((goal) => {
              const progress = calculateGoalProgress(goal.id, tasks);
              const goalTasks = tasks.filter((task) => task.goal_id === goal.id);
              const done = goalTasks.filter((task) => task.status === "done").length;
              return (
                <button
                  key={goal.id}
                  onClick={() => navigate(`/goals/${goal.id}`)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setContextMenu({ goal, x: event.clientX, y: event.clientY });
                  }}
                  className="text-left p-5 transition-transform hover:-translate-y-0.5"
                  style={{ background: "#fffdf7", border: "2px solid #e8e2d6", borderRadius: 20, boxShadow: "0 5px 14px rgba(107,92,67,0.12)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold" style={{ color: "#725d42" }}>{goal.title}</h3>
                      <p className="text-sm mt-1 line-clamp-2" style={{ color: "#9f927d" }}>{goal.description || t("goals.noDescription")}</p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs font-semibold px-2 py-1" style={{ borderRadius: 99, background: "#e8f7f4", color: "#168f85" }}>{t(`goals.status.${goal.status}`)}</span>
                  </div>
                  <div className="mt-5">
                    <div className="flex justify-between text-xs mb-2" style={{ color: "#8a7b66" }}>
                      <span>{t("goals.progress")}</span><strong>{progress}%</strong>
                    </div>
                    <Progress percent={progress} size="small" showInfo={false} />
                  </div>
                  <div className="flex items-center gap-5 mt-4 text-xs" style={{ color: "#9f927d" }}>
                    <span className="flex items-center gap-1"><CalendarDays size={13} />{goal.target_date || t("goals.noTargetDate")}</span>
                    <span>{t("goals.taskCount", { done, total: goalTasks.length })}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={open} title={t("goals.create")} onClose={() => setOpen(false)} onOk={handleCreate} typewriter={false} width={560}>
        <div className="space-y-4" style={{ width: "100%" }}>
          <Field label={t("goals.form.title")}><input className="placeholder:text-[#aaa08f]" autoFocus value={title} placeholder={t("goals.form.titlePlaceholder")} onChange={(event) => setTitle(event.target.value)} style={inputStyle} {...focusHandlers} /></Field>
          <Field label={t("goals.form.description")}><textarea className="placeholder:text-[#aaa08f]" value={description} placeholder={t("goals.form.descriptionPlaceholder")} onChange={(event) => setDescription(event.target.value)} rows={3} style={inputStyle} {...focusHandlers} /></Field>
          <Field label={t("goals.form.criteria")}><textarea className="placeholder:text-[#aaa08f]" value={criteria} placeholder={t("goals.form.criteriaPlaceholder")} onChange={(event) => setCriteria(event.target.value)} rows={2} style={inputStyle} {...focusHandlers} /></Field>
          <Field label={t("goals.form.targetDate")}><input className="placeholder:text-[#aaa08f]" type={targetDateFocused || targetDate ? "date" : "text"} value={targetDate} placeholder={t("goals.form.targetDatePlaceholder")} onFocus={(event) => { setTargetDateFocused(true); focusHandlers.onFocus(event); }} onBlur={(event) => { setTargetDateFocused(false); focusHandlers.onBlur(event); }} onChange={(event) => setTargetDate(event.target.value)} style={inputStyle} /></Field>
        </div>
      </Modal>

      <Modal open={deleteTarget !== null} title={t("goals.deleteGoal")} onClose={() => setDeleteTarget(null)} onOk={confirmDeleteGoal} typewriter={false} width={440}>
        <p className="text-sm leading-6" style={{ color: "#725d42" }}>
          {deleteTarget && t("goals.deleteGoalConfirm", { title: deleteTarget.title, count: deleteTaskCount })}
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
              const goal = contextMenu.goal;
              setContextMenu(null);
              setDeleteTarget(goal);
            }}
          >
            <Trash2 size={14} />{t("goals.deleteGoal")}
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block w-full"><span className="block text-xs font-semibold mb-1" style={{ color: "#9f927d" }}>{label}</span>{children}</label>;
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
