/**
 * 設定頁面（預留）
 * 目前僅顯示佔位訊息，後續可加入門店設定、帳號管理等功能
 */

import { Settings } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h2 className="font-heading text-xl font-semibold">設定</h2>
        <p className="text-sm text-muted-foreground mt-0.5">系統設定（開發中）</p>
      </div>

      <Card>
        <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center">
            <Settings className="size-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">設定頁面建置中</p>
            <p className="text-sm text-muted-foreground mt-1">
              即將新增：門店資料、帳號管理、通知設定
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
