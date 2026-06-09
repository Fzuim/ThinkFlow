import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "animal-island-ui";
import { Button } from "animal-island-ui";
import { Divider, Icon } from "animal-island-ui";
import {
  RefreshCw,
  Loader2,
  ArrowRight,
  AlertCircle,
  Settings,
  Timer,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useFocusStore } from "@/stores/focusStore";
import { useTaskStore } from "@/stores/taskStore";

export default function FocusView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { result, loading, error, init, analyze } = useFocusStore();
  const moveTask = useTaskStore((s) => s.moveTask);
  const getTaskById = useTaskStore((s) => s.getTaskById);

  const handleStartFocus = () => {
    if (result?.task_id) {
      const task = getTaskById(result.task_id);
      if (task && task.status === "todo") {
        moveTask(task.id, "in_progress");
      }
    }
    navigate("/");
  };

  useEffect(() => { init(); }, [init]);

  if (error === "no_llm") {
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
          <div className="p-6 pb-2" style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="icon-miles" size={20} />
            {t("focus.title")}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
            <AlertCircle size={40} style={{ color: "#f7cd67" }} />
            <div>
              <p className="font-medium" style={{ color: "#725d42" }}>{t("focus.noLlm")}</p>
              <p className="text-sm mt-1" style={{ color: "#9f927d" }}>{t("focus.noLlmHint")}</p>
            </div>
            <Button type="primary" onClick={() => navigate("/settings")} icon={<Settings size={16} />}>
              {t("focus.goToSettings")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
          <div className="p-6 pb-2" style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="icon-miles" size={20} />
            {t("focus.title")}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
            <AlertCircle size={40} style={{ color: "#e05a5a" }} />
            <div>
              <p className="font-medium" style={{ color: "#e05a5a" }}>{t("focus.error")}</p>
              <p className="text-sm mt-1 max-w-sm" style={{ color: "#9f927d" }}>{error}</p>
            </div>
            <Button type="dashed" onClick={analyze} icon={<RefreshCw size={16} />}>
              {t("focus.whatNow")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
          <div className="p-6 pb-2" style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="icon-miles" size={20} />
            {t("focus.title")}
          </div>
          <div className="flex-1 flex flex-col gap-4 p-6 pt-2">
            {result.task_title ? (
              <>
                <div
                  style={{
                    borderRadius: 18,
                    border: "2px solid rgba(25,200,185,0.3)",
                    background: "rgba(25,200,185,0.05)",
                    padding: 16,
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#9f927d" }}>
                    {t("focus.recommendation")}
                  </p>
                  <p className="text-lg font-semibold" style={{ color: "#725d42" }}>{result.task_title}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold mb-1" style={{ color: "#9f927d" }}>
                    {t("focus.reasoning")}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "#725d42" }}>{result.reasoning}</p>
                </div>

                <Divider />

                {result.suggested_focus && (
                  <div
                    className="flex items-center gap-3 p-3"
                    style={{
                      borderRadius: 18,
                      background: "#f0e8d8",
                    }}
                  >
                    <Timer size={18} style={{ color: "#19c8b9" }} />
                    <div>
                      <p className="text-xs" style={{ color: "#9f927d" }}>{t("focus.suggestedFocus")}</p>
                      <p className="text-sm font-semibold" style={{ color: "#725d42" }}>
                        {result.suggested_focus} {t("focus.minutes")}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
                <Zap size={36} style={{ color: "#c4b89e", opacity: 0.4 }} />
                <div>
                  <p className="font-medium" style={{ color: "#725d42" }}>{t("focus.noTasks")}</p>
                  <p className="text-sm mt-1" style={{ color: "#9f927d" }}>{t("focus.noTasksHint")}</p>
                </div>
              </div>
            )}

            <div className="mt-auto flex gap-3 justify-end">
              <Button type="dashed" onClick={analyze} disabled={loading} icon={<RefreshCw size={16} />}>
                {t("focus.whatNow")}
              </Button>
              {result.task_title && (
                <Button type="primary" onClick={handleStartFocus} icon={<ArrowRight size={16} />}>
                  {t("focus.startFocus")}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Initial / loading state
  return (
    <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
      <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
        <div className="p-6 pb-2" style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="icon-miles" size={20} />
          {t("focus.title")}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 p-6">
          <div
            style={{
              borderRadius: "50%",
              background: "rgba(25,200,185,0.1)",
              padding: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="icon-miles" size={48} style={{ color: "#19c8b9" }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: "#725d42" }}>{t("focus.title")}</h3>
            <p className="text-sm max-w-xs" style={{ color: "#9f927d" }}>
              {t("focus.description")}
            </p>
          </div>
          <Button type="primary" size="large" onClick={analyze} disabled={loading} icon={loading ? <Loader2 size={20} className="animate-spin" /> : <RefreshCw size={20} />}>
            {loading ? t("focus.analyzing") : t("focus.whatNow")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
