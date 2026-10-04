import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { LogOut, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { navItems, roleLabels } from "@/lib/navigation";
import { useRole } from "@/contexts/RoleContext";
import { useAuth } from "@/contexts/AuthContext";
import { fetchVisibility } from "@/lib/api";
import { useRealtime } from "@/lib/socket";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useRole();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const userInitials = (user?.name ?? "")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Pages the Analyst has explicitly hidden for the current role.
  const [hiddenPages, setHiddenPages] = useState<Set<string>>(new Set());

  const loadVisibility = useCallback(async () => {
    // Visibility overrides only apply to owner/manager (the analyst sees all).
    if (role === "analyst") {
      setHiddenPages(new Set());
      return;
    }
    try {
      const rows = await fetchVisibility(role);
      setHiddenPages(new Set(rows.filter((r) => !r.visible).map((r) => r.pageUrl)));
    } catch {
      setHiddenPages(new Set());
    }
  }, [role]);

  useEffect(() => {
    loadVisibility();
  }, [loadVisibility]);

  // Refetch when the Analyst toggles visibility from another session/tab.
  useRealtime("visibility", loadVisibility);

  const filteredItems = navItems.filter(
    (item) => item.roles.includes(role) && !hiddenPages.has(item.url)
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5">
          <Zap className="h-6 w-6 text-primary shrink-0" />
          {!collapsed && (
            <span className="font-display text-lg font-bold text-foreground tracking-tight">
              Profit Navigator
            </span>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all font-medium rounded-xl px-3 py-2.5"
                      activeClassName="!bg-[#eff6ff] !text-[#2563eb] font-bold rounded-xl shadow-xs border-l-4 border-[#2563eb]"
                    >
                      <item.icon className="mr-2.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>


                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && (
          <div className="rounded-lg bg-accent/50 px-3 py-2">
            <Link
              to="/profile"
              className="flex items-center gap-2.5 rounded-md p-1 -m-1 hover:bg-accent transition-colors"
              title="Edit profile"
            >
              <Avatar className="h-9 w-9 shrink-0">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {userInitials || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">
                  {user?.name ?? "Account"}
                </span>
                <span className="block text-xs text-muted-foreground truncate">
                  {roleLabels[role]}
                </span>
              </span>
            </Link>
            <button
              onClick={handleLogout}
              className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-2">
            <Link to="/profile" title="Edit profile">
              <Avatar className="h-8 w-8">
                {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {userInitials || "?"}
                </AvatarFallback>
              </Avatar>
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-center rounded-md py-1 text-muted-foreground hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
