import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
const variants=cva('button',{variants:{variant:{default:'button-default',outline:'button-outline',ghost:'button-ghost'},size:{default:'button-normal',sm:'button-small'}},defaultVariants:{variant:'outline',size:'default'}});
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>,VariantProps<typeof variants>{asChild?:boolean}
export const Button=React.forwardRef<HTMLButtonElement,ButtonProps>(({className,variant,size,asChild=false,...props},ref)=>{const Component=asChild?Slot:'button';return <Component ref={ref} className={twMerge(clsx(variants({variant,size}),className))} {...props}/>;});
Button.displayName='Button';
