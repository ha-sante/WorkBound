export function Row({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="w-28 shrink-0 text-text-secondary">{label}</span>
      <span className={`text-text-primary ${mono ? "font-mono text-xs" : ""}`}>{children}</span>
    </div>
  );
}

export function format_size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
