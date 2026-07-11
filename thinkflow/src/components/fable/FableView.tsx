// Fable state is persisted in useFableStore across route changes
import { useFableStore } from "@/stores/fableStore";
import { useTranslation } from "react-i18next";
import { Card, Button, Icon, Input } from "animal-island-ui";
import { Loader2, AlertCircle, Settings, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function FableView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    concept,
    fable,
    loading,
    error,
    setConcept,
    generateFable,
    setError,
  } = useFableStore();

  const handleGenerate = () => {
    generateFable();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      handleGenerate();
    }
  };

  // No LLM configured
  if (error === "no_llm") {
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
          <div
            className="p-6 pb-2"
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: "#794f27",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="icon-map" size={22} style={{ color: "#19c8b9" }} />
            {t("fable.title")}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
            <AlertCircle size={40} style={{ color: "#f7cd67" }} />
            <div>
              <p className="font-medium" style={{ color: "#725d42" }}>
                {t("fable.noLlm")}
              </p>
              <p className="text-sm mt-1" style={{ color: "#9f927d" }}>
                {t("fable.noLlmHint")}
              </p>
            </div>
            <Button
              type="primary"
              onClick={() => navigate("/settings")}
              icon={<Settings size={16} />}
            >
              {t("fable.goToSettings")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Has result
  if (fable !== null) {
    const lines = fable.split("\n");
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1 min-h-0" style={{ display: "flex", flexDirection: "column" }}>
          <div
            className="p-6 pb-2"
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: "#794f27",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="icon-map" size={22} style={{ color: "#19c8b9" }} />
            {t("fable.title")}
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-4 p-6 pt-2">
            <div
              className="flex-1 overflow-auto p-5"
              style={{
                borderRadius: 18,
                background: "rgba(240,232,216,0.5)",
              }}
            >
              <div className="max-w-none">
                {lines.map((line, i) => {
                  // Markdown headers
                  if (line.startsWith("### ")) {
                    return (
                      <h4
                        key={i}
                        className="text-sm font-semibold mt-4 mb-2"
                        style={{ color: "#19c8b9" }}
                      >
                        {line.replace("### ", "")}
                      </h4>
                    );
                  }
                  if (line.startsWith("## ")) {
                    return (
                      <h3
                        key={i}
                        className="text-base font-bold mt-5 mb-2"
                        style={{ color: "#794f27" }}
                      >
                        {line.replace("## ", "")}
                      </h3>
                    );
                  }
                  if (line.startsWith("# ")) {
                    return (
                      <h2
                        key={i}
                        className="text-lg font-bold mt-5 mb-3"
                        style={{ color: "#794f27" }}
                      >
                        {line.replace("# ", "")}
                      </h2>
                    );
                  }
                  // Horizontal rule
                  if (line.trim() === "---") {
                    return (
                      <hr
                        key={i}
                        className="my-4"
                        style={{ borderColor: "#c4b89e", opacity: 0.5 }}
                      />
                    );
                  }
                  // Bold line (section title)
                  if (line.startsWith("**") && line.endsWith("**")) {
                    return (
                      <h3
                        key={i}
                        className="text-sm font-semibold mt-4 first:mt-0"
                        style={{ color: "#794f27" }}
                      >
                        {line.replace(/\*\*/g, "")}
                      </h3>
                    );
                  }
                  // Empty line
                  if (line.trim() === "") return <div key={i} className="h-2" />;
                  // Numbered list
                  if (/^\d+\.\s/.test(line)) {
                    return (
                      <p
                        key={i}
                        className="text-sm leading-relaxed ml-4"
                        style={{ color: "#725d42" }}
                      >
                        {line.replace(/\*\*/g, "")}
                      </p>
                    );
                  }
                  // Bullet list
                  if (line.startsWith("- ")) {
                    return (
                      <p
                        key={i}
                        className="text-sm leading-relaxed ml-4"
                        style={{ color: "#725d42" }}
                      >
                        {line.replace(/\*\*/g, "")}
                      </p>
                    );
                  }
                  // Blockquote
                  if (line.startsWith("> ")) {
                    return (
                      <p
                        key={i}
                        className="text-sm leading-relaxed italic ml-4"
                        style={{ color: "#9f927d" }}
                      >
                        {line.replace("> ", "").replace(/\*\*/g, "")}
                      </p>
                    );
                  }
                  // Regular paragraph
                  return (
                    <p
                      key={i}
                      className="text-sm leading-relaxed"
                      style={{ color: "#725d42" }}
                    >
                      {line.replace(/\*\*/g, "")}
                    </p>
                  );
                })}
              </div>
            </div>
            {/* Input for another concept */}
            <div className="flex gap-2">
              <Input
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("fable.placeholder")}
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                onClick={handleGenerate}
                disabled={loading || !concept.trim()}
                icon={
                  loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )
                }
              >
                {loading ? t("fable.generating") : t("fable.generate")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
        <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
          <div
            className="p-6 pb-2"
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: "#794f27",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="icon-map" size={22} style={{ color: "#19c8b9" }} />
            {t("fable.title")}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
            <AlertCircle size={40} style={{ color: "#e05a5a" }} />
            <div>
              <p className="font-medium" style={{ color: "#e05a5a" }}>
                {t("fable.error")}
              </p>
              <p className="text-sm mt-1 max-w-sm" style={{ color: "#9f927d" }}>
                {error}
              </p>
            </div>
            <Button type="dashed" onClick={() => setError(null)}>
              {t("fable.tryAgain")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Initial state
  return (
    <div className="max-w-5xl mx-auto p-6 h-full flex flex-col">
      <Card className="flex-1" style={{ display: "flex", flexDirection: "column" }}>
        <div
          className="p-6 pb-2"
          style={{
            fontWeight: 700,
            fontSize: 18,
            color: "#794f27",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="icon-map" size={22} style={{ color: "#19c8b9" }} />
          {t("fable.title")}
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
            <Icon name="icon-map" size={48} style={{ color: "#19c8b9" }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-1" style={{ color: "#725d42" }}>
              {t("fable.title")}
            </h3>
            <p className="text-sm max-w-xl" style={{ color: "#9f927d" }}>
              {t("fable.description")}
            </p>
          </div>
          <div className="flex gap-2 w-full max-w-md">
            <Input
              value={concept}
              onChange={(e) => setConcept(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("fable.placeholder")}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              size="large"
              onClick={handleGenerate}
              disabled={loading || !concept.trim()}
              icon={
                loading ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <Sparkles size={20} />
                )
              }
            >
              {loading ? t("fable.generating") : t("fable.generate")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
