import { useState, useEffect, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import { Modal } from "animal-island-ui";
import MainLayout from "@/components/layout/MainLayout";
import TaskBoard from "@/components/tasks/TaskBoard";
import QuickCapture from "@/components/capture/QuickCapture";
import TaskAssistant from "@/components/capture/TaskAssistant";
import FocusView from "@/components/focus/FocusView";
import DailyBrief from "@/components/briefing/DailyBrief";
import SettingsView from "@/components/settings/SettingsView";
import MemoryView from "@/components/memory/MemoryView";
import FableView from "@/components/fable/FableView";
import GoalListView from "@/components/goals/GoalListView";
import GoalDetailView from "@/components/goals/GoalDetailView";
import { useHotkeyEvents, type HotkeyEventPayload } from "@/hooks/useTauriEvents";
import { useTaskStore } from "@/stores/taskStore";

export default function App() {
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const { lastEvent, clearEvent } = useHotkeyEvents();
  const init = useTaskStore((s) => s.init);

  // Load tasks from database on startup
  useEffect(() => {
    init();
  }, [init]);

  const handleHotkeyEvent = useCallback(
    (event: HotkeyEventPayload) => {
      switch (event.action) {
        case "quick-capture":
          setQuickCaptureOpen(true);
          break;
        case "focus-mode":
          // Navigate to focus view - emit custom event to be handled by router
          window.dispatchEvent(
            new CustomEvent("navigate-focus-mode")
          );
          break;
      }
    },
    []
  );

  useEffect(() => {
    if (lastEvent) {
      handleHotkeyEvent(lastEvent);
      clearEvent();
    }
  }, [lastEvent, handleHotkeyEvent, clearEvent]);

  return (
    <>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<TaskBoard />} />
          <Route path="/capture" element={<TaskAssistant />} />
          <Route path="/goals" element={<GoalListView />} />
          <Route path="/goals/:goalId" element={<GoalDetailView />} />
          <Route path="/focus" element={<FocusView />} />
          <Route path="/briefing" element={<DailyBrief />} />
          <Route path="/fable" element={<FableView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/memory" element={<MemoryView />} />
        </Route>
      </Routes>

      {/* Global Quick Capture Modal - triggered by hotkey */}
      <Modal
        open={quickCaptureOpen}
        title={null}
        onClose={() => setQuickCaptureOpen(false)}
        footer={null}
        typewriter={false}
      >
        <QuickCapture.Modal onClose={() => setQuickCaptureOpen(false)} />
      </Modal>
    </>
  );
}
