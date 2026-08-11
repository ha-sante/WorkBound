const SIGNATURE_PATH = "M 12 40 C 26 14, 46 50, 60 34 C 74 18, 92 50, 108 34 C 124 18, 142 50, 158 34 C 174 18, 192 46, 208 30";
const PLANE_PATH = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
const LOOP_DURATION = "4s";

function WorkboundedBadge() {
  return (
    <div className="relative overflow-hidden py-2">
      <svg viewBox="0 0 220 56" className="h-10 block" role="img" aria-label="Workbounded badge">
        <defs>
          <linearGradient id="wb_trail_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9B9A97" />
            <stop offset="100%" stopColor="#37352F" />
          </linearGradient>
          <linearGradient id="wb_plane_grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#37352F" />
            <stop offset="100%" stopColor="#5f5e5b" />
          </linearGradient>
          <filter id="wb_plane_glow" x="-20%" y="-50%" width="140%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#9B9A97" floodOpacity="0.35" />
          </filter>
        </defs>
        <path
          id="wb_signature_path"
          d={SIGNATURE_PATH}
          className="wb-line"
          fill="none"
          stroke="url(#wb_trail_grad)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g filter="url(#wb_plane_glow)">
          <animate
            attributeName="opacity"
            values="0;0;1;1;0"
            keyTimes="0;0.06;0.1;0.85;0.9"
            dur={LOOP_DURATION}
            repeatCount="indefinite"
            calcMode="linear"
          />
          <animateMotion
            dur={LOOP_DURATION}
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1"
            keyTimes="0;0.55"
            rotate="auto"
          >
            <mpath xlinkHref="#wb_signature_path" />
          </animateMotion>
          <g transform="translate(-12.5 -12) scale(0.5)">
            <path d={PLANE_PATH} fill="url(#wb_plane_grad)" />
          </g>
        </g>
      </svg>
      <p className="mt-2 text-left text-sm font-extrabold text-text-primary">
        WORKBOUNDED
      </p>
      <p className="mt-0.5 text-left text-xs text-text-secondary">
        You are Workbounded. Thank you for supporting the shared services!
      </p>
      <style>{`
        .wb-line {
          stroke-dasharray: 400;
          stroke-dashoffset: 400;
          animation: wb-line ${LOOP_DURATION} linear infinite;
        }
        @keyframes wb-line {
          0%, 6%   { stroke-dashoffset: 400; opacity: 1; }
          55%      { stroke-dashoffset: 0; }
          88%      { stroke-dashoffset: 0; opacity: 1; }
          96%, 100% { stroke-dashoffset: 0; opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export { WorkboundedBadge };
