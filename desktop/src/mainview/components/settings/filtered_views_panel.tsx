import { ListFilter } from "lucide-react";
import { FilteredViewsSection } from "./filtered_views_section";

export function FilteredViewsPanel({ account_id }: { account_id: string }) {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ListFilter size={20} className="text-text-primary" />
        <h2 className="text-lg font-medium text-text-primary">Filtered Views</h2>
      </div>

      <FilteredViewsSection account_id={account_id} />
    </div>
  );
}
