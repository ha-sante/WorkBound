import { useEffect } from "react";

type Props = {
  show: boolean;
  message: string;
  duration?: number;
  onDismiss: () => void;
  action?: { label: string; onClick: () => void };
};

export function Toast({ show, message, duration = 3000, onDismiss, action }: Props) {
  useEffect(() => {
    if (!show) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [show, duration, onDismiss]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-500 flex items-center gap-3 bg-white rounded-full shadow-lg border border-gray-200 p-2 py-1.5">
      <span className="text-sm text-gray-700 whitespace-nowrap truncate max-w-[50vw]">
        {message}
      </span>
      {action && (
        <button
          onClick={action.onClick}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1 rounded-full transition-colors cursor-pointer">
          {action.label}
        </button>
      )}
    </div>
  );
}