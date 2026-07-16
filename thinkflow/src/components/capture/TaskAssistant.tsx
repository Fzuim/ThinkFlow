import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, Icon, Tooltip } from "animal-island-ui";
import { useChatStore, type ChatMessage, type ActionResult } from "@/stores/chatStore";
import {
  ArrowLeft,
  Loader2,
  Send,
  Square,
  Trash2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Pencil,
  Check,
  Copy,
  X,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useGoalStore } from "@/stores/goalStore";

function ActionBadges({ actions, results }: { actions: ChatMessage["actions"]; results?: ActionResult[] }) {
  const { t } = useTranslation();
  if (!actions || actions.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {actions.map((action, i) => {
        const result = results?.[i];
        const success = result?.success ?? false;
        const title = result?.taskTitle;

        const icon =
          action.type === "create" || action.type === "create_goal" ? (
            <CheckCircle2 size={12} style={{ color: success ? "#6fba2c" : "#e05a5a" }} />
          ) : action.type === "delete" ? (
            <Trash2 size={12} style={{ color: success ? "#e05a5a" : "#e05a5a" }} />
          ) : action.type === "move" ? (
            <ArrowRight size={12} style={{ color: success ? "#889df0" : "#e05a5a" }} />
          ) : (
            <Pencil size={12} style={{ color: success ? "#889df0" : "#e05a5a" }} />
          );

        const label =
          action.type === "create" || action.type === "create_goal"
            ? t(action.type === "create_goal" ? "taskAssistant.actions.goalCreated" : "taskAssistant.actions.created")
            : action.type === "delete"
              ? t("taskAssistant.actions.deleted")
              : action.type === "move"
                ? t("taskAssistant.actions.moved", { status: action.status })
                : t("taskAssistant.actions.updated");

        return (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            {icon}
            <span style={{ color: success ? "#9f927d" : "#e05a5a" }}>
              {label}
              {title && <span className="font-semibold ml-1">&ldquo;{title}&rdquo;</span>}
            </span>
            {!success && result?.error && (
              <span style={{ color: "#e05a5a", opacity: 0.7 }}>({result.error})</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SuggestedActionsButtons({
  messageId,
  confirmed,
  onConfirm,
}: {
  messageId: string;
  confirmed: boolean | null | undefined;
  onConfirm: (id: string, confirmed: boolean) => void;
}) {
  const { t } = useTranslation();

  if (confirmed !== null && confirmed !== undefined) return null;

  return (
    <div className="flex gap-2 mt-2">
      <Button
        size="small"
        type="dashed"
        onClick={() => onConfirm(messageId, true)}
        icon={<Check size={12} />}
      >
        {t("taskAssistant.confirmYes")}
      </Button>
      <Button
        size="small"
        type="text"
        onClick={() => onConfirm(messageId, false)}
        icon={<X size={12} />}
      >
        {t("taskAssistant.confirmNo")}
      </Button>
    </div>
  );
}

function ReasoningSection({
  reasoning,
  messageId,
  expanded,
  onToggle,
}: {
  reasoning: string;
  messageId: string;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-2">
      <button
        onClick={() => onToggle(messageId)}
        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-100"
        style={{ color: "#9f927d", opacity: 0.7, cursor: "pointer" }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{t("taskAssistant.thoughtProcess")}</span>
      </button>
      {expanded && (
        <div
          className="mt-1.5 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap"
          style={{
            borderRadius: 10,
            background: "rgba(114,93,66,0.06)",
            color: "#9f927d",
            borderLeft: "2px solid rgba(114,93,66,0.15)",
          }}
        >
          {reasoning}
        </div>
      )}
    </div>
  );
}

// Preserve draft input across page navigations (component mount/unmount cycles)
let _draftInput = "";

export default function TaskAssistant() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const goalId = searchParams.get("goalId");
  const isGoalPlanningMode = searchParams.get("mode") === "goal";
  const { goals, init: initGoals } = useGoalStore();
  const scopedGoal = goals.find((goal) => goal.id === goalId);
  const { messages, loading, error, isLoaded, streamingContent, streamingReasoning, init, sendMessage, stopStreaming, confirmSuggested, clearChat } = useChatStore();
  const [input, setInput] = useState(_draftInput);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [roundCount, setRoundCount] = useState(() => { try { const v = localStorage.getItem("thinkflow_chat_rounds"); return v ? Math.max(1, Math.min(20, parseInt(v, 10))) : 3; } catch { return 3; } });
  const [showSlider, setShowSlider] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleReasoning = useCallback((id: string) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Auto-expand reasoning when thinking starts; auto-collapse when reply starts
  const [streamingReasoningExpanded, setStreamingReasoningExpanded] = useState(true);
  useEffect(() => {
    if (streamingReasoning) setStreamingReasoningExpanded(true);
  }, [streamingReasoning]);
  useEffect(() => {
    if (streamingContent) setStreamingReasoningExpanded(false);
  }, [streamingContent]);

  useEffect(() => { init(goalId); }, [init, goalId]);
  useEffect(() => { initGoals(); }, [initGoals]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading, streamingContent, streamingReasoning]);

  const handleSend = useCallback(() => {
    if (!input.trim() || loading) return;
    const context = !goalId && isGoalPlanningMode
      ? "The user entered from Goal Plan and wants to define or decompose a new long-term goal. Guide them to clarify success criteria, target date, current level and available time."
      : undefined;
    sendMessage(input.trim(), goalId, context);
    setInput("");
    _draftInput = "";
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, loading, sendMessage, goalId, isGoalPlanningMode]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    _draftInput = e.target.value;
    setInput(e.target.value);
    // Auto-grow
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }, []);

  const suggestions = scopedGoal
    ? [
        t("taskAssistant.goalSuggestions.decompose"),
        t("taskAssistant.goalSuggestions.adjust"),
        t("taskAssistant.goalSuggestions.progress"),
        t("taskAssistant.goalSuggestions.review"),
      ]
    : isGoalPlanningMode
      ? [
          t("taskAssistant.planningSuggestions.study"),
          t("taskAssistant.planningSuggestions.career"),
          t("taskAssistant.planningSuggestions.health"),
          t("taskAssistant.planningSuggestions.clarify"),
        ]
      : [
          t("taskAssistant.suggestions.create"),
          t("taskAssistant.suggestions.status"),
          t("taskAssistant.suggestions.delete"),
          t("taskAssistant.suggestions.help"),
        ];

  return (
    <div className="h-full flex flex-col" style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button type="text" onClick={() => navigate(scopedGoal ? `/goals/${scopedGoal.id}` : isGoalPlanningMode ? "/goals" : "/")}>
            <ArrowLeft size={16} />
          </Button>
          <Icon name="icon-chat" size={22} style={{ color: "#19c8b9" }} />
          <h2 className="text-xl font-semibold" style={{ color: "#725d42" }}>
            {t(scopedGoal ? "taskAssistant.goalTitle" : isGoalPlanningMode ? "taskAssistant.planningTitle" : "taskAssistant.title")}
          </h2>
          {scopedGoal && <button onClick={() => navigate(`/goals/${scopedGoal.id}`)} className="text-xs px-2 py-1" style={{ borderRadius: 99, background: "#e8f7f4", color: "#168f85" }}>{scopedGoal.title}</button>}
        </div>
        <Button type="text" onClick={clearChat} title={t("taskAssistant.clearChat")}>
          <Trash2 size={16} />
        </Button>
      </div>

      {scopedGoal && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 mb-4 text-xs" style={{ borderRadius: 14, background: "#eef8f6", border: "1px solid #bde5df", color: "#39766f" }}>
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} />
            <span>{t("taskAssistant.strictScope", { goal: scopedGoal.title })}</span>
          </div>
          <button className="font-semibold whitespace-nowrap" style={{ color: "#168f85" }} onClick={() => navigate("/capture")}>
            {t("taskAssistant.switchGeneral")}
          </button>
        </div>
      )}

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto space-y-4 mb-4 flex flex-col items-center">
        {/* Welcome + suggestions */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-4" style={{ width: "min(720px, calc(100vw - 64px))", maxWidth: "100%" }}>
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
              <Icon name="icon-chat" size={48} style={{ color: "#19c8b9" }} />
            </div>
            <p className="text-sm max-w-sm" style={{ color: "#9f927d" }}>
              {t(scopedGoal ? "taskAssistant.goalWelcome" : isGoalPlanningMode ? "taskAssistant.planningWelcome" : "taskAssistant.welcome")}
            </p>
            <div className="space-y-2 w-full">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 text-sm transition-all"
                  style={{
                    borderRadius: 18,
                    border: "2px solid #c4b89e",
                    background: "transparent",
                    color: "#725d42",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(25,200,185,0.08)";
                    e.currentTarget.style.borderColor = "#19c8b9";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "#c4b89e";
                  }}
                  onClick={() => { _draftInput = s; setInput(s); textareaRef.current?.focus(); }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`} style={{ width: "min(720px, calc(100vw - 64px))", maxWidth: "100%" }}>
            {msg.role === "assistant" && (
              <div
                className="w-9 h-9 shrink-0 mt-0.5 flex items-center justify-center"
                style={{
                  borderRadius: "50%",
                  background: "rgba(25,200,185,0.1)",
                }}
              >
                <Icon name="icon-chat" size={22} />
              </div>
            )}
            {msg.role === "user" ? (
              <div className="flex flex-col items-end">
                <div
                  className="px-3.5 py-2.5 text-sm leading-relaxed"
                  style={{
                    borderRadius: 18,
                    background: "#19c8b9",
                    color: "#fff",
                  }}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(msg.content);
                    setCopiedMessageId(msg.id);
                    setTimeout(() => setCopiedMessageId(null), 1500);
                  }}
                  className="opacity-30 hover:opacity-100 transition-opacity relative"
                  style={{ color: "#9f927d", marginRight: 4, marginTop: 2 }}
                  title="Copy"
                >
                  {copiedMessageId === msg.id ? (
                    <span className="text-xs" style={{ color: "#6fba2c" }}>{t("taskAssistant.copied")}</span>
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            ) : (
              <div
                className="max-w-[80%] px-3.5 py-2.5 text-sm leading-relaxed"
                style={{
                  borderRadius: 18,
                  background: "#f0e8d8",
                  color: "#725d42",
                }}
              >
                {msg.reasoning && (
                  <ReasoningSection
                    reasoning={msg.reasoning}
                    messageId={msg.id}
                    expanded={expandedReasoning.has(msg.id)}
                    onToggle={toggleReasoning}
                  />
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <ActionBadges actions={msg.actions} results={msg.actionResults} />
                {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                  <SuggestedActionsButtons
                    messageId={msg.id}
                    confirmed={msg.suggestedConfirmed}
                    onConfirm={confirmSuggested}
                  />
                )}
                {msg.suggestedConfirmed === false && (
                  <p className="text-xs mt-1 italic" style={{ color: "#9f927d" }}>{t("taskAssistant.suggestionDismissed")}</p>
                )}
              </div>
            )}
            {msg.role === "user" && (
              <div
                className="w-9 h-9 shrink-0 mt-0.5 flex items-center justify-center"
                style={{
                  borderRadius: "50%",
                  background: "#f0e8d8",
                }}
              >
                <Icon name="icon-critterpedia" size={22} />
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator - typewriter streaming */}
        <style>{`
          @keyframes cursor-blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
        {loading && (
          <div className="flex gap-2.5 justify-start" style={{ width: "min(720px, calc(100vw - 64px))", maxWidth: "100%" }}>
            <div
              className="w-9 h-9 shrink-0 flex items-center justify-center"
              style={{
                borderRadius: "50%",
                background: "rgba(25,200,185,0.1)",
              }}
            >
              <Icon name="icon-chat" size={22} />
            </div>
            {streamingContent ? (
              <div
                className="px-3.5 py-2.5 text-sm leading-relaxed"
                style={{
                  borderRadius: 18,
                  background: "#f0e8d8",
                  color: "#725d42",
                }}
              >
                {streamingReasoning && (
                  <ReasoningSection
                    reasoning={streamingReasoning}
                    messageId="streaming"
                    expanded={streamingReasoningExpanded}
                    onToggle={() => setStreamingReasoningExpanded((prev) => !prev)}
                  />
                )}
                <p className="whitespace-pre-wrap">
                  {streamingContent}
                  <span
                    className="inline-block w-[2px] h-[1em] ml-0.5 align-middle"
                    style={{
                      background: "#725d42",
                      animation: "cursor-blink 1s step-end infinite",
                    }}
                  />
                </p>
              </div>
            ) : streamingReasoning ? (
              <div
                className="px-3.5 py-2.5 text-sm leading-relaxed"
                style={{
                  borderRadius: 18,
                  background: "#f0e8d8",
                  color: "#725d42",
                }}
              >
                <ReasoningSection
                  reasoning={streamingReasoning}
                  messageId="streaming"
                  expanded={streamingReasoningExpanded}
                  onToggle={() => setStreamingReasoningExpanded((prev) => !prev)}
                />
                <div className="flex items-center gap-1.5 mt-1">
                  <Loader2 size={13} className="animate-spin" style={{ color: "#9f927d" }} />
                  <span className="text-xs" style={{ color: "#9f927d" }}>{t("taskAssistant.thinking")}</span>
                </div>
              </div>
            ) : (
              <div
                className="px-3.5 py-2.5 flex items-center gap-2"
                style={{
                  borderRadius: 18,
                  background: "#f0e8d8",
                }}
              >
                <Loader2 size={16} className="animate-spin" style={{ color: "#9f927d" }} />
                <span className="text-sm" style={{ color: "#9f927d" }}>{t("taskAssistant.thinking")}</span>
              </div>
            )}

          </div>

        )}

        {/* Error */}
        {error && (
          <div
            style={{
              width: "min(720px, calc(100vw - 64px))",
              maxWidth: "100%",
              borderRadius: 18,
              background: "rgba(224,90,90,0.08)",
              border: "1px solid rgba(224,90,90,0.3)",
            }}
          >
            <div className="flex items-start gap-2 px-3 py-2">
              <XCircle size={14} style={{ color: "#e05a5a" }} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed flex-1" style={{ color: "#e05a5a", opacity: 0.9 }}>
                {error === "no_llm" ? t("taskAssistant.error.noLlm") : error}
              </p>
            </div>
            {error !== "no_llm" && (
              <div className="flex justify-end px-3 pb-2">
                <button
                  className="text-xs px-2 py-0.5"
                  style={{
                    color: "#e05a5a",
                    opacity: 0.6,
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => navigator.clipboard.writeText(error)}
                >
                  {t("taskAssistant.copyError")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex justify-center">
        <div
          style={{
            width: "min(720px, calc(100vw - 64px))",
            maxWidth: "100%",
            background: "rgb(247, 243, 223)",
            border: "2.5px solid #c4b89e",
            borderRadius: 18,
            boxShadow: "0 3px 0 0 #d4c9b4",
            overflow: "hidden",
          }}
        >
          <textarea
            ref={textareaRef}
            placeholder={t("taskAssistant.placeholder")}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={loading || !isLoaded}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "none",
              background: "transparent",
              border: "none",
              borderRadius: 0,
              padding: "8px 16px 4px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#725d42",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          {/* Bottom bar: rounds chip (left) + send button (right) */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "2px 10px 6px 10px",
            }}
          >
            {/* Rounds chip + popover */}
            <div style={{ position: "relative" }}>
              <Tooltip title={t("taskAssistant.chatRoundsHint")} placement="top-start">
                <div
                  onClick={() => setShowSlider(!showSlider)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 9px",
                    borderRadius: 16,
                    cursor: "pointer",
                    background: "#f0e8d8",
                    border: "1.5px solid #c4b89e",
                    userSelect: "none",
                  }}
                >
                  <Icon name="icon-chat" size={13} style={{ color: "#725d42" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#725d42" }}>{roundCount}</span>
                </div>
              </Tooltip>
              {showSlider && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 32,
                    left: 0,
                    background: "#fffef7",
                    border: "2px solid #c4b89e",
                    borderRadius: 14,
                    padding: "8px 12px",
                    boxShadow: "0 3px 10px rgba(0,0,0,0.1)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    zIndex: 10,
                  }}
                >
                  <input type="range" min={1} max={20} value={roundCount} onChange={(e) => { const v = parseInt(e.target.value, 10); setRoundCount(v); localStorage.setItem("thinkflow_chat_rounds", String(v)); }} style={{ width: 70 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#725d42" }}>{roundCount}</span>
                </div>
              )}
            </div>
            {/* Send / Stop button */}
            {loading ? (
              <Button
                type="primary"
                onClick={stopStreaming}
                style={{
                  minWidth: 36,
                  height: 36,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: "#e05a5a",
                  borderColor: "#e05a5a",
                  boxShadow: "0 3px 0 0 #c94444",
                }}
              >
                <Square size={16} fill="#fff" />
              </Button>
            ) : (
              <Button
                type="primary"
                onClick={handleSend}
                disabled={!input.trim() || !isLoaded}
                style={{
                  minWidth: 36,
                  height: 36,
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                }}
              >
                <Send size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
