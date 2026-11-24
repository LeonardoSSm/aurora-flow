import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getNodeSections, groupIssuesBySection, type NodeSection } from './node-sections';
import { SectionNav } from './SectionNav';

const sections: NodeSection[] = [
  { id: 'a', label: 'Conteúdo', fields: ['title'], summary: (d) => String(d.title ?? '') },
  { id: 'b', label: 'Aprovadores', fields: ['approvers'], summary: () => '2 usuários' },
  { id: 'c', label: 'Modo', fields: [], summary: () => 'Paralelo' },
];

describe('groupIssuesBySection', () => {
  it('põe cada pendência na etapa do campo e as órfãs na primeira', () => {
    const grouped = groupIssuesBySection(sections, [
      { field: 'approvers', message: 'x' },
      { field: 'campo_sem_etapa', message: 'y' },
    ]);
    expect(grouped.a.map((i) => i.field)).toEqual(['campo_sem_etapa']);
    expect(grouped.b.map((i) => i.field)).toEqual(['approvers']);
    expect(grouped.c).toEqual([]);
  });

  it('tipo sem mapa de etapas cai numa etapa única implícita', () => {
    expect(getNodeSections('action_assign_responsible')).toEqual([
      expect.objectContaining({ id: 'config', implicit: true }),
    ]);
  });
});

describe('SectionNav', () => {
  it('mostra número na atual, ! + "Falta preencher" na pendente e o resumo nas demais', () => {
    const onSelect = vi.fn();
    render(
      <SectionNav
        sections={sections}
        activeId="a"
        issuesBySection={{ a: [], b: [{ field: 'approvers', message: 'x' }], c: [] }}
        d={{ title: 'Aprovação do gestor' }}
        summaryContext={{}}
        onSelect={onSelect}
      />,
    );

    const current = screen.getByRole('button', { current: 'step' });
    expect(current).toHaveTextContent('1Conteúdo');
    expect(current).toHaveTextContent('Aprovação do gestor');
    expect(screen.getByRole('button', { name: /Aprovadores/ })).toHaveTextContent(
      '!AprovadoresFalta preencher',
    );
    expect(screen.getByRole('button', { name: /Modo/ })).toHaveTextContent('Paralelo');

    fireEvent.click(screen.getByRole('button', { name: /Modo/ }));
    expect(onSelect).toHaveBeenCalledWith('c');
  });
});
