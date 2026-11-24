import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('should render children and use primary style by default', () => {
    render(<Button>Salvar</Button>);
    const button = screen.getByRole('button', { name: 'Salvar' });

    expect(button).toBeInTheDocument();
    expect(button.className).toContain('from-primary');
  });

  it('should call click handler when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Enviar</Button>);

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should keep the ghost variant readable in dark mode', () => {
    render(<Button variant="ghost">Cancelar</Button>);
    const button = screen.getByRole('button', { name: 'Cancelar' });
    expect(button.className).toContain('text-primary');
    expect(button.className).toContain('dark:text-blue-300');
  });

  it('should apply full width class when fullWidth is true', () => {
    render(<Button fullWidth>Publicar</Button>);
    const button = screen.getByRole('button', { name: 'Publicar' });
    expect(button.className).toContain('w-full');
  });
});
