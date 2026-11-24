import {
  ProductLogo as BaseProductLogo,
  ProductMark,
  ProductWordmark as BaseProductWordmark,
} from '../../../design-system/src/components/product-logo';
import { useBrand } from '../hooks/useBrand';

/**
 * A marca do produto mora no pacote @tijucas/ui (design-system/). Aqui só se
 * liga o wordmark ao brand ativo, para a troca de empresa continuar valendo.
 */
export { ProductMark };

export function ProductWordmark({ className }: { className?: string }) {
  const { product } = useBrand();
  return (
    <BaseProductWordmark
      className={className}
      prefix={product.wordmark.prefix}
      accent={product.wordmark.accent}
    />
  );
}

export function ProductLogo(props: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  const { product } = useBrand();
  return (
    <BaseProductLogo
      {...props}
      prefix={product.wordmark.prefix}
      accent={product.wordmark.accent}
    />
  );
}
