import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Activity, Sparkles, Printer, Building2, ChevronDown, Check } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { roleLabels } from "@/lib/navigation";
import { switchPreset } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const INDUSTRY_PRESETS = [
  { key: "retail", name: "Supermarket & Retail Electronics" },
  { key: "saas", name: "SaaS & Subscription Software" },
  { key: "restaurant", name: "Restaurant & Hospitality Cafe" },
  { key: "healthcare", name: "Healthcare & Medical Pharmacy" },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const [activePreset, setActivePreset] = useState("retail");
  const [switching, setSwitching] = useState(false);

  const handleSwitchPreset = async (key: string) => {
    setSwitching(true);
    try {
      const res = await switchPreset(key);
      setActivePreset(key);
      toast.success(`Switched industry telemetry profile to ${res.name}!`);
    } catch (err) {
      toast.error("Failed to switch industry preset");
    } finally {
      setSwitching(false);
    }
  };

  const currentPresetName = INDUSTRY_PRESETS.find(p => p.key === activePreset)?.name || "Retail Supermarket";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-slate-50/50">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center justify-between border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-4 md:px-6 shrink-0 z-10 print:hidden">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-slate-600 hover:text-slate-900" />
              <div className="h-4 w-px bg-slate-200 hidden sm:block" />

              {/* Live DB Telemetry Badge */}
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-full shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Live DB Telemetry</span>
                <span className="hidden md:inline text-emerald-500">|</span>
                <span className="hidden md:inline text-slate-600 font-normal">Prophet & XGBoost Active</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Industry Preset Switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={switching} className="h-8 gap-1.5 text-xs font-semibold bg-white border-slate-200 text-slate-700">
                    <Building2 className="h-3.5 w-3.5 text-blue-600" />
                    <span className="hidden sm:inline truncate max-w-[140px]">{currentPresetName}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                    Select Industry Profile
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {INDUSTRY_PRESETS.map((p) => (
                    <DropdownMenuItem
                      key={p.key}
                      onClick={() => handleSwitchPreset(p.key)}
                      className="flex items-center justify-between text-xs cursor-pointer py-2"
                    >
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {activePreset === p.key && <Check className="h-3.5 w-3.5 text-blue-600" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Print Executive Summary Report */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="h-8 gap-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hidden md:flex"
                title="Print or Save Executive Financial Summary PDF"
              >
                <Printer className="h-3.5 w-3.5 text-slate-500" />
                <span>Executive Report</span>
              </Button>

              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200/60 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                {roleLabels[role]} View
              </span>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 print:p-0 print:bg-white">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}


