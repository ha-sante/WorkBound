export const INLINE_STYLES: Record<string, string> = {
	blockquote: "border-left:2px solid #cbd5e1;padding-left:12px;margin:4px 0;color:#64748b",
	h1: "font-size:20px;font-weight:700;margin:8px 0",
	h2: "font-size:18px;font-weight:600;margin:6px 0",
	h3: "font-size:16px;font-weight:600;margin:4px 0",
	p: "margin:4px 0",
	div: "margin:4px 0",
	ul: "list-style-type:disc;padding-left:40px",
	ol: "list-style-type:decimal;padding-left:40px",
	li: "font-size:14px;margin:2px 0",
	img: "max-width:100%;display:block;margin:4px 0",
	a: "color:#2563eb;text-decoration:underline",
};

export function apply_inline_styles(el: Element): void {
	const tag = el.tagName.toLowerCase();
	const style = INLINE_STYLES[tag];
	if (style && !el.getAttribute("style")) {
		el.setAttribute("style", style);
	}
}

export function add_inline_styles_to_html(html: string): string {
	const tags = Object.keys(INLINE_STYLES);
	return tags.reduce((acc, tag) => {
		const styles = INLINE_STYLES[tag];
		const re = new RegExp(`<${tag}(?![^>]*\\bstyle=)`, "gi");
		return acc.replace(re, `<${tag} style="${styles}"`);
	}, html);
}
