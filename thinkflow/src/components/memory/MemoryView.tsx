import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMemoryStore, type MemoryType } from "@/stores/memoryStore";
import { Card } from "animal-island-ui";
import { Input } from "animal-island-ui";
import { Select } from "animal-island-ui";
import { Button } from "animal-island-ui";
import { Modal, Icon } from "animal-island-ui";
import item468 from "animal-island-ui/items/item-468.png";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  Loader2,
  Send,
  X,
  Database,
} from "lucide-react";

const MEMORY_TYPES: MemoryType[] = ["episodic", "semantic", "procedural", "preference"];

const typeColors: Record<MemoryType, { bg: string; text: string }> = {
  episodic: { bg: "#b77dee", text: "#fff" },
  semantic: { bg: "#889df0", text: "#fff" },
  procedural: { bg: "#f7cd67", text: "#725d42" },
  preference: { bg: "#8ac68a", text: "#fff" },
};

interface EditDialogState {
  open: boolean;
  id: string | null;
  content: string;
  type: MemoryType;
  importance: number;
}

const emptyDialog: EditDialogState = {
  open: false,
  id: null,
  content: "",
  type: "semantic",
  importance: 0.5,
};

export default function MemoryView() {
  const { t } = useTranslation();
  const {
    memories,
    filters,
    init,
    setFilters,
    addMemory,
    updateMemory,
    deleteMemory,
    getFilteredMemories,
    qaAnswer,
    qaLoading,
    askQuestion,
    clearQA,
  } = useMemoryStore();

  useEffect(() => { init(); }, [init]);

  const [showQA, setShowQA] = useState(false);
  const [qaInput, setQaInput] = useState("");
  const [dialog, setDialog] = useState<EditDialogState>(emptyDialog);

  const filtered = getFilteredMemories();
  const hasFilter = filters.type !== null || filters.search !== "";

  const handleOpenAdd = useCallback(() => {
    setDialog({ open: true, id: null, content: "", type: "semantic", importance: 0.5 });
  }, []);

  const handleOpenEdit = useCallback((m: { id: string; content: string; type: MemoryType; importance: number }) => {
    setDialog({ open: true, id: m.id, content: m.content, type: m.type, importance: m.importance });
  }, []);

  const handleSaveDialog = useCallback(async () => {
    if (!dialog.content.trim()) return;
    if (dialog.id) {
      await updateMemory(dialog.id, {
        type: dialog.type,
        content: dialog.content,
        importance: dialog.importance,
      });
    } else {
      await addMemory({
        id: crypto.randomUUID(),
        type: dialog.type,
        content: dialog.content,
        importance: dialog.importance,
      });
    }
    setDialog(emptyDialog);
  }, [dialog, addMemory, updateMemory]);

  const handleAsk = useCallback(() => {
    if (!qaInput.trim()) return;
    askQuestion(qaInput.trim());
  }, [qaInput, askQuestion]);

  const memoryTypeOptions = [
    { key: "all", label: t("memory.filterAll") },
    ...MEMORY_TYPES.map((mt) => ({ key: mt, label: t(`memory.${mt}`) })),
  ];

  const dialogTypeOptions = MEMORY_TYPES.map((mt) => ({
    key: mt,
    label: t(`memory.${mt}`),
  }));

  return (
    <div className="max-w-4xl mx-auto p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Icon src={item468} size={22} />
          <h2 className="text-2xl font-semibold" style={{ color: "#725d42" }}>{t("memory.title")}</h2>
          <span
            style={{
              borderRadius: 50,
              background: "#f0e8d8",
              padding: "2px 8px",
              fontSize: 12,
              fontWeight: 600,
              color: "#725d42",
            }}
          >
            {t("memory.total", { count: memories.length })}
          </span>
        </div>
        <Button
          type={showQA ? "default" : "dashed"}
          size="small"
          onClick={() => { setShowQA(!showQA); clearQA(); setQaInput(""); }}
          icon={<MessageCircle size={14} />}
        >
          {t("memory.askAI")}
        </Button>
      </div>

      {/* AI QA Panel */}
      {showQA && (
        <Card className="mb-4">
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder={t("memory.askPlaceholder")}
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
                disabled={qaLoading}
              />
              <Button
                type="primary"
                onClick={handleAsk}
                disabled={qaLoading || !qaInput.trim()}
                style={{ minWidth: 45, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                {qaLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </Button>
            </div>
            {qaAnswer && (
              <div
                style={{
                  borderRadius: 18,
                  background: "rgba(240,232,216,0.5)",
                  padding: 12,
                }}
              >
                <p className="text-sm leading-relaxed" style={{ color: "#725d42" }}>{qaAnswer}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Input
            placeholder={t("memory.search")}
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            prefix={<Search size={14} style={{ color: "#c4b89e" }} />}
          />
        </div>
        <Select
          value={filters.type ?? "all"}
          onChange={(v) => setFilters({ type: v === "all" ? null : (v as MemoryType) })}
          options={memoryTypeOptions}
          placeholder={t("memory.filterAll")}
        />
        <Button
          type="text"
          size="small"
          onClick={clearQA}
          style={{ visibility: hasFilter ? "visible" : "hidden" }}
        >
          <X size={14} />
        </Button>
        <Button type="primary" size="small" onClick={handleOpenAdd} icon={<Plus size={14} />}>
          {t("memory.addMemory")}
        </Button>
      </div>

      {/* Memory List */}
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        {filtered.map((m) => {
          const colors = typeColors[m.type];
          return (
            <div
              key={m.id}
              className="group transition-colors p-3"
              style={{
                borderRadius: 18,
                border: "2px solid #e8e2d6",
                background: "rgb(247, 243, 223)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(240,232,216,0.8)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgb(247, 243, 223)";
              }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "#725d42" }}>{m.content}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      style={{
                        borderRadius: 50,
                        background: colors.bg,
                        color: colors.text,
                        padding: "2px 8px",
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      {t(`memory.${m.type}`)}
                    </span>
                    <span className="text-[10px]" style={{ color: "#9f927d" }}>
                      {t("memory.importance")}: {m.importance.toFixed(1)}
                    </span>
                    {m.access_count > 0 && (
                      <span className="text-[10px]" style={{ color: "#9f927d" }}>
                        {t("memory.accessCount", { count: m.access_count })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    type="text"
                    size="small"
                    onClick={() => handleOpenEdit(m)}
                    title={t("memory.editMemory")}
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => deleteMemory(m.id)}
                    title={t("memory.deleteMemory")}
                  >
                    <Trash2 size={12} style={{ color: "#e05a5a" }} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3" style={{ color: "#9f927d" }}>
            <Database size={36} style={{ opacity: 0.4 }} />
            <div>
              <p className="font-medium" style={{ color: "#725d42" }}>{t("memory.noMemories")}</p>
              <p className="text-sm mt-1 max-w-xs">{t("memory.noMemoriesDesc")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Modal
        open={dialog.open}
        title={dialog.id ? t("memory.editMemory") : t("memory.addMemory")}
        onClose={() => setDialog(emptyDialog)}
        onOk={handleSaveDialog}
        typewriter={false}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
              {t("memory.content")}
            </label>
            <textarea
              autoFocus
              value={dialog.content}
              onChange={(e) => setDialog((d) => ({ ...d, content: e.target.value }))}
              rows={3}
              style={{
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
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
                {t("memory.type")}
              </label>
              <Select
                value={dialog.type}
                onChange={(v) => setDialog((d) => ({ ...d, type: v as MemoryType }))}
                options={dialogTypeOptions}
                placeholder="Type"
              />
            </div>
            <div className="w-28">
              <label className="text-xs font-semibold mb-1 block" style={{ color: "#9f927d" }}>
                {t("memory.importance")}
              </label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={dialog.importance.toString()}
                onChange={(e) => setDialog((d) => ({ ...d, importance: parseFloat(e.target.value) || 0.5 }))}
                size="small"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
