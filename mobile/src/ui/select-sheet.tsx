import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Input, PickerTrigger } from './inputs';
import { Button, Txt } from './primitives';
import { Sheet, SheetOption } from './sheet';
import { spacing, useTheme } from './theme';

export type SelectOption = { value: string; label: string; description?: string; color?: string; disabled?: boolean };

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lista suspensa em folha: busca quando passa de 8 opções; múltipla com "Pronto". */
export function SelectSheet({
  title,
  options,
  value,
  onChange,
  multiple,
  placeholder = 'Selecione…',
  invalid,
  disabled,
}: {
  title: string;
  options: SelectOption[];
  value: string | string[] | null;
  onChange: (next: string | string[] | null) => void;
  multiple?: boolean;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(
    () => new Set(Array.isArray(value) ? value : value ? [value] : []),
    [value],
  );
  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((option) => normalize(option.label).includes(q)) : options;
  }, [options, query]);

  const summary = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label)
    .join(', ');

  function toggle(optionValue: string) {
    if (!multiple) {
      onChange(optionValue);
      setOpen(false);
      setQuery('');
      return;
    }
    const next = new Set(selected);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    onChange(options.filter((option) => next.has(option.value)).map((option) => option.value));
  }

  return (
    <>
      <PickerTrigger
        value={summary || null}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        invalid={invalid}
        disabled={disabled}
        accessibilityLabel={title}
      />
      <Sheet
        visible={open}
        onClose={() => {
          setOpen(false);
          setQuery('');
        }}
        title={title}
        subtitle={multiple ? 'Marque quantas quiser' : undefined}
        footer={
          multiple ? (
            <>
              {selected.size > 0 ? (
                <Button label="Limpar" variant="outline" onPress={() => onChange([])} style={{ flex: 1 }} />
              ) : null}
              <Button label="Pronto" onPress={() => setOpen(false)} style={{ flex: 2 }} />
            </>
          ) : undefined
        }
      >
        {options.length > 8 ? (
          <View style={{ marginBottom: spacing.sm }}>
            <Input icon="search" placeholder="Buscar" value={query} onChangeText={setQuery} autoCorrect={false} />
          </View>
        ) : null}
        {filtered.length === 0 ? (
          <Txt variant="small" color={colors.textMuted} align="center" style={{ paddingVertical: spacing.lg }}>
            Nada encontrado.
          </Txt>
        ) : (
          filtered.map((option) => (
            <SheetOption
              key={option.value}
              label={option.label}
              description={option.description}
              tone={option.color}
              disabled={option.disabled}
              selected={selected.has(option.value)}
              onPress={() => toggle(option.value)}
            />
          ))
        )}
        {!multiple && selected.size > 0 ? (
          <Button
            label="Limpar escolha"
            variant="ghost"
            onPress={() => {
              onChange(null);
              setOpen(false);
            }}
          />
        ) : null}
      </Sheet>
    </>
  );
}
