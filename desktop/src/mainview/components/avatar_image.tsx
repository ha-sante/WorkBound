import { useState } from "react";
import Image from "./ui/image";

function initials_for(name?: string | null, email?: string | null): string {
  const base = name || email || "?";
  return base.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

type Props = {
  url?: string | null;
  name?: string | null;
  email?: string | null;
  imgClassName?: string;
  initialsClassName?: string;
  alt?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
};

function AvatarImage({ url, name, email, imgClassName, initialsClassName, alt, onClick, style }: Props) {
  const [failed, set_failed] = useState(false);

  if (url && !failed) {
    return (
      <Image
        src={url}
        alt={alt ?? name ?? ""}
        className={imgClassName}
        onClick={onClick}
        onError={() => set_failed(true)}
        style={style}
      />
    );
  }

  return (
    <div className={initialsClassName} style={style} onClick={onClick}>
      {initials_for(name, email)}
    </div>
  );
}

export default AvatarImage;
