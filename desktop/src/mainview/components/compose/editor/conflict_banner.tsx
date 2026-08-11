type Props = {
  reloading: boolean;
  onKeep: () => void;
  onUseGmail: () => void;
};

function ConflictPane({ reloading, onKeep, onUseGmail }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
      <p className="text-sm text-center text-gray-600 max-w-md">
        Gmail edit detected. Click to keep your version, or load the Gmail version.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onKeep}
          disabled={reloading}
          className="text-sm font-medium px-4 py-2 rounded-md bg-amber-100 text-amber-900 hover:bg-amber-200 transition-colors cursor-pointer disabled:opacity-50"
        >
          Keep my changes
        </button>
        <button
          onClick={onUseGmail}
          disabled={reloading}
          className="text-sm font-medium px-4 py-2 rounded-md bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
        >
          {reloading ? "Loading..." : "Load Gmail version"}
        </button>
      </div>
    </div>
  );
}

export default ConflictPane;
