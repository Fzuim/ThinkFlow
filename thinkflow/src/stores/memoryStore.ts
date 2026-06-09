import { create } from "zustand";

export type MemoryType = "episodic" | "semantic" | "procedural" | "preference";

export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  created_at: string;
  last_accessed: string;
  access_count: number;
}

interface MemoryFilters {
  type: MemoryType | null;
  search: string;
}

interface MemoryStore {
  memories: Memory[];
  isLoaded: boolean;
  filters: MemoryFilters;

  // AI QA state
  qaAnswer: string | null;
  qaLoading: boolean;
  qaError: string | null;

  init: () => Promise<void>;
  setFilters: (filters: Partial<MemoryFilters>) => void;
  clearFilters: () => void;
  addMemory: (memory: Omit<Memory, "created_at" | "last_accessed" | "access_count">) => Promise<Memory>;
  updateMemory: (id: string, updates: Partial<Pick<Memory, "type" | "content" | "importance">>) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  getFilteredMemories: () => Memory[];

  // AI operations
  extractMemories: (input: string) => Promise<void>;
  askQuestion: (question: string) => Promise<void>;
  clearQA: () => void;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

const emptyFilters: MemoryFilters = {
  type: null,
  search: "",
};

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  memories: [],
  isLoaded: false,
  filters: { ...emptyFilters },
  qaAnswer: null,
  qaLoading: false,
  qaError: null,

  init: async () => {
    const memories = await tauriInvoke<Memory[]>("get_memories");
    if (memories) {
      set({ memories, isLoaded: true });
    } else {
      set({ isLoaded: true });
    }
  },

  setFilters: (filters) =>
    set((s) => ({ filters: { ...s.filters, ...filters } })),

  clearFilters: () => set({ filters: { ...emptyFilters } }),

  addMemory: async (memory) => {
    const created = await tauriInvoke<Memory>("create_memory", {
      request: {
        memory_type: memory.type,
        content: memory.content,
        importance: memory.importance,
      },
    });
    if (created) {
      set((s) => ({ memories: [created, ...s.memories] }));
      return created;
    }
    throw new Error("Failed to create memory");
  },

  updateMemory: async (id, updates) => {
    const existing = get().memories.find((m) => m.id === id);
    if (!existing) return;
    const updated = await tauriInvoke<Memory>("update_memory", {
      id,
      request: {
        memory_type: updates.type,
        content: updates.content,
        importance: updates.importance,
      },
    });
    if (updated) {
      set((s) => ({
        memories: s.memories.map((m) => (m.id === id ? updated : m)),
      }));
    }
  },

  deleteMemory: async (id) => {
    await tauriInvoke("delete_memory", { id });
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }));
  },

  getFilteredMemories: () => {
    const { memories, filters } = get();
    return memories.filter((m) => {
      if (filters.type && m.type !== filters.type) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!m.content.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  },

  extractMemories: async (input) => {
    const raw = await tauriInvoke<string>("extract_memories", { input });
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      const items: Array<{ content: string; type: string; importance: number }> =
        parsed.memories ?? [];
      for (const item of items) {
        await get().addMemory({
          id: crypto.randomUUID(),
          type: item.type as MemoryType,
          content: item.content,
          importance: item.importance,
        });
      }
    } catch {
      /* silently ignore parse failures */
    }
  },

  askQuestion: async (question) => {
    set({ qaLoading: true, qaError: null, qaAnswer: null });
    const result = await tauriInvoke<{ answer: string; relevant_memory_ids: string[] }>(
      "ask_memory",
      { question }
    );
    if (result) {
      set({ qaAnswer: result.answer, qaLoading: false });
      // Refresh memories to reflect access_count updates
      const memories = await tauriInvoke<Memory[]>("get_memories");
      if (memories) set({ memories });
    } else {
      set({ qaError: "Failed to get answer", qaLoading: false });
    }
  },

  clearQA: () => set({ qaAnswer: null, qaLoading: false, qaError: null }),
}));
