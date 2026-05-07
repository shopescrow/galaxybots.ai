import { motion, type Variants } from "framer-motion";
import { type ReactNode, useState, useEffect } from "react";

interface RevealWrapperProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  staggerChildren?: number;
  once?: boolean;
}

const desktopVariants: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0 },
};

const mobileVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}

export function RevealWrapper({
  children,
  delay = 0,
  duration = 0.6,
  className,
  staggerChildren = 0.12,
  once = true,
}: RevealWrapperProps) {
  const isMobile = useIsMobile();
  const variants = isMobile ? mobileVariants : desktopVariants;

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount: 0.15 }}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
        staggerChildren,
      }}
      variants={variants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface RevealItemProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function RevealItem({ children, className, delay = 0 }: RevealItemProps) {
  const isMobile = useIsMobile();
  const variants = isMobile ? mobileVariants : desktopVariants;

  return (
    <motion.div
      variants={variants}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
