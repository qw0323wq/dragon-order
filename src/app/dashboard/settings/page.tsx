"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  UserPlusIcon,
  PencilIcon,
  KeyRoundIcon,
  UserXIcon,
  UserCheckIcon,
  ShieldIcon,
  UsersIcon,
  StoreIcon,
  Building2Icon,
  SaveIcon,
  KeyIcon,
  CopyIcon,
  XCircleIcon,
} from "lucide-react";

/** 使用者資料型別 */
interface UserData {
  id: number;
  name: string;
  phone: string;
  role: string;
  storeId: number | null;
  storeName: string | null;
  hasApiToken: boolean;
  isActive: boolean;
  createdAt: string;
  allowedSuppliers: number[];
}

/** 供應商資料型別（叫貨權限用） */
interface SupplierOption {
  id: number;
  name: string;
  category: string;
}

/** 門市資料型別 */
interface StoreData {
  id: number;
  name: string;
  companyName: string | null;
  taxId: string | null;
  address: string;
  hours: string;
  manager: string | null;
  phone: string | null;
}

/** 角色中文對照 */
const ROLE_LABELS: Record<string, string> = {
  owner: "老闆",
  manager: "店長",
  staff: "員工",
};

/** 角色 Badge 顏色 */
const ROLE_COLORS: Record<string, string> = {
  owner: "bg-red-100 text-red-700",
  manager: "bg-blue-100 text-blue-700",
  staff: "bg-gray-100 text-gray-700",
};

