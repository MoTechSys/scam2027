/**
 * بطاقة الإحصائيات
 * S-ACM Frontend - Clean Tech Dashboard Theme
 */

import { cn } from "@/lib/utils";
import type { LucideIcon} from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  description?: string;
  className?: string;
  valueClassName?: string;
}

export function StatCard({ title, value, icon: Icon, trend, description, className, valueClassName }: StatCardProps) {
  return (
    <Card className={cn("card-hover", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn("text-3xl font-bold text-foreground", valueClassName)}>{value}</p>
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-sm",
                trend.isPositive ? "text-emerald-500" : "text-red-500"
              )}>
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(trend.value)}%</span>
                <span className="text-muted-foreground">من الأسبوع الماضي</span>
              </div>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="p-3 rounded-lg bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
