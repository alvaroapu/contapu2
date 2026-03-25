import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface Props {
  value: number;
  editable?: boolean;
  onSave: (value: number) => void;
}

export function EditableCell({ value, editable, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  useEffect(() => { setTemp(String(value)); }, [value]);

  if (!editing) {
    return (
      <span
        className={`inline-block min-w-[2rem] text-center ${editable ? 'cursor-pointer rounded px-1 hover:bg-muted' : ''}`}
        onClick={() => editable && setEditing(true)}
      >
        {value}
      </span>
    );
  }

  const save = () => {
    const num = Math.max(0, parseInt(temp) || 0);
    if (num !== value) onSave(num);
    setEditing(false);
  };

  return (
    <Input
      ref={ref}
      type="number"
      min="0"
      value={temp}
      onChange={e => setTemp(e.target.value)}
      onBlur={save}
      onKeyDown={e => e.key === 'Enter' && save()}
      className="h-7 w-16 text-center"
    />
  );
}
