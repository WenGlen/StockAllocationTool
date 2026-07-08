/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';

interface NumberFieldProps {
  /** 實際數值（整數單位；若 scale=1000 則此為「股」，顯示為「張」） */
  value: number;
  /** 值變動時回傳「實際數值」 */
  onChange: (value: number) => void;
  /** 顯示值 = value / scale；回傳值 = round(輸入 × scale)。張數用 1000，其餘用 1 */
  scale?: number;
  /** 是否允許小數（價格用 true；股數/金額用 false） */
  allowDecimal?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

/**
 * 受控數字輸入框：
 * - 值為 0 時顯示「空白」，不會有刪不掉的 0（解決輸入 1 變成 01/10 的問題）
 * - 內部用字串暫存，允許中間狀態（空字串、"1."、"0.6"）
 * - 用 type=text + inputMode 取得數字鍵盤，避開 <input type=number> 的怪行為
 */
export default function NumberField({
  value,
  onChange,
  scale = 1,
  allowDecimal = false,
  className,
  placeholder,
  disabled,
  required,
}: NumberFieldProps) {
  const toDisplay = (v: number) => {
    if (!v) return ''; // 0 或 falsy → 空白
    const d = v / scale;
    return String(parseFloat(d.toFixed(6)));
  };

  const [text, setText] = useState<string>(toDisplay(value));
  const focused = useRef(false);

  // 外部值變動且非使用者輸入中時，同步顯示
  useEffect(() => {
    if (!focused.current) setText(toDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, scale]);

  const pattern = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  return (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      value={text}
      disabled={disabled}
      required={required}
      placeholder={placeholder ?? '0'}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(toDisplay(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.trim();
        if (raw !== '' && !pattern.test(raw)) return; // 擋掉非數字輸入
        setText(raw);
        if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
          onChange(0);
          return;
        }
        const parsed = parseFloat(raw);
        if (isNaN(parsed)) {
          onChange(0);
          return;
        }
        onChange(scale === 1 ? (allowDecimal ? parsed : Math.round(parsed)) : Math.round(parsed * scale));
      }}
      className={className}
    />
  );
}
