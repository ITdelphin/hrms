import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const ErrorText = ({ error }: { error?: string }) =>
  error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null;

interface BaseProps {
  label: string;
  error?: string;
  hint?: string;
}

export const TextField = forwardRef<HTMLInputElement, BaseProps & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, error, hint, id, ...rest }, ref) {
    const fieldId = id ?? rest.name;
    return (
      <div>
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
        <input id={fieldId} ref={ref} className={`input ${error ? 'border-red-400' : ''}`} {...rest} />
        {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        <ErrorText error={error} />
      </div>
    );
  },
);

export const SelectField = forwardRef<
  HTMLSelectElement,
  BaseProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }
>(function SelectField({ label, error, children, id, ...rest }, ref) {
  const fieldId = id ?? rest.name;
  return (
    <div>
      <label className="label" htmlFor={fieldId}>
        {label}
      </label>
      <select id={fieldId} ref={ref} className={`input ${error ? 'border-red-400' : ''}`} {...rest}>
        {children}
      </select>
      <ErrorText error={error} />
    </div>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextAreaField({ label, error, id, ...rest }, ref) {
    const fieldId = id ?? rest.name;
    return (
      <div>
        <label className="label" htmlFor={fieldId}>
          {label}
        </label>
        <textarea id={fieldId} ref={ref} className={`input ${error ? 'border-red-400' : ''}`} rows={3} {...rest} />
        <ErrorText error={error} />
      </div>
    );
  },
);
