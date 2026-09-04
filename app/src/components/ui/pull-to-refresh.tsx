"use client";

/**
 * مكون Pull-to-Refresh للموبايل
 * يمكّن السحب للأسفل لتحديث البيانات
 */

import type { ReactNode } from "react";
import { useState, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshProps {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  className?: string;
}

export function PullToRefresh({ children, onRefresh, className }: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  const threshold = 60; // المسافة المطلوبة لتفعيل التحديث
  const maxPull = 100; // أقصى مسافة سحب

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0]?.clientY ?? 0;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;

    currentY.current = e.touches[0]?.clientY ?? startY.current;
    const distance = Math.min(currentY.current - startY.current, maxPull);

    if (distance > 0) {
      setPullDistance(distance);
    }
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }

    setIsPulling(false);
    setPullDistance(0);
  }, [isPulling, pullDistance, isRefreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 180;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* مؤشر التحديث */}
      <div
        className={cn(
          "absolute inset-x-0 mx-auto w-fit flex items-center justify-center transition-all duration-200 z-10",
          (pullDistance > 0 || isRefreshing) ? "opacity-100" : "opacity-0"
        )}
        style={{
          top: Math.min(pullDistance - 40, 20),
          transform: `translateX(-50%) rotate(${isRefreshing ? 0 : rotation}deg)`,
        }}
      >
        <div className={cn(
          "w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center shadow-lg",
          isRefreshing && "animate-spin"
        )}>
          <RefreshCw className={cn(
            "h-4 w-4 text-primary",
            pullDistance >= threshold && !isRefreshing && "text-green-500"
          )} />
        </div>
      </div>

      {/* المحتوى */}
      <div
        style={{
          transform: `translateY(${isRefreshing ? 50 : pullDistance * 0.5}px)`,
          transition: isPulling ? "none" : "transform 0.2s ease-out",
        }}
      >
        {children}
      </div>

      {/* نص التحديث */}
      {isRefreshing && (
        <div className="absolute inset-x-0 top-2 mx-auto w-fit text-xs text-muted-foreground">
          جاري التحديث...
        </div>
      )}
    </div>
  );
}
