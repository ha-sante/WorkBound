export function build_pill_html(quote_text: string): string {
  if (!quote_text) return "";
  return `
    <div contenteditable="false">
      <div
        data-role="quote-pill"
        contenteditable="false"
        draggable="true"
        class="inline-flex items-center gap-1 px-1 py-1 rounded-full border bg-slate-100 cursor-grab active:cursor-grabbing select-none">
        <div class="w-1 h-1 rounded-full bg-text-secondary"></div>
        <div class="w-1 h-1 rounded-full bg-text-secondary"></div>
        <div class="w-1 h-1 rounded-full bg-text-secondary"></div>
      </div>
    </div>
  `;
}
