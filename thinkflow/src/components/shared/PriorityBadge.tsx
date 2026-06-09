import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface PriorityBadgeProps {
  priority: number;
  size?: "sm" | "default";
}

const priorityConfig: Record<
  string,
  { bg: string; text: string; Icon: typeof AlertTriangle }
> = {
  low: {
    bg: "#8ac68a",
    text: "#fff",
    Icon: Info,
  },
  medium: {
    bg: "#f7cd67",
    text: "#725d42",
    Icon: AlertCircle,
  },
  high: {
    bg: "#e59266",
    text: "#fff",
    Icon: AlertTriangle,
  },
  critical: {
    bg: "#fc736d",
    text: "#fff",
    Icon: AlertTriangle,
  },
};

function getPriorityLevel(p: number): "low" | "medium" | "high" | "critical" {
  if (p <= 3) return "low";
  if (p <= 6) return "medium";
  if (p <= 8) return "high";
  return "critical";
}

export default function PriorityBadge({
  priority,
  size = "default",
}: PriorityBadgeProps) {
  const level = getPriorityLevel(priority);
  const config = priorityConfig[level];
  const Icon = config.Icon;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 50,
        fontWeight: 600,
        background: config.bg,
        color: config.text,
        padding: size === "sm" ? "2px 6px" : "2px 8px",
        fontSize: size === "sm" ? 10 : 12,
      }}
    >
      <Icon size={size === "sm" ? 10 : 12} />
      P{priority}
    </span>
  );
}
