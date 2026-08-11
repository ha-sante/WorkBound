import { useEffect, useRef, useState } from "react";
import { messages } from "@/shared/rpc_messages";
import DOMPurify from "dompurify";
import { rpc } from "../rpc";

function detect_body_bg(html: string): string | null {
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const bg = extract_bg_from_attrs(bodyMatch[0]);
    if (bg) return bg;
  }
  const outerMatch = html.match(/^\s*<(\w+)([^>]*)>/i);
  if (outerMatch) {
    const tag = outerMatch[1].toLowerCase();
    if (tag !== "html" && tag !== "head") {
      const bg = extract_bg_from_attrs(outerMatch[0]);
      if (bg) return bg;
    }
  }
  return null;
}

function extract_bg_from_attrs(openTag: string): string | null {
  const styleMatch = openTag.match(/style\s*=\s*["']([^"']*)["']/i);
  if (styleMatch) {
    const bgMatch = styleMatch[1].match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (bgMatch) return bgMatch[1].trim();
  }
  const bgcolorMatch = openTag.match(/bgcolor\s*=\s*["']([^"']*)["']/i);
  if (bgcolorMatch) return bgcolorMatch[1].trim();
  return null;
}

function find_closing_blockquote(html: string, openStart: number): number {
  let tagEnd = html.indexOf('>', openStart);
  if (tagEnd === -1) return -1;
  let pos = tagEnd + 1;
  let depth = 1;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<blockquote', pos);
    const nextClose = html.indexOf('</blockquote>', pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + 11; }
    else { depth--; pos = nextClose + 13; }
  }
  return pos;
}

function find_quote_close(html: string, openStart: number): number {
  let tagEnd = html.indexOf('>', openStart);
  if (tagEnd === -1) return -1;
  let pos = tagEnd + 1;
  let depth = 1;
  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf('<div', pos);
    const nextClose = html.indexOf('</div>', pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) { depth++; pos = nextOpen + 4; }
    else { depth--; pos = nextClose + 6; }
  }
  return pos;
}

function transform_quoted_html(html: string): string {
  let result = html;
  while (true) {
    const tag = '<div class="gmail_quote">';
    const openIdx = result.lastIndexOf(tag);
    if (openIdx === -1) break;
    const closeIdx = find_quote_close(result, openIdx);
    if (closeIdx === -1) break;
    const block = result.substring(openIdx, closeIdx);
    const attrMatch = block.match(/<div[^>]*class="gmail_attr"[^>]*>(.*?)<\/div>/is);
    if (!attrMatch) break;
    const summaryText = attrMatch[1].replace(/<br\s*\/?>\s*$/i, '').trim();
    const afterAttr = block.substring(attrMatch.index! + attrMatch[0].length);
    const pill = `<details style="margin:6px 0"><summary style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px;border-radius:9999px;background:#f1f5f9;border:1px solid #e5e7eb;-webkit-user-select:none;user-select:none"><span style="width:4px;height:4px;border-radius:9999px;background:#9b9a97"></span><span style="width:4px;height:4px;border-radius:9999px;background:#9b9a97"></span><span style="width:4px;height:4px;border-radius:9999px;background:#9b9a97"></span></summary><div style="background:white;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1);border:1px solid #e2e8f0;padding:12px;margin-top:6px"><div style="font-size:13px;color:#6b7280;margin-bottom:8px">${summaryText}</div>${afterAttr}</div></details>`;
    result = result.substring(0, openIdx) + pill + result.substring(closeIdx);
  }
  while (true) {
    const openIdx = result.lastIndexOf('<blockquote');
    if (openIdx === -1) break;
    const tagClose = result.indexOf('>', openIdx);
    if (tagClose === -1) break;
    const closeIdx = find_closing_blockquote(result, openIdx);
    if (closeIdx === -1) break;
    const innerContent = result.substring(tagClose + 1, closeIdx - 13);
    const paraMatch = innerContent.match(/^\s*<p[^>]*>(.*?wrote:)<\/p>\s*/is);
    const summaryText = paraMatch ? paraMatch[1].trim() : 'Quoted text';
    const afterSummary = paraMatch ? innerContent.substring(paraMatch[0].length) : innerContent;
    const pill = `<details style="margin:6px 0"><summary style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;padding:4px;border-radius:9999px;background:#f1f5f9;border:1px solid #e5e7eb;-webkit-user-select:none;user-select:none"><span style="width:4px;height:4px;border-radius:9999px;background:#9b9a97"></span><span style="width:4px;height:4px;border-radius:9999px;background:#9b9a97"></span><span style="width:4px;height:4px;border-radius:9999px;background:#9b9a97"></span></summary><div style="background:white;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -4px rgba(0,0,0,0.1);border:1px solid #e2e8f0;padding:12px;margin-top:6px"><div style="font-size:13px;color:#6b7280;margin-bottom:8px">${summaryText}</div>${afterSummary}</div></details>`;
    result = result.substring(0, openIdx) + pill + result.substring(closeIdx);
  }
  return result;
}

