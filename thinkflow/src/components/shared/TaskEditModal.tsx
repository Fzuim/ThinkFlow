import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/stores/taskStore";
import { useTaskStore } from "@/stores/taskStore";
import { Modal } from "animal-island-ui";
import { Input } from "animal-island-ui";
import { Select } from "animal-island-ui";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { useGoalStore } from "@/stores/goalStore";

interface TaskEditModalProps {
  open: boolean;
  task: Task | null;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
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
  onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = "#ffcc00";
    e.target.style.boxShadow = "0 3px 0 0 #e0b800, 0 0 0 3px rgba(255,204,0,0.15)";
  },
  onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = "#c4b89e";
    e.target.style.boxShadow = "0 3px 0 0 #d4c9b4";
  },
};

export default function TaskEditModal({ open, task, onClose }: TaskEditModalProps) {
  const { t } = useTranslation();
  const { updateTask, tasks } = useTaskStore();
  const { goals, init: initGoals } = useGoalStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(5);
  const [deadline, setDeadline] = useState("");
  const [category, setCategory] = useState("");
  const [energyLevel, setEnergyLevel] = useState("");
  const [energyOpen, setEnergyOpen] = useState(false);
  const [energyHovered, setEnergyHovered] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);
  const [goalId, setGoalId] = useState("");
  const [parentId, setParentId] = useState("");
  const [kind, setKind] = useState<Task["kind"]>("task");
  const invalidParentIds = useMemo(() => {
    const invalid = new Set<string>();
    if (!task) return invalid;
    invalid.add(task.id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of tasks) {
        if (candidate.parent_id && invalid.has(candidate.parent_id) && !invalid.has(candidate.id)) {
          invalid.add(candidate.id);
          changed = true;
        }
      }
    }
    return invalid;
  }, [task, tasks]);

  useEffect(() => { initGoals(); }, [initGoals]);

  // Sync form with task when opened
  useEffect(() => {
    if (task && open) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setDeadline(task.deadline?.slice(0, 10) ?? "");
      setCategory(task.category ?? "");
      setEnergyLevel(task.energy_level ?? "");
      setTags(task.tags);
      setTagInput("");
      setEstimatedDuration(task.estimated_duration?.toString() ?? "");
      setGoalId(task.goal_id ?? "");
      setParentId(task.parent_id ?? "");
      setKind(task.kind);
    }
  }, [task, open]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  }, [tagInput, tags]);

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  const handleRemoveTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleSave = useCallback(() => {
    if (!task || !title.trim()) return;
    const updates: Partial<Task> = {
      title: title.trim(),
      description,
      priority,
      deadline: deadline || null,
      category: (category || null) as Task['category'],
      energy_level: (energyLevel || null) as Task["energy_level"],
      tags,
      estimated_duration: estimatedDuration ? parseInt(estimatedDuration) : null,
      goal_id: goalId || null,
      parent_id: parentId || null,
      kind,
    };
    updateTask(task.id, updates);
    onClose();
  }, [task, title, description, priority, deadline, category, energyLevel, tags, estimatedDuration, goalId, parentId, kind, updateTask, onClose]);

  const categoryOptions = [
    { key: "", label: t("taskEdit.noCategory") },
    { key: "work", label: t("categories.work") },
    { key: "life", label: t("categories.life") },
    { key: "study", label: t("categories.study") },
    { key: "health", label: t("categories.health") },
  ];

  const energyOptions = [
    { key: "", label: t("taskEdit.noEnergyLevel") },
    { key: "deep", label: t("energyLevel.deep") },
    { key: "medium", label: t("energyLevel.medium") },
    { key: "shallow", label: t("energyLevel.shallow") },
  ];

  return (
    <Modal
      open={open}
      title={t("taskEdit.title")}
      onClose={onClose}
      onOk={handleSave}
      typewriter={false}
      width={600}
    >
      <div className="space-y-3" style={{ width: "100%", overflow: "visible" }}>
        {/* Title */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
            {t("taskEdit.titleField")}
          </label>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("taskEdit.titleField")}
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
            {t("taskEdit.description")}
          </label>
          <div style={{ position: "relative" }}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("taskEdit.descriptionPlaceholder")}
              rows={descExpanded ? 6 : 2}
              style={{ ...inputStyle, paddingRight: 38 }}
              {...focusHandlers}
            />
            <button
              type="button"
              onClick={() => setDescExpanded((v) => !v)}
              title={descExpanded ? t("taskEdit.collapse") : t("taskEdit.expand")}
              style={{
                position: "absolute",
                right: 10,
                bottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 24,
                height: 24,
                borderRadius: 6,
                border: "none",
                background: "rgba(197, 184, 158, 0.25)",
                color: "#9f927d",
                cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255, 204, 0, 0.3)";
                e.currentTarget.style.color = "#725d42";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(197, 184, 158, 0.25)";
                e.currentTarget.style.color = "#9f927d";
              }}
            >
              {descExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>{t("taskEdit.goal")}</span>
            <select value={goalId} onChange={(e) => { setGoalId(e.target.value); setParentId(""); }} style={{ ...inputStyle, padding: "8px 10px", boxShadow: "none", borderWidth: 2 }}>
              <option value="">{t("taskEdit.noGoal")}</option>
              {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>{t("taskEdit.parent")}</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ ...inputStyle, padding: "8px 10px", boxShadow: "none", borderWidth: 2 }}>
              <option value="">{t("taskEdit.noParent")}</option>
              {tasks.filter((candidate) => !invalidParentIds.has(candidate.id) && (!goalId || candidate.goal_id === goalId)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>{t("taskEdit.kind")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as Task["kind"])} style={{ ...inputStyle, padding: "8px 10px", boxShadow: "none", borderWidth: 2 }}>
              <option value="task">{t("taskEdit.kindTask")}</option>
              <option value="milestone">{t("taskEdit.kindMilestone")}</option>
            </select>
          </label>
        </div>

        {/* Priority + Duration row */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
              {t("taskEdit.priority")}: {priority}
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={priority}
              onChange={(e) => setPriority(parseInt(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #19c8b9 ${(priority - 1) * 100 / 9}%, #e8e2d6 ${(priority - 1) * 100 / 9}%)`,
              }}
            />
          </div>
          <div className="w-28">
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
              {t("taskEdit.estimatedDuration")}
            </label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                size="small"
              />
              <span className="text-xs shrink-0" style={{ color: "#9f927d" }}>
                {t("taskEdit.minutes")}
              </span>
            </div>
          </div>
        </div>

        {/* Deadline + Category + Energy row */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
              {t("taskEdit.deadline")}
            </label>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={{
                  ...inputStyle,
                  padding: "6px 12px",
                  fontSize: 13,
                }}
                {...focusHandlers}
              />
              {deadline && (
                <button
                  onClick={() => setDeadline("")}
                  className="shrink-0 p-1"
                  style={{ color: "#c4b89e" }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
              {t("taskEdit.category")}
            </label>
            <Select
              value={category}
              onChange={(v) => setCategory(v)}
              options={categoryOptions}
              placeholder={t("taskEdit.noCategory")}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
              {t("taskEdit.energyLevel")}
            </label>
            <div className="relative" style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setEnergyOpen(!energyOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 13px",
                  fontSize: 14,
                  fontWeight: energyLevel ? 600 : 400,
                  fontFamily: "inherit",
                  color: energyLevel ? "#725d42" : "#a09080",
                  background: "#fff",
                  border: energyOpen ? "2px solid #ffcc00" : "2px solid #e8dcc8",
                  borderRadius: 12,
                  cursor: "pointer",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) => { if (!energyOpen) e.currentTarget.style.borderColor = "#d4c4a8"; }}
                onMouseLeave={(e) => { if (!energyOpen) e.currentTarget.style.borderColor = "#e8dcc8"; }}
              >
                <span>
                  {energyOptions.find((o) => o.key === energyLevel)?.label || t("taskEdit.noEnergyLevel")}
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: "#a09080",
                    transition: "transform 0.2s",
                    transform: energyOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>
              {energyOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: "100%",
                    marginRight: 6,
                    transform: "translateY(-50%)",
                    background: "#ffeea0",
                    borderRadius: 28,
                    padding: "8px 0",
                    zIndex: 200,
                    boxShadow: "0 4px 16px rgba(107,92,67,0.2)",
                    whiteSpace: "nowrap",
                    minWidth: 120,
                  }}
                >
                  {energyOptions.map((o) => {
                    const isHovered = energyHovered === o.key;
                    const isActive = energyLevel === o.key;
                    return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => {
                        setEnergyLevel(o.key);
                        setEnergyOpen(false);
                      }}
                      onMouseEnter={() => setEnergyHovered(o.key)}
                      onMouseLeave={() => { if (energyHovered === o.key) setEnergyHovered(null); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 20px",
                        fontSize: 14,
                        fontWeight: isActive ? 700 : 500,
                        fontFamily: "inherit",
                        color: "#725d42",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        position: "relative",
                      }}
                    >
                      {isHovered && (
                        <span
                          style={{
                            position: "absolute",
                            left: -14,
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: 36,
                            height: 36,
                            background: "url(/cursor.svg) no-repeat center / contain",
                            pointerEvents: "none",
                          }}
                        />
                      )}
                      {o.label}
                    </button>
                    );
                  })}
                </div>
              )}
              {/* Backdrop to close dropdown on outside click */}
              {energyOpen && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 199,
                  }}
                  onClick={() => setEnergyOpen(false)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
            {t("taskEdit.tags")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={t("taskEdit.tagsPlaceholder")}
              size="small"
            />
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1"
                  style={{
                    borderRadius: 50,
                    background: "#f0e8d8",
                    padding: "2px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#725d42",
                    cursor: "pointer",
                  }}
                  onClick={() => handleRemoveTag(tag)}
                >
                  {tag}
                  <X size={10} />
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
