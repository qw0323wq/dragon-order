/**
 * 員工管理區塊 — 員工列表（桌面表格 + 手機卡片）+ 已停用帳號
 */
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  UserPlusIcon, PencilIcon, KeyRoundIcon, UserXIcon,
  UserCheckIcon, ShieldIcon, UsersIcon, KeyIcon, XCircleIcon,
} from "lucide-react";
import type { UserData, StoreData } from "./types";
import { ROLE_LABELS, ROLE_COLORS } from "./types";

interface UserSectionProps {
  activeUsers: UserData[];
  inactiveUsers: UserData[];
  onAdd: () => void;
  onEdit: (user: UserData) => void;
  onResetPassword: (user: UserData) => void;
  onToggleActive: (user: UserData) => void;
  onGenerateToken: (user: UserData) => void;
  onRevokeToken: (user: UserData) => void;
}

export default function UserSection({
  activeUsers, inactiveUsers,
  onAdd, onEdit, onResetPassword, onToggleActive,
  onGenerateToken, onRevokeToken,
}: UserSectionProps) {
  return (
    <>
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold flex items-center gap-2">
            <UsersIcon className="size-5" />
            員工管理
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            管理帳號、權限、密碼
          </p>
        </div>
        <Button onClick={onAdd} className="gap-1.5">
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
                  <TableHead>員工編號</TableHead>
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
                    <TableCell className="font-mono text-sm">{user.employeeId}</TableCell>
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
                          <Button variant="ghost" size="sm" className="h-6 px-1 text-red-400" onClick={() => onRevokeToken(user)} title="撤銷">
                            <XCircleIcon className="size-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={() => onGenerateToken(user)}>
                          <KeyIcon className="size-3 mr-1" />產生
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => onEdit(user)} title="編輯">
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onResetPassword(user)} title="重設密碼">
                          <KeyRoundIcon className="size-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onToggleActive(user)} title="停用" className="text-red-500 hover:text-red-700">
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
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-muted-foreground">{user.employeeId}</span>
                  {user.hasApiToken ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs gap-0.5">
                      <KeyIcon className="size-3" />API
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
                      <PencilIcon className="size-3.5 mr-1" />編輯
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onResetPassword(user)}>
                      <KeyRoundIcon className="size-3.5 mr-1" />密碼
                    </Button>
                    {user.hasApiToken ? (
                      <Button variant="outline" size="sm" className="text-red-500 border-red-200" onClick={() => onRevokeToken(user)}>
                        <XCircleIcon className="size-3.5 mr-1" />撤銷 Token
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => onGenerateToken(user)}>
                        <KeyIcon className="size-3.5 mr-1" />產生 Token
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => onToggleActive(user)} className="text-red-500 border-red-200">
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
                    <span className="ml-2 text-sm text-muted-foreground">{user.employeeId}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {ROLE_LABELS[user.role]}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => onToggleActive(user)} className="text-green-600 border-green-200">
                    <UserCheckIcon className="size-3.5 mr-1" />重新啟用
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
