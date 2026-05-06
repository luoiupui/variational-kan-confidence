import { NavLink } from "react-router-dom";
import { Activity, FlaskConical, Settings, Info, GitCompare, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Dashboard", icon: Activity },
  { to: "/experiments", label: "Experiments", icon: FlaskConical },
  { to: "/stage4", label: "Stage 4 · Baseline", icon: GitCompare },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/config", label: "Configuration", icon: Settings },
  { to: "/about", label: "About", icon: Info },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-primary to-accent" />
            <div className="leading-tight">
              <div className="font-mono text-sm font-semibold tracking-tight">V-KAN</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Dynamic SLAM · Live Demo
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-[1600px] border-t border-border px-4 py-4 text-[11px] text-muted-foreground">
        V-KAN Dynamic SLAM — Stage 3 web demo. Data sourced from{" "}
        <code className="font-mono text-foreground/80">tum_smoke_results.json</code> &{" "}
        <code className="font-mono text-foreground/80">sweep_mini_results.json</code>.
      </footer>
    </div>
  );
}