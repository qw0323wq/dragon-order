/**
 * 門市管理區塊 — 門市列表 + 編輯 Dialog
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PencilIcon, StoreIcon, Building2Icon, SaveIcon, PlusIcon } from "lucide-react";
import type { StoreData } from "./types";

interface StoreSectionProps {
  stores: StoreData[];
  onRefetch: () => void;
}

export default function StoreSection({ stores, onRefetch }: StoreSectionProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", companyName: "", taxId: "", address: "", hours: "", manager: "", phone: "",
  });

  const openEdit = (store: StoreData) => {
    setEditingStore(store);
    setForm({
      name: store.name,
      companyName: store.companyName || "",
      taxId: store.taxId || "",
      address: store.address || "",
      hours: store.hours || "",
      manager: store.manager || "",
      phone: store.phone || "",
    });
    setShowDialog(true);
  };

  const openAdd = () => {
    setEditingStore(null);
    setForm({ name: "", companyName: "", taxId: "", address: "", hours: "", manager: "", phone: "" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("門市名稱不能為空"); return; }
    setSubmitting(true);
    try {
      const method = editingStore ? "PATCH" : "POST";
      const body = editingStore ? { id: editingStore.id, ...form } : form;
      const res = await fetch("/api/stores", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "儲存失敗");
        return;
      }
      toast.success(editingStore ? `已更新 ${form.name}` : `已新增 ${form.name}`);
      setShowDialog(false);
      onRefetch();
    } catch {
      toast.error("儲存失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
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
        <Button size="sm" className="gap-1" onClick={openAdd}>
          <PlusIcon className="size-3.5" /> 新增門市
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stores.map((store) => (
          <Card key={store.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{store.name}</CardTitle>
                <Button variant="outline" size="sm" onClick={() => openEdit(store)}>
                  <PencilIcon className="size-3.5 mr-1" />編輯
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {store.companyName ? (
                <div className="flex items-center gap-2">
                  <Building2Icon className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{store.companyName}</span>
                  {store.taxId && (
                    <span className="text-muted-foreground font-mono text-xs">（{store.taxId}）</span>
                  )}
                </div>
              ) : (
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

      {/* 門市編輯 Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStore ? `編輯 ${editingStore.name}` : '新增門市'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>門市名稱</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>公司名稱（發票抬頭）</Label>
                <Input value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))} placeholder="OOO有限公司" className="mt-1.5" />
              </div>
              <div>
                <Label>統一編號</Label>
                <Input value={form.taxId} onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))} placeholder="12345678" className="mt-1.5 font-mono" />
              </div>
            </div>
            <div>
              <Label>地址</Label>
              <Textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className="mt-1.5" rows={2} />
            </div>
            <div>
              <Label>營業時間</Label>
              <Input value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>店長</Label>
                <Input value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} className="mt-1.5" />
              </div>
              <div>
                <Label>電話</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} type="tel" className="mt-1.5" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>取消</Button>
            <Button onClick={handleSave} disabled={submitting} className="gap-1.5">
              <SaveIcon className="size-3.5" />
              {submitting ? "儲存中..." : editingStore ? "儲存" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
