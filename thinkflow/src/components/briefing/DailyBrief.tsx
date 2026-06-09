import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "animal-island-ui";
import { Button, Icon } from "animal-island-ui";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBriefingStore } from "@/stores/briefingStore";

export default function DailyBrief() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { briefing, loading, error, init, generate } = useBriefingStore();

  useEffect(() => { init(); }, [init]);

  if (error === "no_llm") {
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
          <div className="p-6 pb-2" style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="icon-design" size={22} style={{ color: "#19c8b9" }} />
            {t("dailyBrief.title")}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
            <AlertCircle size={40} style={{ color: "#f7cd67" }} />
            <div>
              <p className="font-medium" style={{ color: "#725d42" }}>{t("dailyBrief.noLlm")}</p>
              <p className="text-sm mt-1" style={{ color: "#9f927d" }}>{t("dailyBrief.noLlmHint")}</p>
            </div>
            <Button type="primary" onClick={() => navigate("/settings")} icon={<Settings size={16} />}>
              {t("dailyBrief.goToSettings")}
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
            <Icon name="icon-design" size={22} style={{ color: "#19c8b9" }} />
            {t("dailyBrief.title")}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
            <AlertCircle size={40} style={{ color: "#e05a5a" }} />
            <div>
              <p className="font-medium" style={{ color: "#e05a5a" }}>{t("dailyBrief.error")}</p>
              <p className="text-sm mt-1 max-w-sm" style={{ color: "#9f927d" }}>{error}</p>
            </div>
            <Button type="dashed" onClick={generate} icon={<RefreshCw size={16} />}>
              {t("dailyBrief.generate")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (briefing !== null) {
    const lines = briefing.split("\n");
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1 min-h-0" style={{ display: "flex", flexDirection: "column" }}>
          <div className="p-6 pb-2" style={{ fontWeight: 700, fontSize: 18, color: "#794f27", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="icon-design" size={22} style={{ color: "#19c8b9" }} />
            {t("dailyBrief.title")}
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-4 p-6 pt-2">
            <div
              className="flex-1 overflow-auto p-5"
              style={{
                borderRadius: 18,
                background: "rgba(240,232,216,0.5)",
              }}
            >
              <div className="max-w-none space-y-2">
                {lines.map((line, i) => {
                  if (line.startsWith("**") && line.includes("**")) {
                    const text = line.replace(/\*\*/g, "");
                    return (
                      <h3 key={i} className="text-sm font-semibold mt-4 first:mt-0" style={{ color: "#794f27" }}>
                        {text}
                      </h3>
                    );
                  }
                  if (line.trim() === "") return <div key={i} className="h-2" />;
                  return (
                    <p key={i} className="text-sm leading-relaxed" style={{ color: "#725d42" }}>
                      {line}
                    </p>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="dashed" onClick={generate} disabled={loading} icon={<RefreshCw size={16} />}>
                {t("dailyBrief.regenerate")}
              </Button>
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
          <Icon name="icon-design" size={22} style={{ color: "#19c8b9" }} />
          {t("dailyBrief.title")}
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
            <Icon name="icon-design" size={48} style={{ color: "#19c8b9" }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: "#725d42" }}>{t("dailyBrief.title")}</h3>
            <p className="text-sm max-w-xs" style={{ color: "#9f927d" }}>
              {t("dailyBrief.description")}
            </p>
          </div>
          <Button type="primary" size="large" onClick={generate} disabled={loading} icon={loading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}>
            {loading ? t("dailyBrief.generating") : t("dailyBrief.generate")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
