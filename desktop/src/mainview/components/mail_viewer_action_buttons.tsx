import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Reply, Forward, Bell, MoreHorizontal, X } from "lucide-react";

type Props = {
  onReply: () => void;
  onForward: () => void;
  hasReplyDraft?: boolean;
  hasForwardDraft?: boolean;
  onRemindLater?: (remind_at: number) => void;
  reminder_at?: number | null;
  onOpenReminderCommand?: () => void;
};

const btnClass =
  "h-8 flex items-center justify-center gap-2 rounded-lg border border-white/30 bg-white/30 px-3 text-sm font-medium text-white shadow-lg shadow-black/10 backdrop-blur-md transition-colors hover:bg-white/40 cursor-pointer";

const laterOptionClass =
  "h-8 rounded-lg border border-white/30 bg-white/30 px-3 text-xs font-medium text-white shadow-lg shadow-black/10 backdrop-blur-md transition-colors hover:bg-white/40 cursor-pointer";

const dotClass = "w-2 h-2 rounded-full bg-white/70 inline-block shrink-0";

const reminder_options = [
  { label: "30 mins", minutes: 30 },
  { label: "1hr", minutes: 60 },
  { label: "2hrs", minutes: 120 },
  { label: "4hrs", minutes: 240 },
];

function format_reminder_status(remind_at: number): string {
  const date = new Date(remind_at);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = date.toDateString() === now.toDateString()
    ? "Today"
    : date.toDateString() === tomorrow.toDateString()
      ? "Tomorrow"
      : `${date.getDate()} ${date.toLocaleDateString([], { month: "short" })}`;
  const time = date.getMinutes() === 0
    ? date.toLocaleTimeString([], { hour: "numeric", hour12: true })
    : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time}`;
}

function MailViewerActionButtons({ onReply, onForward, hasReplyDraft, hasForwardDraft, onRemindLater, reminder_at, onOpenReminderCommand }: Props) {
  const [reminders_open, set_reminders_open] = useState(false);

  const select_reminder = (minutes: number) => {
    onRemindLater?.(Date.now() + minutes * 60 * 1000);
    set_reminders_open(false);
  };

  const toggle_reminders = () => {
    set_reminders_open((open) => !open);
  };

  return (
    <div className="flex items-center justify-center my-3 pointer-events-auto">
      <AnimatePresence mode="wait" initial={false}>
        {!reminders_open ? (
          <motion.div
            key="primary-actions"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-3">
              <button className={btnClass} onClick={onReply}>
                <Reply size={15} />
                Reply
                {hasReplyDraft && <span className={dotClass} />}
              </button>
              <button className={btnClass} onClick={onForward}>
                <Forward size={15} />
                Forward
                {hasForwardDraft && <span className={dotClass} />}
              </button>
              {!reminder_at && (
                <button className={btnClass} onClick={toggle_reminders} aria-expanded={false}>
                  <Bell size={15} />
                  Later
                </button>
              )}
            </div>
            {reminder_at && (
              <span
                className="flex items-center gap-2 text-sm font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]"
                title="Reminder set">
                <span>Reminder set · {format_reminder_status(reminder_at)}</span>
              </span>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="later-options"
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-1.5">
            <>
              {reminder_options.map((option) => (
                  <motion.button
                    key={option.minutes}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.16 }}
                    className={laterOptionClass}
                    onClick={() => select_reminder(option.minutes)}>
                    {option.label}
                  </motion.button>
              ))}
              <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.16 }}
                  className={`${laterOptionClass} flex w-8 items-center justify-center px-0`}
                  aria-label="Choose a custom reminder time"
                  title="Custom time"
                onClick={() => { set_reminders_open(false); onOpenReminderCommand?.(); }}>
                <MoreHorizontal size={15} />
              </motion.button>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/30 bg-white/30 text-white backdrop-blur-md hover:bg-white/40 cursor-pointer" onClick={toggle_reminders} aria-label="Close later options">
                <X size={14} />
              </button>
            </>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MailViewerActionButtons;
