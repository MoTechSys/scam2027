"use client";

/**
 * TypedConfirmDialog — ConfirmDialog variant for irreversible bulk operations (empty trash, purge all …).
 * The confirm button stays disabled until the user types `keyword` exactly (case-sensitive), which prevents a
 * reflexive click from wiping a tenant's data. Same success/failure semantics as ConfirmDialog.
 */
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Result } from "@/lib/result";

export function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  keyword,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  body: string;
  keyword: string;
  onConfirm: () => Promise<Result<unknown>>;
}) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [typed, setTyped] = useState("");
  const id = useId();
  const ready = typed === keyword;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped("");
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor={id}>{t("typeToConfirm", { keyword })}</Label>
          <Input
            id={id}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            dir="ltr"
            className="min-h-11 font-mono"
            data-testid="typed-confirm-input"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="min-h-11 bg-destructive text-white hover:bg-destructive/90"
            disabled={pending || !ready}
            data-testid="typed-confirm-submit"
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await onConfirm();
                if (!r.ok) toast.error(r.message);
                else {
                  setTyped("");
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
