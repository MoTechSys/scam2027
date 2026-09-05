"use client";

/**
 * Generic confirm dialog for destructive / irreversible Server Actions. Stays open on failure (error toast) and
 * closes + refreshes on success. Shared by users, roles and later modules.
 */
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Result } from "@/lib/result";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: string;
  destructive?: boolean;
  onConfirm: () => Promise<Result<unknown>>;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "min-h-11 bg-destructive text-white hover:bg-destructive/90" : "min-h-11"}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await onConfirm();
                if (!r.ok) toast.error(r.message);
                else {
                  onOpenChange(false);
                  router.refresh();
                }
              });
            }}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
