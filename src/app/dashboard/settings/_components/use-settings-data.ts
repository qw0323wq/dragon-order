/**
 * 設定頁資料 Hook — 統一管理 users / stores / suppliers / permissions 的載入
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { UserData, StoreData, SupplierOption, RolePermission } from "./types";

export function useSettingsData() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [rolePerms, setRolePerms] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, storesRes, suppliersRes, permsRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/stores"),
        fetch("/api/suppliers"),
        fetch("/api/permissions"),
      ]);
      setUsers(await usersRes.json());
      setStores(await storesRes.json());
      const suppliersData = await suppliersRes.json();
      setSuppliers(
        Array.isArray(suppliersData)
          ? suppliersData.map((s: SupplierOption) => ({
              id: s.id,
              name: s.name,
              category: s.category,
            }))
          : []
      );
      if (permsRes.ok) {
        setRolePerms(await permsRes.json());
      }
    } catch {
      toast.error("載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeUsers = users.filter((u) => u.isActive);
  const inactiveUsers = users.filter((u) => !u.isActive);

  return {
    users,
    activeUsers,
    inactiveUsers,
    stores,
    suppliers,
    rolePerms,
    setRolePerms,
    loading,
    refetch: fetchData,
  };
}
