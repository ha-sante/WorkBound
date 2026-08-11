import { MailIcon } from "lucide-react";

type Props = {
  status?: string;
};

function SplashScreen({ status }: Props) {
  return (
    <div className="h-screen sidebar_parent flex flex-col items-center justify-center">
      <div className="electrobun-webkit-app-region-drag h-9 cursor-default select-none shrink-0 w-full" />
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        <MailIcon className="text-gray-400 animate-pulse" size={22} />
        <p className="text-sm text-text-secondary">
          {status || "Loading WorkBound..."}
        </p>
      </div>
    </div>
  );
}

export default SplashScreen;
