import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";

type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

function placement_to_side_align(placement: PopoverPlacement) {
  switch (placement) {
    case "bottom-start":
      return { side: "bottom" as const, align: "start" as const };
    case "bottom-end":
      return { side: "bottom" as const, align: "end" as const };
    case "top-start":
      return { side: "top" as const, align: "start" as const };
    case "top-end":
      return { side: "top" as const, align: "end" as const };
  }
}

export function Popover({
  open,
  on_open_change,
  placement = "bottom-start",
  trigger,
  content_className,
  children,
}: {
  open: boolean;
  on_open_change: (next: boolean) => void;
  placement?: PopoverPlacement;
  trigger: ReactNode;
  content_className?: string;
  children: ReactNode;
}) {
  const trigger_id = useId();
  const { side, align } = placement_to_side_align(placement);

  const trigger_element = trigger as ReactElement;

  return (
    <BasePopover.Root
      open={open}
      onOpenChange={(next) => on_open_change(next)}
      triggerId={trigger_id}
    >
      <BasePopover.Trigger
        id={trigger_id}
        render={trigger_element}
      />

      <BasePopover.Portal>
        <BasePopover.Positioner
          side={side}
          align={align}
          sideOffset={8}
          style={{ zIndex: 120 }}>
          <BasePopover.Popup
            className={content_className ?? ""}
            data-wb-popover="1"
            style={{ zIndex: 120 }}>
            <BasePopover.Arrow />
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