function detect_proxy_img_origin(html: string): string | null {
  const match = html.match(/https?:\/\/[^\/\s"'>]+?\/image_proxy\?/i);
  if (!match) return null;
  try {
    return new URL(match[0]).origin;
  } catch {
    return null;
  }
}

function email_body_doc(html: string, email_id: string): string {
  const bg = detect_body_bg(html);

  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a", "abbr", "address", "article", "aside", "b", "bdi", "bdo",
      "blockquote", "br", "caption", "center", "cite", "code", "col",
      "colgroup", "dd", "del", "details", "dfn", "div", "dl", "dt",
      "em", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4",
      "h5", "h6", "header", "hgroup", "hr", "i", "img", "ins", "kbd",
      "li", "main", "mark", "nav", "ol", "p", "pre", "q", "rp", "rt",
      "ruby", "s", "samp", "section", "small", "source", "span", "strike",
      "strong", "sub", "summary", "sup", "table", "tbody", "td",
      "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "wbr",
      "picture",
    ],
    ALLOWED_ATTR: [
      "href", "target", "rel", "title", "alt", "src", "width", "height",
      "align", "valign", "bgcolor", "border", "cellpadding", "cellspacing",
      "colspan", "rowspan", "dir", "lang", "style", "color", "size", "face",
      "abbr", "axis", "charset", "cite", "coords", "datetime",
      "hspace", "ismap", "longdesc", "nohref", "noshade", "nowrap",
      "rev", "rules", "shape", "span", "start", "summary",
      "type", "usemap", "vspace", "loading", "decoding", "srcset", "sizes",
      "headers", "scope",
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    WHOLE_DOCUMENT: false,
  });

  let processed = sanitized.replace(
    /href=(['"])(https?:\/\/[^"']+)\1/gi,
    'href="#" data-url="$2"',
  );
  processed = processed.replace(
    /<(\/?)(script|noscript)[\s>]/gi,
    (_, close) => close ? '' : '<!-- blocked -->',
  );
  processed = processed.replace(/<img\s/g, '<img decoding="async" ');

  const proxyOrigin = detect_proxy_img_origin(processed);
  const imgSrc = proxyOrigin ? `${proxyOrigin} data:` : "data:";

  const bodyAttr = bg ? ` bgcolor="${bg}" style="background-color: ${bg}"` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'; default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'"><style>
    html { border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; }
    body { overflow-y: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; line-height: 1.5; padding: 24px; margin: 0; word-wrap: break-word; }
    img { max-width: 100%; height: auto; min-height: 1px; }
    a { color: #1a73e8; }
    table { max-width: 100%; overflow-wrap: break-word; }
    pre, code { white-space: pre-wrap; overflow-wrap: break-word; }
  </style></head><body${bodyAttr}>${processed}<script>
window.parent.postMessage({type:'email-iframe-ready',email_id:'${email_id}'},'*');
document.addEventListener('click',function(e){var a=e.target.closest('a');var u=a&&a.getAttribute('data-url');if(!u)return;e.preventDefault();e.stopImmediatePropagation();window.parent.postMessage({type:'email-link-click',url:u,email_id:'${email_id}'},'*')},{capture:true});
document.addEventListener('contextmenu',function(e){e.preventDefault();var a=e.target.closest('a');if(a){var u=a.getAttribute('data-url');if(u){window.parent.postMessage({type:'email-context',kind:'link',url:u,email_id:'${email_id}'},'*');return}}var i=e.target.closest('img');if(i){window.parent.postMessage({type:'email-context',kind:'image',url:i.src,email_id:'${email_id}'},'*');return}var s=window.getSelection();if(s&&s.toString()){window.parent.postMessage({type:'email-context',kind:'text',text:s.toString(),email_id:'${email_id}'},'*')}},{capture:true});
document.addEventListener('wheel',function(e){var s=document.scrollingElement||document.body;var hasX=s.scrollWidth>s.clientWidth+1;var dx=hasX?e.deltaX:0;if(dx!==0)s.scrollLeft+=dx;e.preventDefault();window.parent.postMessage({type:'email-wheel-scroll',deltaX:hasX?0:e.deltaX,deltaY:e.deltaY},'*')},{passive:false});
document.addEventListener('keydown',function(e){var k=e.key||'';var w={'r':1,'a':1,'f':1,'e':1,'s':1,'i':1,'u':1,'b':1,'!':1,'Delete':1,'Backspace':1,'Escape':1};if(w[k]){e.preventDefault();e.stopImmediatePropagation();window.parent.postMessage({type:'email-keydown',key:k,shiftKey:e.shiftKey,email_id:'${email_id}'},'*')}},{capture:true});
function co(){var ow=document.body.scrollWidth-document.body.clientWidth;window.parent.postMessage({type:'email-overflow',ow:ow},'*')}
function rh(){var h=document.body.scrollHeight;window.parent.postMessage({type:'email-body-height',height:h},'*')}
function cx(){var s=document.scrollingElement||document.body;var d=s.scrollWidth-s.clientWidth;if(d>0)s.scrollLeft=d/2}
window.addEventListener('load',function(){rh();requestAnimationFrame(function(){requestAnimationFrame(function(){co();setTimeout(co,200);requestAnimationFrame(cx);setTimeout(cx,220)})})});
var ri=new ResizeObserver(function(){rh()});ri.observe(document.body);
</script></body></html>`;
}

type Props = {
  html: string;
  email_id: string;
  account_id: string;
  className?: string;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onOverflowChange?: (w: number) => void;
};

export function EmailBodyIFrame({ html, email_id, account_id, className, scrollContainerRef, onOverflowChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [readyDoc, setReadyDoc] = useState<string | null>(null);
  const lastHeightRef = useRef<number>(0);

  useEffect(() => {
    setReadyDoc(null);
    const label = `email_body_doc_${email_id.slice(0, 8)}`;
    const id = setTimeout(() => {
      console.time(label);
      const transformed = transform_quoted_html(html);
      const finalHtml = transformed.trim().length > 0 ? transformed : html;
      const doc = email_body_doc(finalHtml, email_id);
      console.timeEnd(label);
      setReadyDoc(doc);
    }, 0);
    return () => {
      clearTimeout(id);
      console.timeEnd(label);
    };
  }, [html, email_id]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "email-iframe-ready") return;
      if (e.data?.email_id && e.data.email_id !== email_id) return;
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data?.type === "email-keydown" && typeof e.data.key === "string") {
        window.dispatchEvent(new KeyboardEvent("keydown", {
          key: e.data.key,
          shiftKey: !!e.data.shiftKey,
          bubbles: true,
          cancelable: true,
        }));
        return;
      }

      if (e.data?.type === "email-link-click" && typeof e.data.url === "string") {
        rpc.request(messages.url_open, { url: e.data.url });
      }

      if (e.data?.type === "email-context" && typeof e.data.kind === "string") {
        rpc.request(messages.context_menu_show, {
          kind: e.data.kind,
          url: typeof e.data.url === "string" ? e.data.url : undefined,
          email_id,
          account_id,
          quote_text: typeof e.data.text === "string" ? e.data.text : undefined,
          x: 0,
          y: 0,
        });
      }

      if (e.data?.type === "email-wheel-scroll" && typeof e.data.deltaY === "number") {
        const container = scrollContainerRef?.current;
        if (!container) return;
        const dx = e.data.deltaX ?? 0;
        const dy = e.data.deltaY;
        const before = container.scrollTop;
        container.scrollBy(dx, dy);
        if (container.scrollTop === before) {
          let node = container.parentElement;
          while (node) {
            if (node.scrollHeight > node.clientHeight) {
              const oy = getComputedStyle(node).overflowY;
              if (oy === "auto" || oy === "scroll") {
                node.scrollBy(dx, dy);
                break;
              }
            }
            node = node.parentElement;
          }
        }
      }

      if (e.data?.type === "email-body-height" && typeof e.data.height === "number") {
        lastHeightRef.current = e.data.height;
        const el = iframeRef.current;
        const container = scrollContainerRef?.current;
        if (!el) return;
        if (container) {
          const maxScroll = container.scrollHeight - container.clientHeight;
          const ratio = maxScroll > 0 ? container.scrollTop / maxScroll : 0;
          el.style.height = `${e.data.height}px`;
          const newMax = container.scrollHeight - container.clientHeight;
          container.scrollTop = ratio * newMax;
        } else {
          el.style.height = `${e.data.height}px`;
        }
      }

      if (e.data?.type === "email-overflow" && typeof e.data.ow === "number") {
        onOverflowChange?.(e.data.ow);
      }
    };

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [email_id, account_id, scrollContainerRef, onOverflowChange]);

  if (!readyDoc) {
    return (
      <div
        className={className ?? "w-full border-0 !rounded-b-xl !overflow-hidden"}
        style={{ height: 200 }}
      >
        <div className="flex items-center justify-center h-full">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <iframe
      key={email_id}
      ref={iframeRef}
      srcDoc={readyDoc}
      sandbox="allow-scripts"
      className={className ?? "w-full border-0 !rounded-b-xl !overflow-hidden"}
      style={{ height: lastHeightRef.current > 0 ? lastHeightRef.current : 200 }}
      title="Email body"
    />
  );
}
