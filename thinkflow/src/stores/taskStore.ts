import { create } from "zustand";

export type TaskStatus = "todo" | "in_progress" | "done" | "archived";
export type EnergyLevel = "deep" | "medium" | "shallow";
export type TaskCategory = "work" | "life" | "study" | "health";
export type Urgency = "urgent" | "normal" | "low";
export type Importance = "important" | "normal" | "low";
export type TaskKind = "task" | "milestone";
export type ScheduleLevel = "stage" | "month" | "week" | "day";

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: number;
  urgency: Urgency;
  importance: Importance;
  status: TaskStatus;
  deadline: string | null;
  estimated_duration: number | null;
  energy_level: EnergyLevel | null;
  category: TaskCategory | null;
  tags: string[];
  stakeholder: string | null;
  dependencies: string[];
  source_text: string | null;
  progress_log: { content: string; recorded_at: string }[];
  goal_id: string | null;
  parent_id: string | null;
  kind: TaskKind;
  start_at: string | null;
  planned_end_at: string | null;
  weight: number;
  sort_order: number;
  schedule_level: ScheduleLevel | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TaskStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byPriority: { high: number; medium: number; low: number };
  byCategory: Partial<Record<TaskCategory, number>>;
}

export interface TaskFilters {
  category: TaskCategory | null;
  priority: number | null;
  status: TaskStatus | null;
  search: string;
}

interface TaskStore {
  tasks: Task[];
  isLoaded: boolean;
  selectedTaskId: string | null;
  filters: TaskFilters;

  init: () => Promise<void>;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  appendTaskProgress: (taskId: string, content: string) => Promise<void>;
  moveTask: (id: string, status: TaskStatus) => Promise<void>;
  reorderTasks: (status: TaskStatus, orderedIds: string[]) => void;
  getTasksByStatus: (status: TaskStatus) => Task[];
  getFilteredTasks: () => Task[];
  getTaskStats: () => TaskStats;
  getTaskById: (id: string) => Task | undefined;
  getChildTasks: (parentId: string) => Task[];

  selectTask: (id: string | null) => void;
  setFilters: (filters: Partial<TaskFilters>) => void;
  clearFilters: () => void;
}

const emptyFilters: TaskFilters = {
  category: null,
  priority: null,
  status: null,
  search: "",
};

/** Helper: invoke a Tauri command, silently no-op if not in Tauri runtime. */
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  isLoaded: false,
  selectedTaskId: null,
  filters: { ...emptyFilters },

  /** Load all tasks from SQLite on app startup. */
  init: async () => {
    const tasks = await tauriInvoke<Task[]>("get_all_tasks");
    if (tasks) {
      set({ tasks, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  setTasks: (tasks) => set({ tasks }),

  addTask: async (task) => {
    // Optimistic UI update
    set((s) => ({ tasks: [...s.tasks, task] }));
    const created = await tauriInvoke<Task>("create_task", {
      request: {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        urgency: task.urgency,
        importance: task.importance,
        status: task.status,
        deadline: task.deadline,
        estimated_duration: task.estimated_duration,
        energy_level: task.energy_level,
        category: task.category,
        tags: task.tags,
        stakeholder: task.stakeholder,
        dependencies: task.dependencies,
        source_text: task.source_text,
        goal_id: task.goal_id,
        parent_id: task.parent_id,
        kind: task.kind,
        start_at: task.start_at,
        planned_end_at: task.planned_end_at,
        weight: task.weight,
        sort_order: task.sort_order,
        schedule_level: task.schedule_level,
      },
    });
    // Replace with backend version (has correct timestamps)
    if (created) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === task.id ? created : t)),
      }));
    }
  },

  updateTask: async (id, updates) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updated_at: new Date().toISOString() } : t
      ),
    }));
    const current = get().tasks.find((t) => t.id === id);
    if (current) {
      await tauriInvoke("update_task", { id, updates: current });
    }
  },

  deleteTask: async (id) => {
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
    }));
    await tauriInvoke("delete_task", { id });
  },

  appendTaskProgress: async (taskId, content) => {
    await tauriInvoke("append_task_progress", { taskId, content });
  },

  moveTask: async (id, status) => {
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              updated_at: new Date().toISOString(),
              completed_at: status === "done" ? new Date().toISOString() : t.completed_at,
            }
          : t
      ),
    }));
    await tauriInvoke("update_task_status", {
      request: { id, new_status: status },
    });
  },

  reorderTasks: (status, orderedIds) =>
    set((s) => {
      const statusTasks = new Map(
        s.tasks.filter((t) => t.status === status).map((t) => [t.id, t])
      );
      const otherTasks = s.tasks.filter((t) => t.status !== status);
      const reordered = orderedIds
        .map((id) => statusTasks.get(id))
        .filter((t): t is Task => t !== undefined);
      const orderedSet = new Set(orderedIds);
      for (const t of s.tasks.filter((t) => t.status === status)) {
        if (!orderedSet.has(t.id)) reordered.push(t);
      }
      return { tasks: [...otherTasks, ...reordered] };
    }),

  getTasksByStatus: (status) => get().tasks.filter((t) => t.status === status),

  getFilteredTasks: () => {
    const { tasks, filters } = get();
    return tasks.filter((t) => {
      if (t.status === "archived") return false;
      if (filters.status && t.status !== filters.status) return false;
      if (filters.category && t.category !== filters.category) return false;
      if (filters.priority !== null && t.priority !== filters.priority) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = t.description.toLowerCase().includes(q);
        const matchesTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!matchesTitle && !matchesDesc && !matchesTags) return false;
      }
      return true;
    });
  },

  getTaskStats: () => {
    const { tasks } = get();
    const byStatus: Record<TaskStatus, number> = {
      todo: 0,
      in_progress: 0,
      done: 0,
      archived: 0,
    };
    const byPriority = { high: 0, medium: 0, low: 0 };
    const byCategory: Partial<Record<TaskCategory, number>> = {};

    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      if (t.priority >= 7) byPriority.high++;
      else if (t.priority >= 4) byPriority.medium++;
      else byPriority.low++;
      if (t.category) {
        byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      }
    }

    return {
      total: tasks.length,
      byStatus,
      byPriority,
      byCategory,
    };
  },

  getTaskById: (id) => get().tasks.find((t) => t.id === id),
  getChildTasks: (parentId) => get().tasks
    .filter((t) => t.parent_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order),

  selectTask: (id) => set({ selectedTaskId: id }),

  setFilters: (filters) =>
    set((s) => ({ filters: { ...s.filters, ...filters } })),

  clearFilters: () => set({ filters: { ...emptyFilters } }),
}));
