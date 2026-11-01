import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...values) => twMerge(clsx(values));
const variants = cva('button', {
  variants: {
    variant: {
      default: 'button-primary',
      outline: 'button-secondary',
      ghost: 'button-ghost',
    },
  },
  defaultVariants: { variant: 'default' },
});
export const Button = forwardRef(function Button(
  { asChild = false, variant, className, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      ref={ref}
      className={cn(variants({ variant }), className)}
      {...props}
    />
  );
});
