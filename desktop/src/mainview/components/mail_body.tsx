import { memo, type RefObject } from "react";
import { EmailBodyIFrame } from "./email_body_iframe";

type Props = {
  html?: string | null;
  text?: string | null;
  email_id: string;
  account_id: string;
  loading?: boolean;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onOverflowChange?: (w: number) => void;
  className?: string;
};

function MailBody({ html, text, email_id, account_id, loading, scrollContainerRef, onOverflowChange, className }: Props) {
  return (
    <div className={`!rounded-xl !overflow-hidden ${className ?? ""}`}>
      {html ? (
        <EmailBodyIFrame
          html={html}
          email_id={email_id}
          account_id={account_id}
          scrollContainerRef={scrollContainerRef}
          onOverflowChange={onOverflowChange}
        />
      ) : text ? (
        <pre className="text-sm text-text-primary whitespace-pre-wrap font-sans leading-relaxed px-6 py-4">
          {text}
        </pre>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-text-secondary italic">No body content</p>
        </div>
      )}
    </div>
  );
}

export default memo(MailBody);
