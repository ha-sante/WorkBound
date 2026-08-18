import type { MouseEvent, ReactNode } from "react";
import { rpc } from "../../rpc";
import { messages } from "@/shared/rpc_messages";

type ExternalLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

export function ExternalLink({ href, children, className }: ExternalLinkProps) {
  function handle_click(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    rpc.request(messages.url_open, { url: href }).catch(() => {
      console.warn("external_link: failed to open link");
    });
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handle_click}
      className={className}
    >
      {children}
    </a>
  );
}
