import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TaskCategory } from "@/stores/taskStore";
import { Briefcase, Home, BookOpen, Heart, type LucideIcon } from "lucide-react";

interface CategoryBadgeProps {
  category: TaskCategory;
  size?: "sm" | "default";
}

interface CategoryConfig {
  label: string;
  Icon: LucideIcon;
  bg: string;
  text: string;
}

export default function CategoryBadge({
  category,
  size = "default",
}: CategoryBadgeProps) {
  const { t } = useTranslation();

  const categoryConfig = useMemo<Record<TaskCategory, CategoryConfig>>(
    () => ({
      work: {
        label: t("categories.work"),
        Icon: Briefcase,
        bg: "#889df0",
        text: "#fff",
      },
      life: {
        label: t("categories.life"),
        Icon: Home,
        bg: "#8ac68a",
        text: "#fff",
      },
      study: {
        label: t("categories.study"),
        Icon: BookOpen,
        bg: "#b77dee",
        text: "#fff",
      },
      health: {
        label: t("categories.health"),
        Icon: Heart,
        bg: "#f8a6b2",
        text: "#fff",
      },
    }),
    [t]
  );

  const config = categoryConfig[category];
  if (!config) return null;
  const { label, Icon, bg, text } = config;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        borderRadius: 50,
        fontWeight: 600,
        background: bg,
        color: text,
        padding: size === "sm" ? "2px 6px" : "2px 8px",
        fontSize: size === "sm" ? 10 : 12,
      }}
    >
      <Icon size={size === "sm" ? 10 : 12} />
      {size !== "sm" && label}
    </span>
  );
}
