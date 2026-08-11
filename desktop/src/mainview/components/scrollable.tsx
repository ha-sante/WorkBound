import { useRef, useCallback, useEffect } from "react";

type Props = {
  children: React.ReactNode;
  className?: string;
  onScrollNearBottom?: () => void;
  nearBottomThreshold?: number;
};

const DEFAULT_THRESHOLD = 200;

function Scrollable({ children, className = "", onScrollNearBottom, nearBottomThreshold = DEFAULT_THRESHOLD }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const onScrollNearBottomRef = useRef(onScrollNearBottom);
  const nearBottomThresholdRef = useRef(nearBottomThreshold);

  useEffect(() => { onScrollNearBottomRef.current = onScrollNearBottom; }, [onScrollNearBottom]);
  useEffect(() => { nearBottomThresholdRef.current = nearBottomThreshold; }, [nearBottomThreshold]);

  const handleScroll = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll - el.scrollTop < nearBottomThresholdRef.current) {
      onScrollNearBottomRef.current?.();
    }
  }, []);

  return (
    <div
      ref={outerRef}
      className={`overflow-y-auto ${className}`}
      onScroll={handleScroll}
    >
      {children}
    </div>
  );
}

export default Scrollable;
