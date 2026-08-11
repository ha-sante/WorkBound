import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "@/mainview/rpc";

type Props = ImgHTMLAttributes<HTMLImageElement>;

function Image({ src, onError, ...rest }: Props) {
  const [source, set_source] = useState<string | undefined>(src ?? undefined);
  const attempted_ref = useRef(false);

  useEffect(() => {
    attempted_ref.current = false;
    set_source(src ?? undefined);
    if (typeof src === "string") {
      try {
        if (new URL(src).protocol === "https:") {
          rpc.request(messages.images_get, { url: src }).catch(() => {});
        }
      } catch {
        // ignore non-URL src
      }
    }
  }, [src]);

  return (
    <img
      {...rest}
      src={source}
      onError={(e) => {
        if (!attempted_ref.current && src) {
          attempted_ref.current = true;
          rpc
            .request(messages.images_get, { url: typeof src === "string" ? src : "" })
            .then((res) => {
              if (res.data_uri) set_source(res.data_uri);
              else onError?.(e);
            })
            .catch(() => onError?.(e));
        } else {
          onError?.(e);
        }
      }}
    />
  );
}

export default Image;