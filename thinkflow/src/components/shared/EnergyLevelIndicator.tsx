import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EnergyLevel } from "@/stores/taskStore";
import { Brain, Coffee, Laptop, type LucideIcon } from "lucide-react";

interface EnergyLevelIndicatorProps {
  level: EnergyLevel;
  size?: "sm" | "default";
}

interface EnergyConfig {
  label: string;
  Icon: LucideIcon;
  bg: string;
  text: string;
}

export default function EnergyLevelIndicator({
  level,
  size = "default",
}: EnergyLevelIndicatorProps) {
  const { t } = useTranslation();

  const energyConfig = useMemo<Record<EnergyLevel, EnergyConfig>>(
    () => ({
      deep: {
        label: t("energyLevel.deep"),
        Icon: Brain,
        bg: "#b77dee",
        text: "#fff",
      },
      medium: {
        label: t("energyLevel.medium"),
        Icon: Laptop,
        bg: "#889df0",
        text: "#fff",
      },
      shallow: {
        label: t("energyLevel.shallow"),
        Icon: Coffee,
        bg: "#9a835a",
        text: "#fff",
      },
    }),
    [t]
  );

  const config = energyConfig[level];
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
      title={label}
    >
      <Icon size={size === "sm" ? 10 : 12} />
      {size !== "sm" && label}
    </span>
  );
}
