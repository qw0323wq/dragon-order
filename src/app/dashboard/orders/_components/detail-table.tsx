'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { OrderDetail } from './types'
import { formatCurrency } from '@/lib/format'

interface DetailTableProps {
  details: OrderDetail[]
  grandTotal: number
}

export function DetailTable({ details, grandTotal }: DetailTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>訂單明細</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>品項</TableHead>
              <TableHead>供應商</TableHead>
              <TableHead>門市</TableHead>
              <TableHead className="text-right">數量</TableHead>
              <TableHead>單位</TableHead>
              <TableHead className="text-right">單價</TableHead>
              <TableHead className="text-right">小計</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {details.map((d) => {
              const qty = parseFloat(d.quantity)
              const qtyStr = Number.isInteger(qty) ? String(qty) : qty.toFixed(1)
              return (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.itemName}</TableCell>
                  <TableCell><Badge variant="secondary">{d.supplierName}</Badge></TableCell>
                  <TableCell className="text-sm">{d.storeName}</TableCell>
                  <TableCell className="text-right">{qtyStr}</TableCell>
                  <TableCell className="text-muted-foreground">{d.unit}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatCurrency(d.unitPrice)}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{formatCurrency(d.subtotal)}</TableCell>
                </TableRow>
              )
            })}
            <TableRow className="bg-muted/50">
              <TableCell colSpan={6} className="font-semibold text-right">總計</TableCell>
              <TableCell className="text-right font-bold text-primary text-base">{formatCurrency(grandTotal)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
