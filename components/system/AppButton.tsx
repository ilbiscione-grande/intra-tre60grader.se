import { forwardRef } from 'react';
import type { ButtonProps } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type AppButtonProps = ButtonProps & {
  mobileFullWidth?: boolean;
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  ({ className, variant = 'default', size = 'default', mobileFullWidth = false, ...props }, ref) => {
    const shouldFillMobile = mobileFullWidth || variant === 'default';

    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          'min-h-action rounded-button text-sm font-medium',
          shouldFillMobile && 'w-full lg:w-auto',
          className
        )}
        {...props}
      />
    );
  }
);

AppButton.displayName = 'AppButton';
