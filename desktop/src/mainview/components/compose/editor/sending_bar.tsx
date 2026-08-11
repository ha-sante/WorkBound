type Props = {
  visible: boolean;
};

function SendingBar({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="h-0.5 bg-accent/10 overflow-hidden shrink-0">
      <div className="h-full bg-accent/50 w-1/3 animate-pulse" />
    </div>
  );
}

export default SendingBar;
