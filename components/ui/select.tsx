"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  SELECT_ITEM_MARK,
  collectSelectItemLabels,
  resolveSelectDisplay,
} from "@/components/ui/select-labels";

type SelectContextValue = {
  value?: string;
  setValue: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
  labels: Record<string, string>;
  closeOnSelect: boolean;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

const useSelectContext = () => {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error("Select components must be used within a Select");
  }
  return context;
};

type SelectProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  closeOnSelect?: boolean;
};

function Select({
  value: valueProp,
  defaultValue,
  onValueChange,
  children,
  closeOnSelect = true,
}: SelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue);

  const value = valueProp ?? internalValue;
  const labels = React.useMemo(() => collectSelectItemLabels(children), [children]);

  const setValue = React.useCallback(
    (next: string) => {
      setInternalValue(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  const contextValue = React.useMemo(
    () => ({
      value,
      setValue,
      open,
      setOpen,
      isMobile,
      labels,
      closeOnSelect,
    }),
    [closeOnSelect, isMobile, labels, open, setValue, value],
  );

  return (
    <SelectContext.Provider value={contextValue}>
      {isMobile ? (
        <Sheet open={open} onOpenChange={setOpen}>
          {children}
        </Sheet>
      ) : (
        <DropdownMenu open={open} onOpenChange={setOpen}>
          {children}
        </DropdownMenu>
      )}
    </SelectContext.Provider>
  );
}

type SelectTriggerProps = React.ComponentPropsWithoutRef<typeof Button>;

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open, isMobile } = useSelectContext();
    const Trigger = isMobile ? SheetTrigger : DropdownMenuTrigger;
    return (
      <Trigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-state={open ? "open" : "closed"}
          className={cn(
            "flex min-w-[12rem] items-center justify-between gap-2 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
            className,
          )}
          {...props}
        >
          <span className="min-w-0 flex-1 text-left">{children}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </Trigger>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

type SelectValueProps = {
  placeholder?: string;
  className?: string;
};

function SelectValue({ placeholder, className }: SelectValueProps) {
  const { value, labels } = useSelectContext();
  const display = resolveSelectDisplay(value, labels, placeholder);
  return <span className={cn("block truncate", className)}>{display}</span>;
}

type SelectContentProps = React.ComponentPropsWithoutRef<typeof DropdownMenuContent> & {
  /**
   * Heading for the mobile bottom sheet. A select inside a form inherits its
   * context from the field label on the page; a header control (currency,
   * say) has none, so its sheet would open as a bare list of options. Also
   * gives the sheet its accessible name. The desktop dropdown has no header
   * and ignores it.
   */
  sheetTitle?: string;
};

const SelectContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuContent>,
  SelectContentProps
>(({ className, children, sheetTitle, ...props }, ref) => {
  const { isMobile } = useSelectContext();

  if (isMobile) {
    const { align, alignOffset, side, sideOffset, ...sheetProps } = props;
    void align;
    void alignOffset;
    void side;
    void sideOffset;
    return (
      <SheetContent
        side="bottom"
        mobilePreset="quick"
        // Caller classes target the desktop popover; the drawer's own width,
        // padding and position come last so a `w-[280px]` can't shrink it.
        className={cn(className, "inset-x-0 w-full min-w-0 max-w-none px-0 pt-0")}
        {...sheetProps}
      >
        {sheetTitle && (
          <SheetHeader className="px-4 py-0">
            <SheetTitle>{sheetTitle}</SheetTitle>
          </SheetHeader>
        )}
        <div className="max-h-[70svh] overflow-auto px-2 pb-14 pt-2">
          {children}
        </div>
      </SheetContent>
    );
  }

  return (
    <DropdownMenuContent
      ref={ref}
      // Match the dropdown content width to the trigger width (Radix sets this CSS var).
      className={cn("w-(--radix-dropdown-menu-trigger-width)", className)}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  );
});
SelectContent.displayName = "SelectContent";

type SelectItemProps = Omit<
  React.ComponentPropsWithoutRef<typeof DropdownMenuItem>,
  "onClick"
> & {
  value: string;
  textValue?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
};

const SelectItem = React.forwardRef<React.ElementRef<typeof DropdownMenuItem>, SelectItemProps>(
  (
    {
      children,
      value,
      className,
      disabled,
      inset,
      variant,
      asChild,
      onSelect,
      onClick,
      ...props
    },
    ref,
  ) => {
    void inset;
    void variant;
    void asChild;

    const { setValue, setOpen, closeOnSelect, value: selectedValue } = useSelectContext();
    const { isMobile } = useSelectContext();
    const isSelected = selectedValue === value;

    const handleSelect = (event: Event | React.SyntheticEvent) => {
      event.preventDefault();
      if (disabled) return;
      setValue(value);
      if (closeOnSelect) {
        setOpen(false);
      }
    };

    if (isMobile) {
      const buttonProps = props as React.ButtonHTMLAttributes<HTMLButtonElement>;
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          role="option"
          aria-selected={isSelected}
          aria-disabled={disabled}
          data-selected={isSelected}
          data-value={value}
          disabled={disabled}
          className={cn(
            "hover:bg-accent hover:text-accent-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground flex w-full items-start gap-2 rounded-md px-4 py-3 text-left text-base transition-colors disabled:pointer-events-none disabled:opacity-50",
            className,
          )}
          onClick={(event) => {
            handleSelect(event);
            onClick?.(event);
          }}
          {...buttonProps}
        >
          <span className="mt-0.5 inline-flex w-4 shrink-0 items-center justify-center">
            {isSelected ? <Check className="size-4" /> : null}
          </span>
          <span className="min-w-0 flex-1">{children}</span>
        </button>
      );
    }

    return (
      <DropdownMenuItem
        ref={ref}
        data-value={value}
        disabled={disabled}
        className={cn("cursor-pointer items-start gap-2", className)}
        onSelect={(event) => {
          handleSelect(event);
          onSelect?.(event);
        }}
        {...props}
      >
        <span className="mt-0.5 inline-flex w-4 shrink-0 items-center justify-center">
          {isSelected ? <Check className="size-4" /> : null}
        </span>
        <span className="min-w-0 flex-1">{children}</span>
      </DropdownMenuItem>
    );
  },
);
SelectItem.displayName = "SelectItem";
(SelectItem as unknown as { [SELECT_ITEM_MARK]: true })[SELECT_ITEM_MARK] = true;

/** A non-selectable heading between groups of items. */
function SelectGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      className={cn("px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground first:pt-1", className)}
      {...props}
    />
  );
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroupLabel };
