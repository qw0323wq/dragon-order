/**
 * 員工管理 Dialog 集合 — 新增 / 編輯 / 重設密碼 / API Token 結果
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { CopyIcon, KeyIcon } from "lucide-react";
import type { UserData, StoreData, SupplierOption } from "./types";

interface UserDialogsProps {
  stores: StoreData[];
  suppliers: SupplierOption[];
  onRefetch: () => void;
}

export default function UserDialogs({ stores, suppliers, onRefetch }: UserDialogsProps) {
  // Dialog 狀態
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPwdDialog, setShowPwdDialog] = useState(false);
  const [showTokenResult, setShowTokenResult] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);

  // 表單
  const [formName, setFormName] = useState("");
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formNewPassword, setFormNewPassword] = useState("");
  const [formRole, setFormRole] = useState("staff");
  const [formStoreId, setFormStoreId] = useState<string>("");
  const [formAllowedSuppliers, setFormAllowedSuppliers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormName(""); setFormEmployeeId(""); setFormPhone("");
    setFormPassword(""); setFormNewPassword("");
    setFormRole("staff"); setFormStoreId("");
    setFormAllowedSuppliers([]); setEditingUser(null);
  };

  // ─── 公開方法：供 page.tsx 呼叫 ───
  const openAdd = () => { resetForm(); setShowAddDialog(true); };

  const openEdit = (user: UserData) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmployeeId(user.employeeId ?? "");
    setFormPhone(user.phone || "");
    setFormRole(user.role);
    setFormStoreId(user.storeId ? String(user.storeId) : "");
    setFormAllowedSuppliers(user.allowedSuppliers ?? []);
    setShowEditDialog(true);
  };

  const openResetPassword = (user: UserData) => {
    setEditingUser(user);
    setFormNewPassword("");
    setShowPwdDialog(true);
  };

  const toggleActive = async (user: UserData) => {
    const action = user.isActive ? "停用" : "啟用";
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) { toast.error(`${action}失敗`); return; }
      toast.success(`已${action} ${user.name}`);
      onRefetch();
    } catch { toast.error(`${action}失敗`); }
  };

  const generateToken = async (user: UserData) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateToken: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "產生失敗"); return; }
      setShowTokenResult(data.apiToken);
      toast.success(`已為 ${user.name} 產生 API Token`);
      onRefetch();
    } catch { toast.error("產生失敗"); }
  };

  const revokeToken = async (user: UserData) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeToken: true }),
      });
      if (!res.ok) { toast.error("撤銷失敗"); return; }
      toast.success(`已撤銷 ${user.name} 的 API Token`);
      onRefetch();
    } catch { toast.error("撤銷失敗"); }
  };

  // ─── Handler ───
  const handleAdd = async () => {
    if (!formName || !formEmployeeId || !formPassword) {
      toast.error("請填寫所有必填欄位"); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName, employeeId: formEmployeeId,
          password: formPassword, phone: formPhone || undefined,
          role: formRole, storeId: formStoreId ? parseInt(formStoreId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "新增失敗"); return; }
      toast.success(`已新增 ${formName}`);
      setShowAddDialog(false); resetForm(); onRefetch();
    } catch { toast.error("新增失敗"); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async () => {
    if (!editingUser) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName, employeeId: formEmployeeId,
          phone: formPhone, role: formRole,
          storeId: formStoreId ? parseInt(formStoreId) : null,
          allowedSuppliers: formAllowedSuppliers,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "更新失敗"); return; }
      toast.success(`已更新 ${formName}`);
      setShowEditDialog(false); resetForm(); onRefetch();
    } catch { toast.error("更新失敗"); }
    finally { setSubmitting(false); }
  };

  const handleResetPassword = async () => {
    if (!editingUser || !formNewPassword) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: formNewPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "重設失敗"); return; }
      toast.success(`已重設 ${editingUser.name} 的密碼`);
      setShowPwdDialog(false); setFormNewPassword(""); setEditingUser(null);
    } catch { toast.error("重設失敗"); }
    finally { setSubmitting(false); }
  };

  /** 角色選擇器（新增 / 編輯共用） */
  const ROLE_OPTIONS = [
    { value: 'staff', label: '員工' },
    { value: 'manager', label: '店長' },
    { value: 'buyer', label: '採購' },
    { value: 'admin', label: '管理員' },
  ];
  const RoleSelect = () => (
    <Select value={formRole} onValueChange={(v) => setFormRole(v ?? "staff")}>
      <SelectTrigger className="mt-1.5">
        <SelectValue>
          {ROLE_OPTIONS.find(r => r.value === formRole)?.label || '選擇角色'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map(r => (
          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  /** 門市選擇器 */
  const StoreSelect = () => (
    <Select value={formStoreId || "__none__"} onValueChange={(v) => setFormStoreId(v === "__none__" ? "" : (v ?? ""))}>
      <SelectTrigger className="mt-1.5">
        <SelectValue>
          {formStoreId ? (stores.find(s => s.id === parseInt(formStoreId))?.name || '選擇門市') : '全部門市'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">全部門市</SelectItem>
        {stores.map((s) => (
          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return {
    // 暴露動作給 page.tsx / UserSection 使用
    openAdd, openEdit, openResetPassword, toggleActive, generateToken, revokeToken,

    // Dialog 渲染
    dialogs: (
      <>
        {/* ─── 新增員工 ─── */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>新增員工</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>姓名 *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="員工姓名" className="mt-1.5" /></div>
              <div><Label>員工編號 *</Label><Input value={formEmployeeId} onChange={(e) => setFormEmployeeId(e.target.value)} placeholder="例: E001" className="mt-1.5" /></div>
              <div><Label>密碼 *（至少 4 個字元）</Label><Input value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="設定密碼" type="password" className="mt-1.5" /></div>
              <div><Label>手機號碼（選填）</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="09xx-xxx-xxx" type="tel" className="mt-1.5" /></div>
              <div><Label>角色</Label><RoleSelect /></div>
              <div><Label>所屬門市</Label><StoreSelect /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
              <Button onClick={handleAdd} disabled={submitting}>{submitting ? "新增中..." : "新增"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── 編輯員工 ─── */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>編輯 {editingUser?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>姓名</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} className="mt-1.5" /></div>
              <div><Label>員工編號</Label><Input value={formEmployeeId} onChange={(e) => setFormEmployeeId(e.target.value)} className="mt-1.5" /></div>
              <div><Label>手機號碼（選填）</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} type="tel" className="mt-1.5" /></div>
              <div><Label>角色</Label><RoleSelect /></div>
              <div><Label>所屬門市</Label><StoreSelect /></div>
              {/* 叫貨權限（僅員工角色顯示） */}
              {formRole === "staff" && suppliers.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label>叫貨權限</Label>
                    <span className="text-xs text-muted-foreground">
                      {formAllowedSuppliers.length === 0 ? "全部可叫" : `已選 ${formAllowedSuppliers.length} 家`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">不勾選 = 全部供應商皆可叫。</p>
                  <label className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted mb-1 cursor-pointer select-none">
                    <input type="checkbox" className="size-4 rounded"
                      checked={formAllowedSuppliers.length === suppliers.length && suppliers.length > 0}
                      onChange={(e) => setFormAllowedSuppliers(e.target.checked ? suppliers.map((s) => s.id) : [])}
                    />
                    <span className="text-sm font-medium">全選</span>
                  </label>
                  <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                    {suppliers.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer select-none">
                        <input type="checkbox" className="size-4 rounded"
                          checked={formAllowedSuppliers.includes(s.id)}
                          onChange={(e) => setFormAllowedSuppliers((prev) => e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id))}
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
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
              <Button onClick={handleEdit} disabled={submitting}>{submitting ? "儲存中..." : "儲存"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── 重設密碼 ─── */}
        <Dialog open={showPwdDialog} onOpenChange={setShowPwdDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>重設 {editingUser?.name} 的密碼</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>新密碼（至少 4 個字元）</Label>
                <Input value={formNewPassword} onChange={(e) => setFormNewPassword(e.target.value)} placeholder="輸入新密碼" type="password" className="mt-1.5" autoFocus />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPwdDialog(false)}>取消</Button>
              <Button onClick={handleResetPassword} disabled={submitting || formNewPassword.length < 4}>
                {submitting ? "重設中..." : "確認重設"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── API Token 結果 ─── */}
        <Dialog open={!!showTokenResult} onOpenChange={() => setShowTokenResult(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>API Token 已產生</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">請立即複製此 Token，關閉後將無法再次查看。</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-muted px-3 py-2 rounded-md text-xs font-mono break-all select-all">
                  {showTokenResult}
                </code>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(showTokenResult || ""); toast.success("已複製 Token"); }}>
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
              <Button onClick={() => setShowTokenResult(null)}>我已複製，關閉</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    ),
  };
}
