import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEscapeKey } from './use-escape-key';

function Layer({ onClose, enabled = true }: { onClose: () => void; enabled?: boolean }) {
  useEscapeKey(onClose, enabled);
  return null;
}

/** Card com modal filho: o pai desliga o próprio Esc enquanto o filho está aberto. */
function CardWithChild({ onCard, onChild }: { onCard: () => void; onChild: () => void }) {
  const [child, setChild] = useState(true);
  return (
    <>
      <Layer onClose={onCard} enabled={!child} />
      {child ? (
        <Layer
          onClose={() => {
            onChild();
            setChild(false);
          }}
        />
      ) : null}
    </>
  );
}

describe('useEscapeKey — pilha de modais', () => {
  it('Esc fecha só o modal de cima; o seguinte fecha o de baixo', () => {
    const onCard = vi.fn();
    const onChild = vi.fn();
    render(<CardWithChild onCard={onCard} onChild={onChild} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onChild).toHaveBeenCalledTimes(1);
    expect(onCard).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCard).toHaveBeenCalledTimes(1);
  });

  it('desligado (salvando) não reage; outra tecla não fecha', () => {
    const onClose = vi.fn();
    render(<Layer onClose={onClose} enabled={false} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