export default function SettingsPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog 狀態
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  // 表單
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formRole, setFormRole] = useState("staff");
  const [formStoreId, setFormStoreId] = useState<string>("");
  const [formNewPin, setFormNewPin] = useState("");
  /** 叫貨權限：勾選的供應商 ID（空陣列 = 全部可叫） */
  const [formAllowedSuppliers, setFormAllowedSuppliers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 門市編輯
  const [showStoreDialog, setShowStoreDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [storeForm, setStoreForm] = useState({
    name: "", companyName: "", taxId: "", address: "", hours: "", manager: "", phone: "",
  });

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, storesRes, suppliersRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/stores"),
        fetch("/api/suppliers"),
      ]);
      setUsers(await usersRes.json());
      setStores(await storesRes.json());
      // 供應商清單：只取 id, name, category（用於叫貨權限設定）
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
    } catch {
      toast.error("載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── 新增員工 ───
  const handleAdd = async () => {
    if (!formName || !formPhone || !formPin) {
      toast.error("請填寫所有必填欄位");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          phone: formPhone,
          pin: formPin,
          role: formRole,
          storeId: formStoreId ? parseInt(formStoreId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "新增失敗");
        return;
      }
      toast.success(`已新增 ${formName}`);
      setShowAddDialog(false);
      resetForm();
      fetchData();
    } catch {
      toast.error("新增失敗");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 編輯員工 ───
  const openEdit = (user: UserData) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormPhone(user.phone);
    setFormRole(user.role);
    setFormStoreId(user.storeId ? String(user.storeId) : "");
    setFormAllowedSuppliers(user.allowedSuppliers ?? []);
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    if (!editingUser) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          phone: formPhone,
          role: formRole,
          storeId: formStoreId ? parseInt(formStoreId) : null,
          allowedSuppliers: formAllowedSuppliers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "更新失敗");
        return;
      }
      toast.success(`已更新 ${formName}`);
      setShowEditDialog(false);
      resetForm();
      fetchData();
    } catch {
      toast.error("更新失敗");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 重設 PIN ───
  const openResetPin = (user: UserData) => {
    setEditingUser(user);
    setFormNewPin("");
    setShowPinDialog(true);
  };

  const handleResetPin = async () => {
    if (!editingUser || !formNewPin) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPin: formNewPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "重設失敗");
        return;
      }
      toast.success(`已重設 ${editingUser.name} 的 PIN 碼`);
      setShowPinDialog(false);
      setFormNewPin("");
      setEditingUser(null);
    } catch {
      toast.error("重設失敗");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── 啟用/停用 ───
  const toggleActive = async (user: UserData) => {
    const action = user.isActive ? "停用" : "啟用";
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) {
        toast.error(`${action}失敗`);
        return;
      }
      toast.success(`已${action} ${user.name}`);
      fetchData();
    } catch {
      toast.error(`${action}失敗`);
    }
  };

  // ─── 產生 API Token ───
  const [showTokenResult, setShowTokenResult] = useState<string | null>(null);

  const handleGenerateToken = async (user: UserData) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateToken: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "產生失敗");
        return;
      }
      setShowTokenResult(data.apiToken);
      toast.success(`已為 ${user.name} 產生 API Token`);
      fetchData();
    } catch {
      toast.error("產生失敗");
    }
  };

  const handleRevokeToken = async (user: UserData) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeToken: true }),
      });
      if (!res.ok) {
        toast.error("撤銷失敗");
        return;
      }
      toast.success(`已撤銷 ${user.name} 的 API Token`);
      fetchData();
    } catch {
      toast.error("撤銷失敗");
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormPin("");
    setFormRole("staff");
    setFormStoreId("");
    setFormAllowedSuppliers([]);
    setEditingUser(null);
  };

  // ─── 門市編輯 ───
  const openStoreEdit = (store: StoreData) => {
    setEditingStore(store);
    setStoreForm({
      name: store.name,
      companyName: store.companyName || "",
      taxId: store.taxId || "",
      address: store.address || "",
      hours: store.hours || "",
      manager: store.manager || "",
      phone: store.phone || "",
    });
    setShowStoreDialog(true);
  };

  const handleStoreEdit = async () => {
    if (!editingStore) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingStore.id, ...storeForm }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "更新失敗");
        return;
      }
      toast.success(`已更新 ${storeForm.name}`);
      setShowStoreDialog(false);
      fetchData();
    } catch {
      toast.error("更新失敗");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

  const activeUsers = users.filter((u) => u.isActive);
  const inactiveUsers = users.filter((u) => !u.isActive);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
            <UsersIcon className="size-5" />
            員工管理
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            管理帳號、權限、PIN 碼
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowAddDialog(true); }} className="gap-1.5">
          <UserPlusIcon className="size-4" />
          新增員工
        </Button>
      </div>

      {/* 員工列表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            目前帳號（{activeUsers.length} 人）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* 桌面版表格 */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>手機號碼</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>門市</TableHead>
                  <TableHead>API Token</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell className="font-mono text-sm">{user.phone}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={ROLE_COLORS[user.role]}>
                        <ShieldIcon className="size-3 mr-1" />
                        {ROLE_LABELS[user.role] || user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{user.storeName || "全部門市"}</TableCell>
                    <TableCell>
                      {user.hasApiToken ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                            <KeyIcon className="size-3 mr-0.5" />已啟用
                          </Badge>
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => handleRevokeToken(user)} title="撤銷">
                            <XCircleIcon className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => handleGenerateToken(user)}>
                          <KeyIcon className="size-3 mr-1" />產生
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(user)}
                          title="編輯"
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openResetPin(user)}
                          title="重設 PIN"
                        >
                          <KeyRoundIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(user)}
                          title="停用"
                          className="text-red-500 hover:text-red-700"
                        >
                          <UserXIcon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 手機版卡片 */}
          <div className="md:hidden divide-y">
            {activeUsers.map((user) => (
              <div key={user.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{user.name}</span>
                    <Badge variant="secondary" className={`ml-2 text-xs ${ROLE_COLORS[user.role]}`}>
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {user.storeName || "全部門市"}
                  </span>
                </div>
                {/* API Token 狀態 */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{user.phone}</span>
                  {user.hasApiToken ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs gap-0.5">
                      <KeyIcon className="size-3" />API
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                      <PencilIcon className="size-3.5 mr-1" />
                      編輯
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openResetPin(user)}>
                      <KeyRoundIcon className="size-3.5 mr-1" />
                      PIN
                    </Button>
                    {user.hasApiToken ? (
                      <Button variant="outline" size="sm" className="text-red-500 border-red-200" onClick={() => handleRevokeToken(user)}>
                        <XCircleIcon className="size-3.5 mr-1" />撤銷 Token
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleGenerateToken(user)}>
                        <KeyIcon className="size-3.5 mr-1" />產生 Token
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(user)}
                      className="text-red-500 border-red-200"
                    >
                      <UserXIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 已停用帳號 */}
      {inactiveUsers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-muted-foreground">
              已停用帳號（{inactiveUsers.length} 人）
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {inactiveUsers.map((user) => (
                <div key={user.id} className="p-4 flex items-center justify-between opacity-60">
                  <div>
                    <span className="font-medium">{user.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{user.phone}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(user)}
                    className="text-green-600 border-green-200"
                  >
                    <UserCheckIcon className="size-3.5 mr-1" />
                    重新啟用
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Separator className="my-6" />

      {/* ═══════════════ 門市管理 ═══════════════ */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
            <StoreIcon className="size-5" />
            門市管理
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            公司名稱、統編、地址、營業時間
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stores.map((store) => (
          <Card key={store.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{store.name}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => openStoreEdit(store)}>
                  <PencilIcon className="size-3.5 mr-1" />
                  編輯
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {store.companyName && (
                <div className="flex items-center gap-2">
                  <Building2Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{store.companyName}</span>
                  {store.taxId && (
                    <span className="text-muted-foreground font-mono text-xs">（{store.taxId}）</span>
                  )}
                </div>
              )}
              {!store.companyName && (
                <p className="text-muted-foreground text-xs">尚未設定公司名稱和統編</p>
              )}
              <div className="text-muted-foreground">{store.address}</div>
              <div className="text-muted-foreground text-xs">{store.hours}</div>
              {store.manager && (
                <div className="text-xs">店長：{store.manager} {store.phone && `(${store.phone})`}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── 門市編輯 Dialog ─── */}
      <Dialog open={showStoreDialog} onOpenChange={setShowStoreDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>編輯 {editingStore?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>門市名稱</Label>
              <Input
                value={storeForm.name}
                onChange={(e) => setStoreForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>公司名稱（發票抬頭）</Label>
                <Input
                  value={storeForm.companyName}
                  onChange={(e) => setStoreForm((f) => ({ ...f, companyName: e.target.value }))}
                  placeholder="OOO有限公司"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>統一編號</Label>
                <Input
                  value={storeForm.taxId}
                  onChange={(e) => setStoreForm((f) => ({ ...f, taxId: e.target.value }))}
                  placeholder="12345678"
                  className="mt-1.5 font-mono"
                />
              </div>
            </div>
            <div>
              <Label>地址</Label>
              <Textarea
                value={storeForm.address}
                onChange={(e) => setStoreForm((f) => ({ ...f, address: e.target.value }))}
                className="mt-1.5"
                rows={2}
              />
            </div>
            <div>
              <Label>營業時間</Label>
              <Input
                value={storeForm.hours}
                onChange={(e) => setStoreForm((f) => ({ ...f, hours: e.target.value }))}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>店長</Label>
                <Input
                  value={storeForm.manager}
                  onChange={(e) => setStoreForm((f) => ({ ...f, manager: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>電話</Label>
                <Input
                  value={storeForm.phone}
                  onChange={(e) => setStoreForm((f) => ({ ...f, phone: e.target.value }))}
                  type="tel"
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStoreDialog(false)}>
              取消
            </Button>
            <Button onClick={handleStoreEdit} disabled={submitting} className="gap-1.5">
              <SaveIcon className="size-3.5" />
              {submitting ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 新增員工 Dialog ─── */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新增員工</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>姓名 *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="員工姓名"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>手機號碼 *</Label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="09xx-xxx-xxx"
                type="tel"
                inputMode="tel"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>PIN 碼 *（4 位數字）</Label>
              <Input
                value={formPin}
                onChange={(e) => setFormPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="mt-1.5 tracking-widest"
              />
            </div>
            <div>
              <Label>角色</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v ?? "staff")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">員工</SelectItem>
                  <SelectItem value="manager">店長</SelectItem>
                  <SelectItem value="owner">老闆</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>所屬門市</Label>
              <Select value={formStoreId} onValueChange={(v) => setFormStoreId(v ?? "")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="全部門市" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部門市</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? "新增中..." : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 編輯員工 Dialog ─── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯 {editingUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>姓名</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>手機號碼</Label>
              <Input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                type="tel"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>角色</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v ?? "staff")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">員工</SelectItem>
                  <SelectItem value="manager">店長</SelectItem>
                  <SelectItem value="owner">老闆</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>所屬門市</Label>
              <Select value={formStoreId} onValueChange={(v) => setFormStoreId(v ?? "")}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="全部門市" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部門市</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 叫貨權限（僅員工角色顯示；老闆/店長無限制） */}
            {formRole === "staff" && suppliers.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>叫貨權限</Label>
                  <span className="text-xs text-muted-foreground">
                    {formAllowedSuppliers.length === 0
                      ? "全部可叫"
                      : `已選 ${formAllowedSuppliers.length} 家`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  不勾選 = 全部供應商皆可叫。勾選後只能叫勾選的供應商。
                </p>
                {/* 全選/全不選控制 */}
                <label className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted mb-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="size-4 rounded"
                    checked={formAllowedSuppliers.length === suppliers.length && suppliers.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormAllowedSuppliers(suppliers.map((s) => s.id));
                      } else {
                        setFormAllowedSuppliers([]);
                      }
                    }}
                  />
                  <span className="text-sm font-medium">全選</span>
                </label>
                {/* 按分類顯示供應商 */}
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {suppliers.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded"
                        checked={formAllowedSuppliers.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormAllowedSuppliers((prev) => [...prev, s.id]);
                          } else {
                            setFormAllowedSuppliers((prev) =>
                              prev.filter((id) => id !== s.id)
                            );
                          }
                        }}
                      />
                      <span className="text-sm flex-1">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.category}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              取消
            </Button>
            <Button onClick={handleEdit} disabled={submitting}>
              {submitting ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 重設 PIN Dialog ─── */}
      <Dialog open={showPinDialog} onOpenChange={setShowPinDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重設 {editingUser?.name} 的 PIN 碼</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>新 PIN 碼（4 位數字）</Label>
              <Input
                value={formNewPin}
                onChange={(e) => setFormNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="mt-1.5 tracking-widest text-lg text-center"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPinDialog(false)}>
              取消
            </Button>
            <Button onClick={handleResetPin} disabled={submitting || formNewPin.length !== 4}>
              {submitting ? "重設中..." : "確認重設"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── API Token 產生結果 Dialog ─── */}
      <Dialog open={!!showTokenResult} onOpenChange={() => setShowTokenResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>API Token 已產生</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              請立即複製此 Token，關閉後將無法再次查看。
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted px-3 py-2 rounded-md text-xs font-mono break-all select-all">
                {showTokenResult}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(showTokenResult || "");
                  toast.success("已複製 Token");
                }}
              >
                <CopyIcon className="size-3.5" />
              </Button>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700 space-y-1">
              <p className="font-semibold">使用方式：</p>
              <p>AI 助理呼叫 API 時帶入 Header：</p>
              <code className="block bg-yellow-100 px-2 py-1 rounded text-[11px]">
                Authorization: Bearer {showTokenResult?.slice(0, 8)}...
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTokenResult(null)}>
              我已複製，關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
