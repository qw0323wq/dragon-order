/**
 * 角色權限管理區塊 — 設定每個角色可見的頁面
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldIcon, SaveIcon } from "lucide-react";
import type { RolePermission } from "./types";
import { ROLE_LABELS, ROLE_COLORS, PAGE_OPTIONS } from "./types";

interface RolePermissionsProps {
  rolePerms: RolePermission[];
  setRolePerms: React.Dispatch<React.SetStateAction<RolePermission[]>>;
}

export default function RolePermissionsSection({ rolePerms, setRolePerms }: RolePermissionsProps) {
  const [saving, setSaving] = useState(false);

  const getPermPages = (role: string): string[] => {
    const perm = rolePerms.find((p) => p.role === role);
    return perm?.allowedPages ?? [];
  };

  const togglePermPage = (role: string, pageKey: string) => {
    setRolePerms((prev) => {
      const existing = prev.find((p) => p.role === role);
      const currentPages = existing?.allowedPages ?? [];
      const newPages = currentPages.includes(pageKey)
        ? currentPages.filter((p) => p !== pageKey)
        : [...currentPages, pageKey];
      if (existing) {
        return prev.map((p) => (p.role === role ? { ...p, allowedPages: newPages } : p));
      }
      return [...prev, { role, allowedPages: newPages }];
    });
  };

  const savePermissions = async (role: string) => {
    setSaving(true);
    try {
      const perm = rolePerms.find((p) => p.role === role);
      const res = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, allowedPages: perm?.allowedPages ?? [] }),
      });
      if (!res.ok) {
        toast.error("儲存失敗");
        return;
      }
      toast.success(`${ROLE_LABELS[role] || role} 權限已更新`);
    } catch {
      toast.error("儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldIcon className="size-5 text-primary" />
          <h2 className="font-heading font-semibold text-lg">角色權限管理</h2>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {["admin", "buyer", "manager", "staff"].map((role) => {
          const pages = getPermPages(role);
          const isAll = pages.includes("*");
          return (
            <Card key={role}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Badge className={cn("text-xs", ROLE_COLORS[role])}>
                      {ROLE_LABELS[role]}
                    </Badge>
                  </CardTitle>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => savePermissions(role)}
                    disabled={saving || role === "admin"}
                    className="gap-1 h-7 text-xs"
                  >
                    <SaveIcon className="size-3" />儲存
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                {role === "admin" ? (
                  <p className="text-xs text-muted-foreground">管理員擁有所有權限，無法修改</p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {PAGE_OPTIONS.map((page) => (
                      <label key={page.key} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-muted rounded px-1.5 py-1">
                        <input
                          type="checkbox"
                          checked={isAll || pages.includes(page.key)}
                          onChange={() => togglePermPage(role, page.key)}
                          className="rounded border-border"
                          disabled={isAll}
                        />
                        {page.label}
                      </label>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
