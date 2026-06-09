import type { ReactNode } from "react";
import { FileText } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 py-12 px-4 text-center ${className ?? ""}`}
    >
      <div style={{ color: "#c4b89e" }}>
        {icon ?? <FileText size={40} />}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium" style={{ color: "#9f927d" }}>{title}</p>
        {description && (
          <p className="text-xs max-w-xs" style={{ color: "#c4b89e" }}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
