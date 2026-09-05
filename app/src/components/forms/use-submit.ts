"use client";

/**
 * Shared submit plumbing for feature dialogs: run a Server Action, merge `fieldErrors` into the form,
 * toast success/failure, close the dialog and refresh the RSC tree.
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { FieldErrors, Result } from "@/lib/result";

export function useSubmit<T = unknown>(
  onOpenChange: (o: boolean) => void,
  successMessage: string | ((data: T) => string),
) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const run = (fn: () => Promise<Result<T>>, after?: (data: T) => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      toast.success(typeof successMessage === "function" ? successMessage(res.data) : successMessage);
      setErrors({});
      onOpenChange(false);
      after?.(res.data);
      router.refresh();
    });
  const reset = () => setErrors({});
  return { pending, errors, run, reset };
}
