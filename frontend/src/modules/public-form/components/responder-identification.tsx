import type { CSSProperties } from 'react';

/**
 * Bloco de identificação de quem responde (nome e e-mail), o mesmo no formulário público e na
 * prévia do construtor: entrada obrigatória, "Respondendo como" e o bloco opcional.
 */

/** Separa os blocos do cartão; igual ao do formulário público. */
const BLOCK_DIVIDER: CSSProperties = { borderTop: '1px solid var(--tf-border)', paddingTop: 16 };

const BUTTON: CSSProperties = { height: 36, padding: '0 18px', borderRadius: 8, fontSize: 13 };
const identInputStyle: CSSProperties = {
  height: 36,
  minWidth: 0,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--tf-border)',
  background: 'var(--tf-background)',
  fontSize: 13,
  color: 'var(--tf-text)',
};

/** Nome ou e-mail do bloco de identificação, com a mensagem de erro logo abaixo. */
export function IdentificationInput({
  type,
  value,
  onChange,
  placeholder,
  label,
  required,
  error,
}: {
  type: 'text' | 'email';
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  required: boolean;
  error?: string;
}) {
  const errorId = `ident-${type}-error`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--tf-primary)]/30"
        style={error ? { ...identInputStyle, border: '1px solid var(--tf-danger)' } : identInputStyle}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-semibold" style={{ color: 'var(--tf-danger)', margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tela de entrada da "Identificação obrigatória": nenhuma pergunta aparece antes de a pessoa
 * informar nome e e-mail e continuar. Enter no campo também continua.
 */
export function IdentificationGate({
  name,
  email,
  errors,
  onNameChange,
  onEmailChange,
  onConfirm,
}: {
  name: string;
  email: string;
  errors: { responderName?: string; responderEmail?: string };
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <form
      aria-label="Identificação"
      className="flex flex-col gap-3.5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm();
      }}
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-bold" style={{ fontSize: 15, color: 'var(--tf-text)', margin: 0 }}>
          Antes de começar, identifique-se
        </h2>
        <p style={{ fontSize: 13, color: 'var(--tf-text-muted)', margin: 0, lineHeight: 1.5 }}>
          Para responder este formulário é obrigatório informar seu nome e e-mail. As perguntas
          aparecem logo depois.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2">
        <IdentificationInput
          type="text"
          value={name}
          onChange={onNameChange}
          placeholder="Seu nome"
          label="Seu nome"
          required
          error={errors.responderName}
        />
        <IdentificationInput
          type="email"
          value={email}
          onChange={onEmailChange}
          placeholder="seuemail@empresa.com"
          label="Seu e-mail"
          required
          error={errors.responderEmail}
        />
      </div>
      <div className="flex justify-end" style={BLOCK_DIVIDER}>
        <button
          type="submit"
          className="font-bold transition-[filter] hover:brightness-95"
          style={{ ...BUTTON, background: 'var(--tf-primary)', color: '#fff', border: 'none' }}
        >
          Começar a responder
        </button>
      </div>
    </form>
  );
}

/** Depois da entrada: quem está respondendo, discreto, com "Trocar" para voltar à entrada. */
export function RespondingAs({ name, email, onChange }: { name: string; email: string; onChange: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5" style={{ fontSize: 12, color: 'var(--tf-text-muted)', margin: 0 }}>
      <span>
        Respondendo como <strong style={{ color: 'var(--tf-text)' }}>{name}</strong> · {email}
      </span>
      <button
        type="button"
        onClick={onChange}
        className="font-semibold underline transition-colors hover:text-[color:var(--tf-text)]"
        style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--tf-primary)' }}
      >
        Trocar
      </button>
    </p>
  );
}

/** Identificação opcional, acima das perguntas: nome e e-mail sem obrigação. */
export function OptionalIdentification({
  name,
  email,
  errors,
  onNameChange,
  onEmailChange,
}: {
  name: string;
  email: string;
  errors: { responderName?: string; responderEmail?: string };
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span
        className="font-bold uppercase"
        style={{ fontSize: 11, letterSpacing: '0.05em', color: 'var(--tf-text-muted)' }}
      >
        Identificação{' '}
        <span className="font-medium normal-case" style={{ letterSpacing: 0 }}>
          (opcional)
        </span>
      </span>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
        <IdentificationInput
          type="text"
          value={name}
          onChange={onNameChange}
          placeholder="Seu nome"
          label="Seu nome"
          required={false}
          error={errors.responderName}
        />
        <IdentificationInput
          type="email"
          value={email}
          onChange={onEmailChange}
          placeholder="seuemail@empresa.com"
          label="Seu e-mail"
          required={false}
          error={errors.responderEmail}
        />
      </div>
    </div>
  );
}
