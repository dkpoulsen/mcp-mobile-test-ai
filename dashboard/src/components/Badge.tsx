import { cn, getStatusColor } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'status';
  status?: string;
  className?: string;
}

export function Badge({ children, variant = 'default', status, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'status' && status ? getStatusColor(status) : 'bg-gray-100 text-gray-800',
        className
      )}
    >
      {children}
    </span>
  );
}
