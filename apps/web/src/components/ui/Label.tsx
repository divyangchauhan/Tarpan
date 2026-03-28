import { type LabelHTMLAttributes, type ReactNode } from 'react';

interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: ReactNode;
}

export function Label({ required, children, className = '', ...props }: LabelProps): JSX.Element {
  return (
    <label
      className={['block text-sm font-medium text-gray-700 mb-1', className].join(' ')}
      {...props}
    >
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
  );
}
