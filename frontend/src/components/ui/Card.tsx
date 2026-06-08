import { type ReactNode, type ElementType, type ComponentPropsWithoutRef } from 'react';

type CardProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  hover?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

export default function Card<T extends ElementType = 'div'>({
  as, children, className = '', hover = false, ...rest
}: CardProps<T>) {
  const Comp = as || 'div';
  return (
    <Comp
      className={`card ${hover ? 'transition-colors hover:border-line-strong' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Comp>
  );
}
