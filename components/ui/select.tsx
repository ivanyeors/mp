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
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type SelectContextValue = {
  value?: string;
  setValue: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  isMobile: boolean;
  labels: Record<string, string>;
  registerLabel: (value: string, label: string) => void;
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
  const [labels, setLabels] = React.useState<Record<string, string>>({});

  const value = valueProp ?? internalValue;

  const setValue = React.useCallback(
    (next: string) => {
      setInternalValue(next);
      onValueChange?.(next);
    },
    [onValueChange],
  );

  const registerLabel = React.useCallback((optionValue: string, label: string) => {
    setLabels((prev) => {
      if (prev[optionValue] === label) return prev;
      return { ...prev, [optionValue]: label };
    });
  }, []);

  const contextValue = React.useMemo(
    () => ({
      value,
      setValue,
      open,
      setOpen,
      isMobile,
      labels,
      registerLabel,
      closeOnSelect,
    }),
    [closeOnSelect, isMobile, labels, open, registerLabel, setValue, value],
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
  const display = value ? labels[value] ?? value : placeholder ?? "Select";
  return <span className={cn("block truncate", className)}>{display}</span>;
}

type SelectContentProps = React.ComponentPropsWithoutRef<typeof DropdownMenuContent>;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuContent>,
  SelectContentProps
>(({ className, children, ...props }, ref) => {
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
        className={cn("w-full max-w-none p-0", className)}
        {...sheetProps}
      >
        <div className="px-4 pt-3">
          <div className="bg-muted mx-auto h-1.5 w-12 rounded-full" />
        </div>
        <div className="max-h-[70svh] overflow-auto px-2 pb-4 pt-2">
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
      textValue,
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

    const { setValue, setOpen, registerLabel, closeOnSelect, value: selectedValue } =
      useSelectContext();
    const { isMobile } = useSelectContext();
    const isSelected = selectedValue === value;

    const label = React.useMemo(() => {
      if (typeof textValue === "string") return textValue;
      if (typeof children === "string") return children;
      return value;
    }, [children, textValue, value]);

    React.useEffect(() => {
      registerLabel(value, String(label));
    }, [label, registerLabel, value]);

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

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };

