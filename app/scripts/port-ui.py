#!/usr/bin/env python3
"""
Port legacy shadcn/ui components from .refs/s-acm (Vite/wouter) into the Next.js app.

Transformations (docs/30-architecture/05-UI-DESIGN-SYSTEM.md §6 — RTL rules):
  * physical → logical Tailwind classes (ml→ms, pl→ps, left→start, text-left→text-start, …)
  * centering idiom `left-1/2 -translate-x-1/2` → `inset-x-0 mx-auto w-fit`
  * `@radix-ui/react-*` → `radix-ui` meta-package namespaces
  * `"use client"` directive on every component file
  * `@/hooks/*` imports kept (hooks are ported too)

Usage: python3 app/scripts/port-ui.py   (idempotent — re-run any time)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / ".refs/s-acm/apps/web/src"
DST = ROOT / "app/src"

RADIX_NS = {
    "accordion": "Accordion", "alert-dialog": "AlertDialog", "aspect-ratio": "AspectRatio", "avatar": "Avatar",
    "checkbox": "Checkbox", "collapsible": "Collapsible", "context-menu": "ContextMenu", "dialog": "Dialog",
    "dropdown-menu": "DropdownMenu", "hover-card": "HoverCard", "label": "Label", "menubar": "Menubar",
    "navigation-menu": "NavigationMenu", "popover": "Popover", "progress": "Progress", "radio-group": "RadioGroup",
    "scroll-area": "ScrollArea", "select": "Select", "separator": "Separator", "slider": "Slider", "switch": "Switch",
    "tabs": "Tabs", "toggle": "Toggle", "toggle-group": "ToggleGroup", "tooltip": "Tooltip",
}

# Order matters: longer / more specific patterns first.
CLASS_RULES: list[tuple[str, str]] = [
    # centering idioms
    (r"top-\[50%\] left-\[50%\] z-50 grid w-full max-w-\[calc\(100%-2rem\)\] translate-x-\[-50%\] translate-y-\[-50%\]",
     "inset-x-0 top-1/2 z-50 mx-auto grid w-[calc(100%-2rem)] -translate-y-1/2"),
    (r"absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2", "absolute inset-0 m-auto size-2"),
    (r"after:left-1/2 after:w-1 after:-translate-x-1/2", "after:inset-x-0 after:mx-auto after:w-1"),
    (r"absolute left-1/2 -translate-x-1/2", "absolute inset-x-0 mx-auto w-fit"),
    (r"absolute top-2 left-1/2 -translate-x-1/2", "absolute inset-x-0 top-2 mx-auto w-fit"),
    (r"-top-12 left-1/2 -translate-x-1/2 rotate-90", "-top-12 inset-x-0 mx-auto rotate-90"),
    (r"-bottom-12 left-1/2 -translate-x-1/2 rotate-90", "-bottom-12 inset-x-0 mx-auto rotate-90"),
    # tw-animate-css logical variants
    (r"slide-in-from-left", "slide-in-from-start"), (r"slide-in-from-right", "slide-in-from-end"),
    (r"slide-out-to-left", "slide-out-to-start"), (r"slide-out-to-right", "slide-out-to-end"),
    # text alignment
    (r"\btext-left\b", "text-start"), (r"\btext-right\b", "text-end"),
    # rounded / border sides
    (r"\brounded-l-", "rounded-s-"), (r"\brounded-r-", "rounded-e-"),
    (r"\bborder-l\b", "border-s"), (r"\bborder-r\b", "border-e"),
    (r"\bborder-l-", "border-s-"), (r"\bborder-r-", "border-e-"),
    # spacing (keep negative prefix and variants like sm:, has-[…]:)
    (r"(?<![\w-])(-?)ml-", r"\1ms-"), (r"(?<![\w-])(-?)mr-", r"\1me-"),
    (r"(?<![\w-])(-?)pl-", r"\1ps-"), (r"(?<![\w-])(-?)pr-", r"\1pe-"),
    (r"(?<=[:\]])(-?)ml-", r"\1ms-"), (r"(?<=[:\]])(-?)mr-", r"\1me-"),
    (r"(?<=[:\]])(-?)pl-", r"\1ps-"), (r"(?<=[:\]])(-?)pr-", r"\1pe-"),
    # positioning
    (r"(?<![\w-])(-?)left-", r"\1start-"), (r"(?<![\w-])(-?)right-", r"\1end-"),
    (r"(?<=[:\]])(-?)left-", r"\1start-"), (r"(?<=[:\]])(-?)right-", r"\1end-"),
    # sidebar: physical `side` data attributes → logical
    (r"side=left", "side=start"), (r"side=right", "side=end"),
    (r"vaul-drawer-direction=left", "vaul-drawer-direction=start"),
    (r"vaul-drawer-direction=right", "vaul-drawer-direction=end"),
]

PROP_RULES: list[tuple[str, str]] = [
    (r'side = "right",', 'side = "end",'),
    (r'side = "left",', 'side = "start",'),
    (r'side\?: "top" \| "right" \| "bottom" \| "left";', 'side?: "top" | "end" | "bottom" | "start";'),
    (r'side\?: "left" \| "right";', 'side?: "start" | "end";'),
    (r'side === "right"', 'side === "end"'),
    (r'side === "left"', 'side === "start"'),
    (r'side="right"', 'side="end"'),
    (r'side="left"', 'side="start"'),
    (r'orientation === "left"', 'orientation === "left"'),  # calendar nav (react-day-picker API) — keep
    (r'transition-\[left,right,width\]', 'transition-[inset-inline,width]'),
    (r'cursor-w-resize', 'cursor-ew-resize'), (r'cursor-e-resize', 'cursor-ew-resize'),
]


ANY_TO_UNKNOWN = [
    ("<T extends Record<string, any>>", "<T extends Record<string, unknown>>"),
    ("(e.nativeEvent as any).isComposing", "(e.nativeEvent as KeyboardEvent).isComposing"),
    ("(e as any).isComposing", "e.isComposing"),
]


def _generic_any(code: str) -> str:
    for a, b in ANY_TO_UNKNOWN:
        code = code.replace(a, b)
    return code


def _carousel(code: str) -> str:
    # Embla exposes its API through an effect by design (upstream shadcn); the React-compiler lint rules flag it.
    return code.replace(
        """  React.useEffect(() => {
    if (!api || !setApi) return
    setApi(api)
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) return
    onSelect(api)""",
        """  React.useEffect(() => {
    if (!api || !setApi) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- embla hands its API to the parent post-mount
    setApi(api)
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial scroll-state sync from embla
    onSelect(api)""",
    )


def _input_group(code: str) -> str:
    # Addon is a focus-forwarding affordance, not an interactive control → mark presentational for a11y linting.
    return code.replace(
        """      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={e => {""",
        """      role="presentation"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {""",
    )


def _mobile_data_table(code: str) -> str:
    code = _generic_any(code)
    return code.replace(
        """            onClick={() => onItemClick?.(item)}
          >""",
        """            role={onItemClick ? "button" : undefined}
            tabIndex={onItemClick ? 0 : undefined}
            onClick={() => onItemClick?.(item)}
            onKeyDown={(e) => {
              if (onItemClick && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onItemClick(item);
              }
            }}
          >""",
    )


def _mobile_list(code: str) -> str:
    code = code.replace(
        """          onClick={item.onClick}
        >""",
        """          role={item.onClick ? "button" : undefined}
          tabIndex={item.onClick ? 0 : undefined}
          onClick={item.onClick}
          onKeyDown={(e) => {
            if (item.onClick && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              item.onClick();
            }
          }}
        >""",
    )
    return code.replace(
        """      onClick={onClick}
    >
      {children}""",
        """      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {children}""",
    )


def _pagination(code: str) -> str:
    # anchor-has-content: children are always passed by callers; make that explicit for the linter.
    return code.replace(
        """function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}: PaginationLinkProps) {
  return (
    <a""",
        """function PaginationLink({
  className,
  isActive,
  size = "icon",
  children,
  ...props
}: PaginationLinkProps) {
  return (
    <a""",
    ).replace(
        """        className
      )}
      {...props}
    />
  );
}

function PaginationPrevious(""",
        """        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

function PaginationPrevious(""",
    )


def _sidebar(code: str) -> str:
    # Skeleton width: Math.random() during render is impure → derive from React.useId (stable, deterministic per instance).
    return code.replace(
        """  // Random width between 50 to 90%.
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);""",
        """  // Pseudo-random width between 50 and 90%, derived from the stable instance id (pure render).
  const id = React.useId();
  const width = React.useMemo(() => {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `${(h % 40) + 50}%`;
  }, [id]);""",
    )


FILE_PATCHES = {
    "carousel.tsx": _carousel,
    "dialog.tsx": _generic_any,
    "input.tsx": _generic_any,
    "textarea.tsx": _generic_any,
    "input-group.tsx": _input_group,
    "pagination.tsx": _pagination,
    "sidebar.tsx": _sidebar,
}


def port_radix(code: str) -> str:
    def repl(m: re.Match[str]) -> str:
        alias, pkg = m.group(1), m.group(2)
        ns = RADIX_NS.get(pkg)
        if not ns:
            raise SystemExit(f"unknown radix package: {pkg}")
        return f'import {{ {ns} as {alias} }} from "radix-ui";'

    code = re.sub(r'import \* as (\w+) from "@radix-ui/react-([a-z-]+)";', repl, code)
    if '@radix-ui/react-slot' in code:
        code = code.replace('import { Slot } from "@radix-ui/react-slot";', "__SLOT_IMPORT__")
        code = re.sub(r"(?<![\w.])Slot(?=[\s>])", "SlotPrimitive.Slot", code)
        code = code.replace("__SLOT_IMPORT__", 'import { Slot as SlotPrimitive } from "radix-ui";')
    return code


def port_classes(code: str) -> str:
    for pat, rep in CLASS_RULES:
        code = re.sub(pat, rep, code)
    for pat, rep in PROP_RULES:
        code = re.sub(pat, rep, code)
    return code


def port_file(src: Path, dst: Path) -> None:
    code = src.read_text(encoding="utf-8")
    code = port_radix(code)
    code = port_classes(code)
    code = FILE_PATCHES.get(src.name, lambda c: c)(code)
    if src.name == "pull-to-refresh.tsx":
        code = code.replace("startY.current = e.touches[0].clientY;", "startY.current = e.touches[0]?.clientY ?? 0;")
        code = code.replace("currentY.current = e.touches[0].clientY;", "currentY.current = e.touches[0]?.clientY ?? startY.current;")
    if src.name == "sidebar.tsx":
        # Radix TooltipContent `side` is physical → map from the logical sidebar side at runtime.
        code = code.replace('import { useIsMobile } from "@/hooks/useMobile";',
                            'import { useIsMobile } from "@/hooks/useMobile";\nimport { toPhysicalSide, useDirection } from "@/hooks/useDirection";')
        code = code.replace('  const { isMobile, state } = useSidebar();\n', '  const { isMobile, state } = useSidebar();\n  const dir = useDirection();\n')
        code = code.replace('        side="end"\n        align="center"\n        hidden={state !== "collapsed" || isMobile}',
                            '        side={toPhysicalSide("end", dir)}\n        align="center"\n        hidden={state !== "collapsed" || isMobile}')
    if not code.lstrip().startswith('"use client"'):
        code = '"use client";\n\n' + code
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(code, encoding="utf-8")


def main() -> None:
    ui_src = SRC / "components/ui"
    if not ui_src.exists():
        sys.exit(f"missing {ui_src}")
    n = 0
    upstream = {f.name for f in (ROOT / "app/scripts/ui-upstream").glob("*.tsx")}
    local = {f.name for f in (ROOT / "app/scripts/ui-local").glob("*.tsx")}
    for f in sorted(ui_src.glob("*.tsx")):
        if f.name in upstream or f.name in local:
            continue
        port_file(f, DST / "components/ui" / f.name)
        n += 1
    # chart.tsx / resizable.tsx: legacy versions target recharts 2 / react-resizable-panels 3;
    # we vendor the shadcn upstream (recharts 3, panels 4) and run the same RTL/radix port.
    for f in sorted((ROOT / "app/scripts/ui-upstream").glob("*.tsx")):
        port_file(f, DST / "components/ui" / f.name)
        n += 1
    # data-table / mobile-data-table / mobile-list: rewritten in-house (typed, keyboard-accessible, RTL) —
    # copied verbatim from scripts/ui-local (they are the source of truth, not the legacy repo).
    for f in sorted((ROOT / "app/scripts/ui-local").glob("*.tsx")):
        (DST / "components/ui" / f.name).write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
        n += 1
    for h in ["useComposition.ts"]:
        p = SRC / "hooks" / h
        if p.exists():
            port_file(p, DST / "hooks" / h)
    print(f"ported {n} ui components + hooks → {DST / 'components/ui'}")


if __name__ == "__main__":
    main()
