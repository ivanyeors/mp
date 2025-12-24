"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SelectContextValue = {
  value?: string;
  setValue: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
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
      labels,
      registerLabel,
      closeOnSelect,
    }),
    [closeOnSelect, labels, open, setValue, value],
  );

  return (
    <SelectContext.Provider value={contextValue}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {children}
      </DropdownMenu>
    </SelectContext.Provider>
  );
}

type SelectTriggerProps = React.ComponentPropsWithoutRef<typeof Button>;

const SelectTrigger = React.forwardRef<HTMLButtonElement, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open } = useSelectContext();
    return (
      <DropdownMenuTrigger asChild>
        <Button
          ref={ref}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("flex min-w-[12rem] items-center justify-between", className)}
          {...props}
        >
          <span className="flex-1 truncate text-left">{children}</span>
          <ChevronDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
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
>(({ className, ...props }, ref) => {
  return (
    <DropdownMenuContent
      ref={ref}
      className={cn("w-[var(--select-trigger-width,16rem)]", className)}
      {...props}
    />
  );
});
SelectContent.displayName = "SelectContent";

type SelectItemProps = React.ComponentPropsWithoutRef<typeof DropdownMenuItem> & {
  value: string;
  textValue?: string;
};

const SelectItem = React.forwardRef<React.ElementRef<typeof DropdownMenuItem>, SelectItemProps>(
  ({ children, value, className, disabled, textValue, ...props }, ref) => {
    const { setValue, setOpen, registerLabel, closeOnSelect } = useSelectContext();

    const label = React.useMemo(() => {
      if (typeof textValue === "string") return textValue;
      if (typeof children === "string") return children;
      return value;
    }, [children, textValue, value]);

    React.useEffect(() => {
      registerLabel(value, String(label));
    }, [label, registerLabel, value]);

    return (
      <DropdownMenuItem
        ref={ref}
        data-value={value}
        disabled={disabled}
        className={cn("cursor-pointer", className)}
        onSelect={(event) => {
          event.preventDefault();
          if (disabled) return;
          setValue(value);
          if (closeOnSelect) {
            setOpen(false);
          }
        }}
        {...props}
      >
        {children}
      </DropdownMenuItem>
    );
  },
);
SelectItem.displayName = "SelectItem";

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };

