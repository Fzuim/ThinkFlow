import { create } from "zustand";
import { useTaskStore, type Task } from "@/stores/taskStore";
import { useGoalStore } from "@/stores/goalStore";

const HISTORY_KEY = "task_assistant_history";
const MAX_HISTORY = 100;
const historyKeyFor = (goalId?: string | null) => goalId ? `${HISTORY_KEY}:goal:${goalId}` : HISTORY_KEY;
function readChatRounds(): number { try { const v = localStorage.getItem("thinkflow_chat_rounds"); return v ? Math.max(1, Math.min(20, parseInt(v, 10))) : 3; } catch { return 3; } }


// Abort controller for stopping AI response mid-stream
let _abortStreamController: AbortController | null = null;


// Check if an error is from streaming abort
function isAbortError(e: unknown): boolean {
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    if (obj.name === "AbortError") return true;
    if (typeof obj.message === "string" && (obj.message as string).includes("abort")) return true;
  }
  return false;
}

export interface AssistantAction {
  type: "create" | "create_goal" | "update" | "delete" | "move" | "record_progress";
  task_id?: string;
  task?: Record<string, unknown>;
  updates?: Record<string, unknown>;
  status?: string;
  content?: string;
  goal?: Record<string, unknown>;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  taskTitle?: string;
  entityId?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  actions?: AssistantAction[];
  actionResults?: ActionResult[];
  suggestedActions?: AssistantAction[];
  suggestedConfirmed?: boolean | null; // null=pending, true=yes, false=no
  timestamp: string;
  scopeGoalId?: string;
}

interface ChatStore {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  isLoaded: boolean;
  streamingContent: string;
  streamingReasoning: string;
  activeGoalId: string | null;

  init: (goalId?: string | null) => Promise<void>;
  sendMessage: (content: string, goalId?: string | null, context?: string) => Promise<void>;
  stopStreaming: () => void;
  confirmSuggested: (messageId: string, confirmed: boolean) => Promise<void>;
  clearChat: () => void;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

async function persistMessages(messages: ChatMessage[], goalId?: string | null): Promise<void> {
  const sliced = messages.slice(-MAX_HISTORY);
  await tauriInvoke("set_setting", {
    key: historyKeyFor(goalId),
    value: JSON.stringify(sliced),
  });
}

async function executeAction(action: AssistantAction, goalScopeId?: string | null): Promise<ActionResult> {
  const taskStore = useTaskStore.getState();

  switch (action.type) {
    case "create": {
      const t = action.task ?? {};
      const rawParentId = t.parent_id ?? t.parent;
      const parentId = typeof rawParentId === "string" && rawParentId !== "-" ? rawParentId : null;
      const rawGoalId = t.goal_id ?? t.goal;
      const taskGoalId = typeof rawGoalId === "string" && rawGoalId !== "-" ? rawGoalId : null;
      if (goalScopeId && parentId) {
        const parent = taskStore.getTaskById(parentId);
        if (!parent || parent.goal_id !== goalScopeId) {
          return { success: false, error: "Parent task is outside the current goal" };
        }
      }
      const priority = typeof t.priority === "number" ? t.priority : 5;
      const task: Task = {
        id: (t._id as string) ?? crypto.randomUUID(),
        title: (t.title as string) ?? "Untitled task",
        description: (t.description as string) ?? "",
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
        goal_id: goalScopeId ?? taskGoalId,
        parent_id: parentId,
        kind: (t.kind as Task["kind"]) ?? "task",
        start_at: (t.start_at as string) ?? null,
        planned_end_at: (t.planned_end_at as string) ?? null,
        weight: (t.weight as number) ?? 1,
        sort_order: (t.sort_order as number) ?? 0,
        schedule_level: (t.schedule_level as Task["schedule_level"]) ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
      };
      const created = await taskStore.addTask(task);
      return { success: true, taskTitle: created.title, entityId: created.id };
    }
    case "create_goal": {
      if (goalScopeId) return { success: false, error: "Cannot create another goal in goal-scoped mode" };
      const input = action.goal ?? {};
      const goal = await useGoalStore.getState().addGoal({
        title: (input.title as string) ?? "Untitled goal",
        description: (input.description as string) ?? "",
        success_criteria: (input.success_criteria as string) ?? "",
        start_date: (input.start_date as string) ?? null,
        target_date: (input.target_date as string) ?? null,
        review_cycle: (input.review_cycle as "daily" | "weekly" | "monthly") ?? "weekly",
      });
      return { success: true, taskTitle: goal.title, entityId: goal.id };
    }
    case "update": {
      if (!action.task_id) return { success: false, error: "Missing task_id" };
      const existing = taskStore.getTaskById(action.task_id);
      if (!existing) return { success: false, error: "Task not found" };
      if (goalScopeId && existing.goal_id !== goalScopeId) return { success: false, error: "Task is outside the current goal" };
      const updates = { ...(action.updates as Partial<Task>) };
      if (goalScopeId) updates.goal_id = goalScopeId;
      if (goalScopeId && updates.parent_id) {
        const parent = taskStore.getTaskById(updates.parent_id);
        if (!parent || parent.goal_id !== goalScopeId) return { success: false, error: "Parent task is outside the current goal" };
      }
      await taskStore.updateTask(action.task_id, updates);
      return { success: true, taskTitle: existing.title };
    }
    case "delete": {
      if (!action.task_id) return { success: false, error: "Missing task_id" };
      const toDelete = taskStore.getTaskById(action.task_id);
      if (!toDelete) return { success: false, error: "Task not found" };
      if (goalScopeId && toDelete.goal_id !== goalScopeId) return { success: false, error: "Task is outside the current goal" };
      const title = toDelete?.title;
      await taskStore.deleteTask(action.task_id);
      return { success: true, taskTitle: title };
    }
    case "move": {
      if (!action.task_id || !action.status) return { success: false, error: "Missing task_id or status" };
      const toMove = taskStore.getTaskById(action.task_id);
      if (!toMove) return { success: false, error: "Task not found" };
      if (goalScopeId && toMove.goal_id !== goalScopeId) return { success: false, error: "Task is outside the current goal" };
      await taskStore.moveTask(action.task_id, action.status as Task["status"]);
      return { success: true, taskTitle: toMove.title };
    }
    case "record_progress": {
      console.log("[FRONTEND] record_progress case entered", action);
      const progressContent = action.content || "";
      if (!action.task_id && !progressContent) return { success: false, error: "Missing task_id and content" };
      let taskId = action.task_id;
      if (!taskId) {
        const allTasks = goalScopeId ? taskStore.tasks.filter((task) => task.goal_id === goalScopeId) : taskStore.tasks;
        const c = progressContent.toLowerCase();
        const match = allTasks.find(t => c.includes(t.title.toLowerCase()) || t.title.toLowerCase().includes(c));
        if (!match) return { success: false, error: "Cannot find matching task. Use exact task name from board." };
        taskId = match.id;
      }
      const progressTask = taskStore.getTaskById(taskId);
      if (!progressTask) return { success: false, error: "Task not found" };
      if (goalScopeId && progressTask.goal_id !== goalScopeId) return { success: false, error: "Task is outside the current goal" };
      await taskStore.appendTaskProgress(taskId, progressContent);
      return { success: true };
    }
    default:
      console.log("[FRONTEND] Unknown action type:", action.type, action); return { success: false, error: `Unknown action type: ${action.type}` };
  }
}

function isNewGoalTask(action: AssistantAction): boolean {
  if (action.type !== "create") return false;
  const task = action.task ?? {};
  return task.goal_id === "__created_goal__"
    || task.goal === "__created_goal__"
    || (typeof task.parent_id === "string" && task.parent_id.startsWith("__ref:"))
    || (typeof task.parent === "string" && task.parent.startsWith("__ref:"))
    || typeof task.ref_id === "string";
}

function orderGoalPlanActions(actions: AssistantAction[]): AssistantAction[] {
  return actions
    .map((action, index) => ({ action, index }))
    .sort((left, right) => {
      const rank = (action: AssistantAction) => {
        if (action.type === "create_goal") return 0;
        if (action.type !== "create") return 3;
        const parent = action.task?.parent_id ?? action.task?.parent;
        return typeof parent === "string" && parent.startsWith("__ref:") ? 2 : 1;
      };
      return rank(left.action) - rank(right.action) || left.index - right.index;
    })
    .map(({ action }) => action);
}

function normalizeActionGroups(response: TaskAssistantResponse): TaskAssistantResponse {
  let actions = [...(response.actions ?? [])];
  let suggestedActions = [...(response.suggested_actions ?? [])];
  const goalPlanNeedsConfirmation = suggestedActions.some((action) => action.type === "create_goal")
    || (actions.some((action) => action.type === "create_goal") && suggestedActions.some(isNewGoalTask));

  if (goalPlanNeedsConfirmation) {
    const planActions = [...actions, ...suggestedActions].filter(
      (action) => action.type === "create_goal" || isNewGoalTask(action),
    );
    actions = actions.filter((action) => action.type !== "create_goal" && !isNewGoalTask(action));
    suggestedActions = [
      ...orderGoalPlanActions(planActions),
      ...suggestedActions.filter((action) => action.type !== "create_goal" && !isNewGoalTask(action)),
    ];
  } else {
    actions = orderGoalPlanActions(actions);
    suggestedActions = orderGoalPlanActions(suggestedActions);
  }

  return { ...response, actions, suggested_actions: suggestedActions };
}

async function executeActionBatch(
  actions: AssistantAction[],
  goalScopeId?: string | null,
  initialCreatedGoalId: string | null = null,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  let lastCreatedTaskId: string | null = null;
  let lastCreatedGoalId = initialCreatedGoalId;
  const createdTaskRefs = new Map<string, string>();

  for (const action of actions) {
    try {
      let resolvedAction = { ...action };
      let taskRefId: string | null = null;

      if (action.type === "create_goal") {
        const result = await executeAction(resolvedAction, goalScopeId);
        if (result.success && result.entityId) lastCreatedGoalId = result.entityId;
        results.push(result);
        continue;
      }

      if (action.type === "create") {
        const task = { ...action.task, _id: crypto.randomUUID() } as Record<string, unknown>;
        const rawGoalId = task.goal_id ?? task.goal;
        if (rawGoalId === "__created_goal__") {
          if (!lastCreatedGoalId) {
            results.push({ success: false, error: "Cannot resolve the newly created goal" });
            continue;
          }
          task.goal_id = lastCreatedGoalId;
        } else if (typeof rawGoalId === "string" && rawGoalId !== "-") {
          task.goal_id = rawGoalId;
        } else if (lastCreatedGoalId) {
          task.goal_id = lastCreatedGoalId;
        }

        const rawParentId = task.parent_id ?? task.parent;
        if (typeof rawParentId === "string" && rawParentId.startsWith("__ref:")) {
          const resolvedParentId = createdTaskRefs.get(rawParentId.slice(6));
          if (!resolvedParentId) {
            results.push({ success: false, error: `Cannot resolve parent reference ${rawParentId}` });
            continue;
          }
          task.parent_id = resolvedParentId;
        } else {
          task.parent_id = typeof rawParentId === "string" && rawParentId !== "-" ? rawParentId : null;
        }

        taskRefId = typeof task.ref_id === "string" ? task.ref_id : null;
        resolvedAction = { ...action, task };
      } else if (action.type === "move" && action.task_id === "__created__" && lastCreatedTaskId) {
        resolvedAction = { ...action, task_id: lastCreatedTaskId };
      }

      const result = await executeAction(resolvedAction, goalScopeId);
      if (result.success && result.entityId && action.type === "create") {
        lastCreatedTaskId = result.entityId;
        if (taskRefId) createdTaskRefs.set(taskRefId, result.entityId);
      }
      results.push(result);
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

interface TaskAssistantResponse {
  reply: string;
  actions: AssistantAction[];
  suggested_actions: AssistantAction[];
  reasoning?: string;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  isLoaded: false,
  streamingContent: "",
  streamingReasoning: "",
  activeGoalId: null,

  init: async (goalId) => {
    const targetGoalId = goalId ?? null;
    set({
      messages: [],
      error: null,
      isLoaded: false,
      loading: false,
      streamingContent: "",
      streamingReasoning: "",
      activeGoalId: targetGoalId,
    });
    const rounds = await tauriInvoke<string>("get_setting", { key: "chat_history_rounds" });
    if (rounds) {
      const n = parseInt(rounds, 10);
      if (!isNaN(n)) localStorage.setItem("thinkflow_chat_rounds", String(Math.max(1, Math.min(20, n))));
    }
    const saved = await tauriInvoke<string>("get_setting", { key: historyKeyFor(goalId) });
    if (get().activeGoalId !== targetGoalId) return;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatMessage[];
        set({ messages: parsed, isLoaded: true });
      } catch {
        set({ messages: [], isLoaded: true });
      }
    } else {
      set({ messages: [], isLoaded: true });
    }
  },

  sendMessage: async (content, goalId, context) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      scopeGoalId: goalId ?? undefined,
    };

    set((s) => ({ messages: [...s.messages, userMsg], loading: true, error: null, streamingContent: "", streamingReasoning: "" }));
    const requestMessages = get().messages;
    const requestGoalId = goalId ?? null;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");

      // Build history (only role + content) for the LLM context
      const currentMessages = get().messages;
      const maxMessages = readChatRounds() * 2;
      const historyPayload = currentMessages
        .slice(-maxMessages)
        .map((m) => ({ role: m.role, content: m.content }));

      // Set up Tauri event listeners for streaming
      let donePayload: TaskAssistantResponse | null = null;
      let errorPayload: string | null = null;

      // Listen for thinking/reasoning chunks (streamed before reply)
      const unlistenThinking = await listen<{ chunk: string }>("task-assistant:thinking", (event) => {
        set((s) => ({ streamingReasoning: s.streamingReasoning + event.payload.chunk }));
      });

      // Listen for content chunks (typewriter effect)
      const unlistenChunk = await listen<{ chunk: string }>("task-assistant:chunk", (event) => {
        set((s) => ({ streamingContent: s.streamingContent + event.payload.chunk }));
      });

      // Listen for completion
      const unlistenDone = await listen<{ reply: string; actions: AssistantAction[]; suggested_actions: AssistantAction[]; reasoning?: string }>(
        "task-assistant:done",
        (event) => {
          donePayload = event.payload as unknown as TaskAssistantResponse;
        },
      );

      // Listen for errors
      const unlistenError = await listen<{ error: string }>("task-assistant:error", (event) => {
        errorPayload = event.payload.error;
      });

      // Create abort controller for stop functionality
      _abortStreamController = new AbortController();

      // Start the streaming command
      try {
        await invoke("task_assistant_stream", {
          message: context ? `${context}\n\n${content}` : content,
          history: JSON.stringify(historyPayload),
          goalId: goalId ?? null,
        } as any);
      } catch (e: any) {
        // Check if streaming was cancelled by user
        if (isAbortError(e)) {
          unlistenThinking();
          unlistenChunk();
          unlistenDone();
          unlistenError();
          _abortStreamController = null;
          set({ loading: false, streamingContent: "", streamingReasoning: "" });
          return;
        }
        // Rethrow non-abort errors for outer catch to handle
        throw e;
      }
      // Clean up listeners and capture payloads into local variables
      // (TypeScript cannot narrow closure-assigned variables, so we
      //  capture them into locals after the callbacks have completed.)
      unlistenThinking();
      unlistenChunk();
      unlistenDone();
      unlistenError();

      const finalErrorPayload = errorPayload as string | null;
      const finalDonePayload = donePayload as TaskAssistantResponse | null;

      if (finalErrorPayload) {
        if (finalErrorPayload.includes("API key") || finalErrorPayload.includes("api key") || finalErrorPayload.includes("not configured")) {
          set({ error: "no_llm", loading: false, streamingContent: "", streamingReasoning: "" });
        } else {
          set({ error: finalErrorPayload, loading: false, streamingContent: "", streamingReasoning: "" });
        }
        return;
      }

      if (!finalDonePayload) {
        set({ error: "No response from AI", loading: false, streamingContent: "", streamingReasoning: "" });
        return;
      }

      const normalizedPayload = normalizeActionGroups(finalDonePayload);
      const actionResults = await executeActionBatch(normalizedPayload.actions, goalId);

      // Create the assistant message
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalDonePayload.reply,
        reasoning: finalDonePayload.reasoning || undefined,
        actions: normalizedPayload.actions,
        actionResults,
        suggestedActions: normalizedPayload.suggested_actions.length > 0 ? normalizedPayload.suggested_actions : undefined,
        suggestedConfirmed: normalizedPayload.suggested_actions.length > 0 ? null : undefined,
        timestamp: new Date().toISOString(),
        scopeGoalId: goalId ?? undefined,
      };

