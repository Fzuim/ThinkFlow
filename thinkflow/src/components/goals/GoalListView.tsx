import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Modal } from "animal-island-ui";
import { CalendarDays, Flag, Plus, Sparkles, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { calculateGoalProgress, useGoalStore } from "@/stores/goalStore";
import { useTaskStore } from "@/stores/taskStore";

export default function GoalListView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { goals, init, addGoal } = useGoalStore();
  const tasks = useTaskStore((state) => state.tasks);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [targetDate, setTargetDate] = useState("");

  useEffect(() => { init(); }, [init]);

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

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <Target size={25} style={{ color: "#19c8b9" }} />
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
                  className="text-left p-5 transition-transform hover:-translate-y-0.5"
                  style={{ background: "#fffdf7", border: "2px solid #e8e2d6", borderRadius: 20, boxShadow: "0 5px 14px rgba(107,92,67,0.12)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold" style={{ color: "#725d42" }}>{goal.title}</h3>
                      <p className="text-sm mt-1 line-clamp-2" style={{ color: "#9f927d" }}>{goal.description || t("goals.noDescription")}</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1" style={{ borderRadius: 99, background: "#e8f7f4", color: "#168f85" }}>{t(`goals.status.${goal.status}`)}</span>
                  </div>
                  <div className="mt-5">
                    <div className="flex justify-between text-xs mb-2" style={{ color: "#8a7b66" }}>
                      <span>{t("goals.progress")}</span><strong>{progress}%</strong>
                    </div>
                    <div className="h-2 overflow-hidden" style={{ borderRadius: 99, background: "#eee7da" }}>
                      <div className="h-full" style={{ width: `${progress}%`, background: "#19c8b9", borderRadius: 99 }} />
                    </div>
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
          <Field label={t("goals.form.title")}><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} {...focusHandlers} /></Field>
          <Field label={t("goals.form.description")}><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} style={inputStyle} {...focusHandlers} /></Field>
          <Field label={t("goals.form.criteria")}><textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} rows={2} style={inputStyle} {...focusHandlers} /></Field>
          <Field label={t("goals.form.targetDate")}><input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} style={inputStyle} {...focusHandlers} /></Field>
        </div>
      </Modal>
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
