/**
 * 設定頁 — Tab 切換 3 個獨立區塊
 */
"use client";

import { useState } from "react";
import { useSettingsData } from "./_components/use-settings-data";
import UserSection from "./_components/user-section";
import UserDialogs from "./_components/user-dialogs";
import StoreSection from "./_components/store-section";
import RolePermissionsSection from "./_components/role-permissions";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "users", label: "員工管理" },
  { key: "stores", label: "門市管理" },
  { key: "roles", label: "角色權限" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("users");

  const {
    activeUsers, inactiveUsers, stores, suppliers,
    rolePerms, setRolePerms, loading, refetch,
  } = useSettingsData();

  const {
    openAdd, openEdit, openResetPassword,
    toggleActive, generateToken, revokeToken,
    dialogs,
  } = UserDialogs({ stores, suppliers, onRefetch: refetch });

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Tab 切換 */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 內容區 */}
      {activeTab === "users" && (
        <UserSection
          activeUsers={activeUsers}
          inactiveUsers={inactiveUsers}
          onAdd={openAdd}
          onEdit={openEdit}
          onResetPassword={openResetPassword}
          onToggleActive={toggleActive}
          onGenerateToken={generateToken}
          onRevokeToken={revokeToken}
        />
      )}

      {activeTab === "stores" && (
        <StoreSection stores={stores} onRefetch={refetch} />
      )}

      {activeTab === "roles" && (
        <RolePermissionsSection rolePerms={rolePerms} setRolePerms={setRolePerms} />
      )}

      {/* Dialog 集合 */}
      {dialogs}
    </div>
  );
}