      const newMessages = [...requestMessages, assistantMsg];
      persistMessages(newMessages, goalId).catch(() => {});
      set((s) => s.activeGoalId === requestGoalId
        ? { messages: newMessages, loading: false, streamingContent: "", streamingReasoning: "" }
        : s);
    } catch (e: any) {
      // Outer catch (e.g. dynamic import failure)
      let message: string;
      if (typeof e === "string") {
        message = e;
      } else if (e instanceof Error) {
        message = e.message;
      } else {
        try {
          message = String(e);
        } catch {
          message = "An unexpected error occurred";
        }
      }

      if (message.includes("API key") || message.includes("api key") || message.includes("not configured")) {
        set({ error: "no_llm", loading: false, streamingContent: "", streamingReasoning: "" });
      } else {
        set({ error: message, loading: false, streamingContent: "", streamingReasoning: "" });
      }
    }
  },

  confirmSuggested: async (messageId, confirmed) => {
    // Update the message's suggestedConfirmed state
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId ? { ...m, suggestedConfirmed: confirmed } : m
      ),
    }));

    if (!confirmed) return;

    // Find the message and execute its suggested actions
    const msg = get().messages.find((m) => m.id === messageId);
    if (!msg?.suggestedActions) return;
    const goalId = msg.scopeGoalId;

    const initialCreatedGoalId = msg.actions?.reduce<string | null>((createdGoalId, action, index) => {
      const result = msg.actionResults?.[index];
      return action.type === "create_goal" && result?.success && result.entityId
        ? result.entityId
        : createdGoalId;
    }, null) ?? null;
    const actionResults = await executeActionBatch(msg.suggestedActions, goalId, initialCreatedGoalId);

    // Update message with action results
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              actions: [...(m.actions ?? []), ...(m.suggestedActions ?? [])],
              actionResults: [...(m.actionResults ?? []), ...actionResults],
              suggestedActions: undefined,
            }
          : m
      ),
    }));

    // Persist
    persistMessages(get().messages, goalId).catch(() => {});
  },

  stopStreaming: () => {
    if (_abortStreamController) {
      _abortStreamController.abort();
      _abortStreamController = null;
    }
    set({ loading: false, error: null, streamingContent: "", streamingReasoning: "" });
  },

  clearChat: () => {
    const goalId = get().activeGoalId;
    set({ messages: [], error: null });
    tauriInvoke("set_setting", { key: historyKeyFor(goalId), value: "" }).catch(() => {});
  },
}));
