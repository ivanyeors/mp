'use client';

import {
  motion,
  MotionValue,
  useMotionValue,
  useSpring,
  useTransform,
  type SpringOptions,
  type HTMLMotionProps,
  AnimatePresence,
} from 'framer-motion';
import {
  Children,
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

const DOCK_HEIGHT = 128;
const DEFAULT_MAGNIFICATION = 56;
const DEFAULT_DISTANCE = 150;
const DEFAULT_PANEL_HEIGHT = 64;

type DockProps = {
  children: React.ReactNode;
  className?: string;
  distance?: number;
  panelHeight?: number;
  magnification?: number;
  spring?: SpringOptions;
};
type DockItemProps = {
  children: React.ReactNode;
  isActive?: boolean;
} & Omit<HTMLMotionProps<'div'>, 'children'>;
type DockLabelProps = {
  className?: string;
  children: React.ReactNode;
};
type DockIconProps = {
  className?: string;
  children: React.ReactNode;
};

type DocContextType = {
  mouseX: MotionValue;
  spring: SpringOptions;
  magnification: number;
  distance: number;
};
type DockProviderProps = {
  children: React.ReactNode;
  value: DocContextType;
};

const DockContext = createContext<DocContextType | undefined>(undefined);

function DockProvider({ children, value }: DockProviderProps) {
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

function useDock() {
  const context = useContext(DockContext);
  if (!context) {
    throw new Error('useDock must be used within an DockProvider');
  }
  return context;
}

function Dock({
  children,
  className,
  spring = { mass: 0.1, stiffness: 150, damping: 12 },
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  panelHeight = DEFAULT_PANEL_HEIGHT,
}: DockProps) {
  const mouseX = useMotionValue(Infinity);
  const isHovered = useMotionValue(0);

  const maxHeight = useMemo(() => {
    return Math.max(DOCK_HEIGHT, magnification + magnification / 2 + 4);
  }, [magnification]);

  const heightRow = useTransform(isHovered, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(heightRow, spring);

  return (
    <motion.div
      style={{
        height: height,
        scrollbarWidth: 'none',
      }}
      className='mx-2 flex max-w-full items-end overflow-x-auto'
    >
      <motion.div
        onMouseMove={({ pageX }) => {
          isHovered.set(1);
          mouseX.set(pageX);
        }}
        onMouseLeave={() => {
          isHovered.set(0);
          mouseX.set(Infinity);
        }}
        className={cn(
          // Phones carry page actions here too, so the pill is tighter below `md`:
          // gap-4/px-4 fits three items on a 390px screen, gap-2/px-3 fits six.
          'mx-auto flex w-fit gap-2 md:gap-4 rounded-[35px] px-3 md:px-4 relative',
          className
        )}
        style={{ 
          height: panelHeight,
        }}
        role='toolbar'
        aria-label='Application dock'
      >
        {/* Same blue pill in light and dark mode */}
        <div
          className="absolute inset-0 rounded-[35px] -z-10"
          style={{
            backgroundImage: "linear-gradient(rgb(0, 23, 54) 0%, rgb(43, 105, 188) 100%), linear-gradient(90deg, rgb(7, 55, 120) 0%, rgb(7, 55, 120) 100%)"
          }}
        />
        {/* Inner shadow */}
        <div
          className="absolute inset-0 pointer-events-none rounded-[35px] -z-10"
          style={{
            boxShadow: "inset 1px 1px 1.8px 0px rgba(194, 220, 255, 0.5), inset -4px 13px 28.4px 0px rgba(102, 167, 255, 0.5)"
          }}
        />
        <DockProvider value={{ mouseX, spring, distance, magnification }}>
          {children}
        </DockProvider>
        </motion.div>
    </motion.div>
  );
}

const DockItem = forwardRef<HTMLDivElement, DockItemProps>(function DockItem(
  { children, className, isActive = false, tabIndex, role, ...props },
  forwardedRef
) {
  const localRef = useRef<HTMLDivElement>(null);

  const setRefs = (node: HTMLDivElement | null) => {
    localRef.current = node;
    if (!forwardedRef) return;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const { distance, magnification, mouseX, spring } = useDock();

  const isHovered = useMotionValue(0);

  const mouseDistance = useTransform(mouseX, (val) => {
    const domRect = localRef.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - domRect.x - domRect.width / 2;
  });

  const widthTransform = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [40, magnification, 40]
  );

  const width = useSpring(widthTransform, spring);

  return (
    <motion.div
      ref={setRefs}
      style={{ width }}
      onHoverStart={() => isHovered.set(1)}
      onHoverEnd={() => isHovered.set(0)}
      onFocus={() => isHovered.set(1)}
      onBlur={() => isHovered.set(0)}
      className={cn(
        'relative inline-flex items-center justify-center',
        isActive && 'bg-blue-600',
        className
      )}
      tabIndex={tabIndex ?? 0}
      role={role ?? "button"}
      aria-haspopup={props["aria-haspopup"] ?? "true"}
      {...props}
    >
      {Children.map(children, (child) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cloneElement(child as React.ReactElement<any>, { width, isHovered })
      )}
    </motion.div>
  );
});

function DockLabel({ children, className, ...rest }: DockLabelProps) {
  const restProps = rest as Record<string, unknown>;
  const isHovered = restProps['isHovered'] as MotionValue<number>;
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const unsubscribe = isHovered.on('change', (latest) => {
      setIsVisible(latest === 1);
    });

    return () => unsubscribe();
  }, [isHovered]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: 1, y: -10 }}
          exit={{ opacity: 0, y: 0 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'absolute -top-6 left-1/2 w-fit whitespace-pre rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs text-neutral-700 dark:border-neutral-900 dark:bg-neutral-800 dark:text-white',
            className
          )}
          role='tooltip'
          style={{ x: '-50%' }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DockIcon({ children, className, ...rest }: DockIconProps) {
  const restProps = rest as Record<string, unknown>;
  const width = restProps['width'] as MotionValue<number>;

  const widthTransform = useTransform(width, (val) => val / 2);

  return (
    <motion.div
      style={{ width: widthTransform }}
      className={cn('flex items-center justify-center', className)}
    >
      {children}
    </motion.div>
  );
}


export { Dock, DockIcon, DockItem, DockLabel };