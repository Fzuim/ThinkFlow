import { create } from "zustand";
import type { Task } from "@/stores/taskStore";

export type GoalStatus = "draft" | "active" | "paused" | "completed" | "abandoned";
export type ProgressMode = "auto" | "manual" | "weighted";
export type ReviewCycle = "daily" | "weekly" | "monthly";

export interface Goal {
  id: string;
  title: string;
  description: string;
  success_criteria: string;
  start_date: string | null;
  target_date: string | null;
  status: GoalStatus;
  progress_mode: ProgressMode;
  review_cycle: ReviewCycle;
  created_at: string;
  updated_at: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  success_criteria?: string;
  start_date?: string | null;
  target_date?: string | null;
  status?: GoalStatus;
  progress_mode?: ProgressMode;
  review_cycle?: ReviewCycle;
}

interface GoalStore {
  goals: Goal[];
  isLoaded: boolean;
  loading: boolean;
  init: () => Promise<void>;
  addGoal: (input: CreateGoalInput) => Promise<Goal>;
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  getGoalById: (id: string) => Goal | undefined;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export function calculateGoalProgress(goalId: string, tasks: Task[]): number {
  const goalTasks = tasks.filter((task) => task.goal_id === goalId);
  if (goalTasks.length === 0) return 0;
  const parentIds = new Set(goalTasks.map((task) => task.parent_id).filter(Boolean));
  const leaves = goalTasks.filter((task) => !parentIds.has(task.id));
  const weightedTotal = leaves.reduce((sum, task) => sum + Math.max(task.weight, 0.1), 0);
  if (weightedTotal === 0) return 0;
  const completed = leaves.reduce(
    (sum, task) => sum + (task.status === "done" ? Math.max(task.weight, 0.1) : 0),
    0,
  );
  return Math.round((completed / weightedTotal) * 100);
}

export const useGoalStore = create<GoalStore>((set, get) => ({
  goals: [],
  isLoaded: false,
  loading: false,

  init: async () => {
    if (get().isLoaded) return;
    set({ loading: true });
    const goals = await tauriInvoke<Goal[]>("get_all_goals");
    set({ goals: goals ?? [], isLoaded: true, loading: false });
  },

  addGoal: async (input) => {
    const now = new Date().toISOString();
    const optimistic: Goal = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      description: input.description ?? "",
      success_criteria: input.success_criteria ?? "",
      start_date: input.start_date ?? null,
      target_date: input.target_date ?? null,
      status: input.status ?? "active",
      progress_mode: input.progress_mode ?? "weighted",
      review_cycle: input.review_cycle ?? "weekly",
      created_at: now,
      updated_at: now,
    };
    set((state) => ({ goals: [optimistic, ...state.goals] }));
    const created = await tauriInvoke<Goal>("create_goal", { request: input });
    if (created) {
      set((state) => ({ goals: state.goals.map((goal) => goal.id === optimistic.id ? created : goal) }));
      return created;
    }
    return optimistic;
  },

  updateGoal: async (id, updates) => {
    const updatedAt = new Date().toISOString();
    set((state) => ({
      goals: state.goals.map((goal) => goal.id === id ? { ...goal, ...updates, updated_at: updatedAt } : goal),
    }));
    const current = get().goals.find((goal) => goal.id === id);
    if (current) await tauriInvoke("update_goal", { id, updates: current });
  },

  deleteGoal: async (id) => {
    set((state) => ({ goals: state.goals.filter((goal) => goal.id !== id) }));
    await tauriInvoke("delete_goal", { id });
  },

  getGoalById: (id) => get().goals.find((goal) => goal.id === id),
}));
