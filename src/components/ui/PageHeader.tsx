import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  search?: SearchConfig;
  searchExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action, search, searchExtra, children }: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1 text-base font-medium">{subtitle}</p>
          )}
        </div>
        {action}
      </div>

      {search && (
        <div className={cn("flex gap-3", searchExtra ? "flex-col lg:flex-row" : "flex-col")}>
          <div className="relative flex-1 group">
            {search.loading ? (
              <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            )}
            <input
              id="page-header-search"
              type="text"
              aria-label={search.placeholder ?? "Cerca..."}
              placeholder={search.placeholder ?? "Cerca..."}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm font-medium"
            />
          </div>
          {searchExtra}
        </div>
      )}

      {children && (
        <div className="flex flex-wrap gap-2">{children}</div>
      )}
    </div>
  );
}
