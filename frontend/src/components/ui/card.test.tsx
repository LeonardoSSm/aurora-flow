import { render, screen } from '@testing-library/react';
import { Card } from './card';

describe('Card', () => {
  it('should render children content', () => {
    render(
      <Card>
        <p>Conteudo do card</p>
      </Card>,
    );

    expect(screen.getByText('Conteudo do card')).toBeInTheDocument();
  });

  it('should merge custom className', () => {
    render(
      <Card className="custom-class">
        <p>Item</p>
      </Card>,
    );

    const card = screen.getByText('Item').closest('div');
    expect(card?.className).toContain('custom-class');
  });
});
