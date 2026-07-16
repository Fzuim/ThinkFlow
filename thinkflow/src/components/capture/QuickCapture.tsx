import { useState } from "react";
import { Button } from "animal-island-ui";
import {
  Sparkles,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTaskStore, type Task } from "@/stores/taskStore";
import { useNavigate } from "react-router-dom";

interface AssistantAction {
  type: "create" | "update" | "delete" | "move";
  task_id?: string;
  task?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  status?: string;
}

interface TaskAssistantResponse {
  reply: string;
  actions: AssistantAction[];
}

function executeAction(action: AssistantAction) {
  const taskStore = (window as any).__TASK_STORE__;
  if (!taskStore) return;

  switch (action.type) {
    case "create": {
      const t = action.task ?? {};
      const priority = typeof t.priority === "number" ? t.priority : 5;
      const task: Task = {
        id: crypto.randomUUID(),
        title: (t.title as string) ?? "Untitled task",
        description: "",
        priority,
        urgency: priority >= 7 ? "urgent" : priority <= 3 ? "low" : "normal",
        importance: priority >= 7 ? "important" : "normal",
        status: "todo",
        deadline: (t.deadline as string) ?? null,
        estimated_duration: (t.estimated_duration as number) ?? null,
        energy_level: (t.energy_level as Task["energy_level"]) ?? null,
        category: (t.category as Task["category"]) ?? null,
        tags: Array.isArray(t.tags) ? (t.tags as string[]) : [],
        stakeholder: (t.stakeholder as string) ?? null,
        dependencies: [],
        source_text: null,
        progress_log: [],
        goal_id: null,
        parent_id: null,
        kind: "task",
        start_at: null,
        planned_end_at: null,
        weight: 1,
        sort_order: 0,
        schedule_level: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      taskStore.addTask(task);
      break;
    }
    case "update": {
      if (!action.task_id) return;
      taskStore.updateTask(action.task_id, action.updates as Partial<Task>);
      break;
    }
    case "delete": {
      if (!action.task_id) return;
      taskStore.deleteTask(action.task_id);
      break;
    }
    case "move": {
      if (!action.task_id || !action.status) return;
      taskStore.moveTask(action.task_id, action.status as Task["status"]);
      break;
    }
  }
}

interface QuickCaptureProps {
  onClose?: () => void;
}

function QuickCapture() {
  return null;
}

/**
 * Modal variant triggered by global hotkey.
 * Simplified chat: input → execute → show reply → auto-close.
 */
QuickCapture.Modal = function QuickCaptureModal({ onClose }: QuickCaptureProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const { addTask, updateTask, deleteTask, moveTask, getTaskById } = useTaskStore();
  const navigate = useNavigate();

  // Expose store for executeAction helper
  if (typeof window !== "undefined") {
    (window as any).__TASK_STORE__ = { addTask, updateTask, deleteTask, moveTask, getTaskById };
  }

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setModalError(null);
    setReply(null);

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<TaskAssistantResponse>("task_assistant", {
        message: input.trim(),
        history: "[]",
        goalId: null,
      });

      // Execute actions
      for (const action of res.actions) {
        try {
          executeAction(action);
        } catch { /* silently ignore */ }
      }

      setReply(res.reply);
      setLoading(false);
      setInput("");

      // Auto-close after a short delay
      setTimeout(() => {
        onClose?.();
        navigate("/");
      }, 1500);
    } catch (e) {
      const message = e instanceof Error ? e.message : t("taskAssistant.error.unknownError");
      setModalError(message);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3" style={{ width: "100%" }}>
      {/* Reply display */}
      {reply && (
        <div
          style={{
            borderRadius: 18,
            background: "#f0e8d8",
            padding: 12,
          }}
        >
          <p className="text-sm leading-relaxed" style={{ color: "#725d42" }}>{reply}</p>
        </div>
      )}
      <textarea
        placeholder={t("taskAssistant.modal.placeholder")}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        style={{
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
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "#ffcc00";
          e.target.style.boxShadow = "0 3px 0 0 #e0b800, 0 0 0 3px rgba(255,204,0,0.15)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#c4b89e";
          e.target.style.boxShadow = "0 3px 0 0 #d4c9b4";
        }}
      />
      {modalError && (
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            borderRadius: 18,
            background: "rgba(224,90,90,0.08)",
            border: "1px solid rgba(224,90,90,0.3)",
          }}
        >
          <p className="text-xs" style={{ color: "#e05a5a", opacity: 0.8 }}>{modalError}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "#c4b89e" }}>
          {t("quickCapture.modalSubmitHint")}
        </p>
        <Button type="primary" onClick={handleSubmit} disabled={loading || !input.trim()} icon={loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}>
          {loading ? t("taskAssistant.thinking") : t("taskAssistant.send")}
        </Button>
      </div>
    </div>
  );
};

export default QuickCapture;
