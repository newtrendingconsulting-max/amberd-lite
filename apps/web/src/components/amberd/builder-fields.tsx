'use client';

import { ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

export const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';

export const Field = ({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) => {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children(id)}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
};

export const TextInput = ({
  label,
  value,
  onChange,
  hint,
  error,
  placeholder,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) => (
  <Field label={label} hint={hint} error={error} className={className}>
    {(id) => (
      <input
        id={id}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    )}
  </Field>
);

export const NumberInput = ({
  label,
  value,
  onChange,
  hint,
  error,
  step = 1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  error?: string;
  step?: number;
  min?: number;
  max?: number;
}) => (
  <Field label={label} hint={hint} error={error}>
    {(id) => (
      <input
        id={id}
        type="number"
        className={inputClass}
        value={Number.isFinite(value) ? value : ''}
        step={step}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))}
      />
    )}
  </Field>
);

export const SelectInput = <T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  className,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  hint?: ReactNode;
  error?: string;
  className?: string;
}) => (
  <Field label={label} hint={hint} error={error} className={className}>
    {(id) => (
      <select id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    )}
  </Field>
);

export const TextArea = ({
  label,
  value,
  onChange,
  rows = 4,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  hint?: ReactNode;
  error?: string;
}) => (
  <Field label={label} hint={hint} error={error}>
    {(id) => (
      <textarea
        id={id}
        rows={rows}
        className={cn(inputClass, 'font-normal leading-relaxed')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    )}
  </Field>
);

export const CheckboxChip = ({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) => (
  <label
    className={cn(
      'inline-flex cursor-pointer select-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-blue-500/30',
      checked
        ? 'border-blue-600 bg-blue-50 text-blue-700'
        : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400',
      disabled && 'cursor-not-allowed opacity-50',
    )}
  >
    <input
      type="checkbox"
      className="sr-only"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
    />
    {children}
  </label>
);

export const SectionCard = ({
  id,
  index,
  title,
  description,
  badge,
  children,
  errorCount = 0,
}: {
  id: string;
  index: string;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  errorCount?: number;
}) => (
  <section
    id={id}
    className={cn(
      'scroll-mt-24 rounded-xl border bg-white shadow-sm dark:bg-slate-900',
      errorCount ? 'border-red-300' : 'border-slate-200 dark:border-slate-700',
    )}
  >
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0b1733] text-[11px] font-semibold text-white">
          {index}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {errorCount > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            {errorCount} issue{errorCount === 1 ? '' : 's'}
          </span>
        )}
        {badge}
      </div>
    </header>
    <div className="space-y-4 p-5">{children}</div>
  </section>
);
