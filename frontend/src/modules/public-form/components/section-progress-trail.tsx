export function SectionProgressTrail({ current, total }: { current: number; total: number }) {
  // Uma etapa só não tem progresso a mostrar.
  if (total <= 1) return null;
  return (
    <div className="flex items-center">
      {Array.from({ length: total }).map((_, index) => {
        const done = index < current;
        const isCurrent = index === current;
        const showLine = index < total - 1;
        return (
          <div
            key={index}
            className="flex items-center"
            style={{ flex: showLine ? '1 1 0%' : '0 0 auto' }}
          >
            <div
              className="flex shrink-0 items-center justify-center rounded-full font-extrabold"
              style={{
                width: 24,
                height: 24,
                fontSize: 11,
                background: done ? 'var(--tf-primary)' : isCurrent ? 'var(--tf-surface)' : 'var(--tf-border)',
                color: done ? '#fff' : isCurrent ? 'var(--tf-primary)' : '#9CA3AF',
                border: isCurrent ? '2px solid var(--tf-secondary)' : '2px solid transparent',
              }}
            >
              {done ? '✓' : index + 1}
            </div>
            {showLine ? (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  margin: '0 6px',
                  background: done ? 'var(--tf-primary)' : '#DCE3F5',
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
