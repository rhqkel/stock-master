"use client";
import { createContext, useContext, type InputHTMLAttributes } from 'react';

export const AmountPrivacy = createContext(false);
export const useAmountPrivacy = () => useContext(AmountPrivacy);
export function PrivateNumberInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const hidden = useAmountPrivacy();
  return <input {...props} type={hidden ? 'text' : 'number'} value={hidden ? '••••' : props.value}
    disabled={hidden || props.disabled} inputMode={hidden ? 'none' : props.inputMode}
    aria-label={hidden ? '숨겨진 금액 또는 수량' : props['aria-label']} autoComplete="off" />;
}
