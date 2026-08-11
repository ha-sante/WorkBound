import AvatarImage from "./avatar_image";

type Props = {
  name: string;
  email: string;
  avatar_url?: string;
  onClick?: () => void;
};

function Avatar({ name, email, avatar_url, onClick }: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 cursor-pointer" onClick={onClick}>
      <AvatarImage
        url={avatar_url}
        name={name}
        email={email}
        imgClassName="w-7 h-7 rounded-full shrink-0"
        initialsClassName="w-7 h-7 rounded-full border border-[#DEDEDC] flex items-center justify-center text-text-secondary text-[11px] font-medium shrink-0"
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{name}</div>
        <div className="text-xs text-text-secondary truncate">{email}</div>
      </div>
    </div>
  );
}

export default Avatar;
